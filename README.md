# Carieeer — CodeRefine Qualification 2

Carieeer connects candidates with suitable jobs and helps them work toward their next role. This submission designs the system around one essential promise: an application is recorded once, moves through a controlled pipeline, and remains correct even when search, matching, or notification services are unavailable.

**Design submission, not a deployed product.** The repository contains contracts, consistency algorithms, capacity calculations, editable Excalidraw diagrams, and reproducible diagram/structural checks. Performance figures are proposed targets, not benchmark results.

## Overview and goals / scope

Candidates maintain profiles, discover jobs, apply, receive recommendations, and follow skill roadmaps. Employers manage company jobs, discover consenting candidates, and progress applications. Matching and skill analysis are external domain capabilities with defined interfaces; their algorithms are outside scope.

The backend is a **modular monolith plus independently scaled background workers**. PostgreSQL owns business truth. OpenSearch owns derived discovery documents. RabbitMQ decouples background work. Redis accelerates disposable reads. Private object storage holds uploaded files.

## Assumptions

- One home region with three availability zones; no active-active writes across regions.
- Planning envelope: 1 million candidates, 20,000 employer users, 10,000 companies, 100,000 live jobs, 100,000 DAU. See [calculations](ESTIMATION.md).
- An employer is a company membership, not a separate login. A user may have both a candidate profile and employer memberships.
- One application per candidate/job for the job's lifetime. Rejection does not permit reapplication; employers create a new job for a new requisition.
- `Offer` and `Rejected` are terminal in this scope. Offer acceptance, hiring, withdrawal, scheduling, billing, chat, and an LMS are excluded.
- Candidate discovery requires explicit consent. Applicants share an immutable, minimal application snapshot with the hiring company.

## Functional requirements

| Capability | Required behavior |
|---|---|
| Identity and profiles | Sign in; edit skills, experience, education, goals, portfolio, and visibility |
| Employers and jobs | Company roles, draft/publish/update/close jobs, structured requirements and compensation |
| Discovery | Keyword, skills, experience, location, work mode, and pay filters; consenting candidate expertise search; saved jobs |
| Matching | Persist ranked recommendations from a black-box engine; expose freshness and refresh status |
| Applications | Exactly one record per candidate/job; retry-safe submit; candidate tracking and employer pipeline |
| Pipeline | `Applied → Screened → Interview → Offer`; rejection from Applied, Screened, or Interview |
| Career growth | Target-role skill gaps, priorities, roadmaps, milestones, and recomputation |
| Notifications | In-app and optional email/push for matches, status changes, and milestones, honoring preferences |

[Detailed requirements and acceptance criteria](docs/requirements.md) · [Requirements diagram](diagrams/requirements.excalidraw)

## Non-functional requirements

| Target | Carieeer-specific commitment |
|---|---|
| Availability | 99.9% monthly core API success; derived-service failures must not block application submission |
| Performance | p95 profile/detail reads <200 ms, application/status writes <300 ms, search <500 ms server-side |
| Scalability | Design for roughly 930 peak public API requests/s and 100 peak candidate-ranking tasks/s |
| Consistency | Strong application uniqueness and transitions; search p95 freshness ≤60 s, matches p95 ≤15 min under normal load |
| Durability | RPO 0 for acknowledged writes under a single-AZ failure; regional disaster RPO ≤5 min, RTO ≤60 min |
| Security/privacy | Per-company authorization, candidate visibility checks, private files, audited hiring changes |
| Reliability | Transactional outbox, at-least-once work, bounded retries, reconciliation, and failure isolation |
| Observability | API SLO burn, queue age, projection lag, matching staleness, delivery outcomes, and correlation IDs |
| Maintainability | Domain-owned tables/contracts, one migration pipeline, backward-compatible events, no cross-module ad hoc writes |

Targets, error budgets, measurement boundaries, and degradation behavior are defined in [requirements](docs/requirements.md).

## Data model

PostgreSQL holds normalized profiles, employer memberships, jobs, applications and append-only history. Versioned recommendation sets and skill analyses are persisted but remain recomputable. Constraints protect invariants; cache locks are never the uniqueness mechanism.

![Data model](diagrams/exports/data-model.svg)

[Entity catalog, cardinality and indexes](docs/data-model.md) · [Executable core SQL](docs/schema-core.sql)

## API design

REST under `/v1`; OIDC login; scoped authorization; cursor pagination; `Idempotency-Key` on retryable commands; `If-Match` on updates. The apply transaction binds caller identity to candidate identity and checks authoritative job state. Invalid transitions and stale versions are explicit errors.

[Endpoint requests, responses and errors](docs/api-design.md) · [API diagram](diagrams/api-design.excalidraw)

## High-level architecture

![High-level architecture](diagrams/exports/architecture.svg)

Keep identity/access, talent profiles, employers/jobs, applications, discovery/matching, career growth, and notification preferences as modules in one backend deployment. Move expensive and unreliable work to worker pools. This preserves local transactions without requiring a distributed transaction for an application.

[Boundaries, deployment and ownership](docs/architecture.md)

## Critical flows

![Critical flows](diagrams/exports/flows.svg)

Publication commits the job and outbox event together. Independent indexing and matching subscriptions consume the event; matching never waits for the search projection to catch up. Applying commits the application, initial history, idempotency response, and outbox event together. Notification delivery happens later.

[Flow algorithms, race cases and matching contracts](docs/flows.md)

## Deep dives

The most important decisions are defended in [DEEP_DIVES.md](DEEP_DIVES.md): relational storage and indexes, read scaling, cache failure, search rebuilds, broker semantics, matching generations, application races, idempotency, notifications, backpressure, recovery, observability, and privacy. Each discussion covers the problem, scale concern, design, technology, consistency, failure modes, trade-offs, and rationale.

## Scalability

Start with a managed HA PostgreSQL cluster, a small API fleet across zones, bounded worker pools, and managed search/broker infrastructure. Scale API replicas by CPU and latency; workers by oldest eligible task age and dependency quotas. Add read replicas only for stale-tolerant reads. Do not shard at this envelope. [Estimates](ESTIMATION.md) identify measurements that would justify the next step.

## Reliability / failure handling

Search failures return a retryable discovery error; saved jobs and known job details remain available. Matching outages preserve eligible older recommendations with a stale label. Broker outages accumulate durable outbox entries. Notification outages leave application commits unaffected. Database unavailability rejects writes; never acknowledge an application buffered only in memory. See [recovery decisions](DEEP_DIVES.md#15-failure-recovery).

## Security

OIDC authentication, server-side role checks, mandatory company scope, candidate consent, private signed file URLs, malware scanning, TLS, encryption at rest, quotas, and redacted audits protect hiring data. A revoked profile is filtered on authoritative reads even while index removal is pending. [Security design](DEEP_DIVES.md#17-security-and-privacy)

## Back-of-the-envelope estimation

At the planning envelope: 8 million public API requests/day ≈93 average QPS and 930 peak QPS; 50,000 applications/day; 500,000 ranking tasks/day; 600,000 logical notifications/day. Hot relational storage is approximately 241 GB including a simple index/bloat allowance; provision ~500 GB usable for headroom. [Full calculations and sensitivity](ESTIMATION.md)

## Trade-offs

- A modular monolith reduces coordination and operational cost but requires enforced module ownership.
- PostgreSQL transactions simplify hiring correctness; a single writer imposes a measured scaling boundary.
- Eventual search/match freshness keeps writes fast but needs user-visible timestamps and repair jobs.
- RabbitMQ fits work queues and fan-out at this volume; long-term replay comes from retained outbox data and database rebuilds, not a broker log.
- Bounded matching shortlists control cost but may miss candidates. Measure coverage and rotate exploration; never claim exhaustive matching.
- External email can occasionally duplicate after an ambiguous provider response. Exactly-once user-visible delivery is not promised.

## Repository structure

```text
README.md
DEEP_DIVES.md
ESTIMATION.md
docs/
  requirements.md
  data-model.md
  schema-core.sql
  api-design.md
  architecture.md
  flows.md
  judge-audit.md
  sources.md
diagrams/
  {requirements,data-model,api-design,architecture,flows}.excalidraw
  exports/                    # SVG and PNG previews
  mcp/                        # exact MCP input scenes and checkpoint receipts
scripts/
  build-diagrams.mjs
  validate.mjs
  export-png.mjs
  test-schema.mjs
package.json
package-lock.json
```

## Diagram index

| Diagram | Editable | Preview |
|---|---|---|
| Requirements | [Excalidraw](diagrams/requirements.excalidraw) | [SVG](diagrams/exports/requirements.svg) · [PNG](diagrams/exports/requirements.png) |
| Data model | [Excalidraw](diagrams/data-model.excalidraw) | [SVG](diagrams/exports/data-model.svg) · [PNG](diagrams/exports/data-model.png) |
| API design | [Excalidraw](diagrams/api-design.excalidraw) | [SVG](diagrams/exports/api-design.svg) · [PNG](diagrams/exports/api-design.png) |
| Architecture | [Excalidraw](diagrams/architecture.excalidraw) | [SVG](diagrams/exports/architecture.svg) · [PNG](diagrams/exports/architecture.png) |
| Flows | [Excalidraw](diagrams/flows.excalidraw) | [SVG](diagrams/exports/flows.svg) · [PNG](diagrams/exports/flows.png) |

All five scenes were created using the installed Excalidraw MCP. Standard editable files and deterministic SVG previews use the same scene definitions; PNGs are rasterized from those SVGs. The MCP provides interactive rendering/checkpoints, not a native file-export API. See [judge audit](docs/judge-audit.md) for validation evidence and limitations and [technical references](docs/sources.md) for mechanism documentation.

To reproduce: `npm ci --ignore-scripts`, then `npm run diagrams`, `npm run validate`, and `npm run test:sql`. Node.js 20+ is recommended. The SQL checks use embedded PostgreSQL (PGlite) to exercise the consistency kernel; they do not implement a full backend or replace multi-session concurrency/load tests. The generator recreates the original scene files, so save manual Excalidraw edits separately before regenerating.
