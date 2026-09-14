# Final judge audit

Review date: 2026-09-14. This is a self-audit against the supplied rubric, not an official competition score or a production certification.

## Rubric assessment

| Area | Weight | Evidence | Assessment |
|---|---:|---|---|
| Functional + non-functional requirements | 10% | [Requirements](requirements.md), [scene](../diagrams/requirements.excalidraw) | Complete scope with acceptance criteria, latency/availability/freshness boundaries and explicit product assumptions |
| Data model | 20% | [Catalog](data-model.md), [SQL kernel](schema-core.sql), [scene](../diagrams/data-model.excalidraw) | Core entities, FK/cardinality, unique constraints, query indexes, snapshots, generations and reliability records covered |
| API design | 20% | [Contracts](api-design.md), [scene](../diagrams/api-design.excalidraw) | Representative requests/responses, authorization, validation, pagination, errors and concurrency contract covered |
| High-level architecture | 25% | [Architecture](architecture.md), [scene](../diagrams/architecture.excalidraw), [flows](flows.md) | Clear module ownership and deployment boundaries; sync hiring path isolated from asynchronous derived work |
| Deep dives | 25% | [18 decision discussions](../DEEP_DIVES.md) | Each covers problem, scale, design, technology, consistency, failures, trade-offs and rationale |
| Estimation | Bonus | [Calculations](../ESTIMATION.md) | Public QPS, engine tasks versus pair inputs, derived-write churn, notifications, storage/retention and recovery throughput |

**Judge-style verdict:** A strong senior-level design submission, particularly in application correctness, failure isolation, bounded matching cost and privacy under stale projections. It is ready for design judging. The principal remaining uncertainty is empirical: engine quality/latency, database performance under match churn, and recovery targets require actual deployment tests. A numerical score would depend on the judges' interpretation of diagram detail and implementation expectations; this repository does not claim a full deployed product.

## Functional traceability

| Requirement | Data | API | Module / flow |
|---|---|---|---|
| F1 Identity | User, Employer | auth routes, GET /me | Access / OIDC |
| F2 Complete candidate profile | CandidateProfile, CandidateSkill, Education, Experience, PortfolioItem, CareerGoal, FileObject | GET/PATCH profile, file upload/scan | Talent |
| F3 Company/employer | Company, Employer | companies, employer membership PUT | Employers/jobs |
| F4 Job lifecycle | Job, JobSkill, OutboxEvent | create/edit/publish/close | Publication flow |
| F5 Search | Skill, authoritative profiles/jobs + derived documents | job/candidate search and detail | Discovery / indexing |
| F6 Save | SavedJob | saved-job GET/PUT/DELETE | Talent |
| F7 Matching | MatchSet, Match, RecomputeTask | own matches, refresh, employer reverse matches | Black-box matching flow |
| F8 Apply | Application, IdempotencyRecord, history, outbox | submit, own applications | Application transaction |
| F9 Pipeline | Application version/status, history | status PATCH + If-Match | Transition transaction |
| F10 Skill gap | TargetRole, TargetRoleSkill, SkillGap | target roles, analyze, owned task polling | Career worker |
| F11 Roadmap/milestones | Roadmap, Milestone | adopt/view/complete | Career growth + milestone event |
| F12 Notifications | Notification, Preference, Delivery | inbox/read/preferences | Planner and send workers |

All nine NFR categories appear in requirements, README and requirements scene: availability, scalability, latency, consistency, durability, security/privacy, reliability, observability and maintainability. The architecture contains all functional domains; grouping modules does not remove responsibilities.

## Correctness review and fixes

- **Application uniqueness:** Permanent candidate/job unique constraint, transaction, server-derived identity and command receipts complement each other; expiration of a receipt cannot permit a second application.
- **Conflicting commands:** Job SHARE versus close UPDATE locks define publication eligibility order. Optimistic application version rejects concurrent recruiter overwrite. Current locked membership prevents authorization races with role revocation.
- **State graph:** Applied → Screened → Interview → Offer; Rejected only from the first three; both terminal outcomes remain terminal. No silent skip/reapply semantics.
- **Atomic events:** Outbox, history and response receipt share the domain commit. Relay publishes before marking; consumer ack follows durable effect. No unqualified exactly-once delivery claim.
- **Matching boundary:** Inputs/outputs only; no invented ML internals. Generation fencing, bounded fan-out, persistence, cache identity, pagination, stale handling and retries are specified.
- **Freshness correction:** The 15-minute match SLO is trigger-to-ready delay. Daily refresh is a separate 24-hour age policy, avoiding a contradictory requirement to recompute all users every 15 minutes.
- **Search truth and privacy:** Derived index uses full snapshots and versions; authoritative hydration filters revoked candidates and closed jobs. Tombstones and snapshot/change-capture reindexing prevent stale resurrection.
- **Notifications:** Async, preference-controlled, deduped logical inbox plus independent delivery states; provider acceptance ambiguity and replay beyond dedupe retention are explicitly handled.
- **Estimates:** 8M public requests/day ≈92.6/s; 10×≈926/s. Logical DB subtotal 133.72 GB ×1.8≈240.70 GB. Match row churn is separate from retained footprint and public API QPS.
- **Diagrams:** Five real MCP scenes; consistent shapes and line semantics in architecture; concise labeled cards; relation cardinalities documented. Overview groups profile child entities; the catalog provides full detail. Visual review corrected a disconnected matching branch and added explicit worker-to-DB/search writes.

## Executed validation

- `npm run diagrams`: builds five standard Excalidraw v2 JSON files, exact MCP input scenes, five SVGs, and five 2400×1800 PNG previews.
- Excalidraw MCP `create_view`: successfully rendered all five scenes; [checkpoint receipts](../diagrams/mcp/checkpoints.json) retain evidence. Updated architecture/flow scenes were rendered again after the visual correction.
- `npm run validate`: checks all Markdown repository-relative targets/anchors, five scene/checkpoint pairs, unique element IDs, text bindings, labeled shapes, font minimums, ten nonempty exports and core API terms.
- `npm run test:sql`: 15 checks against the executable SQL using embedded PostgreSQL/PGlite. Checks cover initial state, tenant FK mismatch, duplicate insert, forbidden skip, invalid version, history update/delete prevention, transaction rollback, valid forward progression, stale compare-and-swap, terminal rejection prevention and snapshot immutability.
- All five PNGs were visually inspected for clipping, readable spacing, labeled shapes and line consistency; revised architecture/flow exports were inspected after fixes.
- `git diff --check`: whitespace review. No application runtime or existing implementation was removed; the original repository contained only its title README.

## Deployment tests still required (not claimed as executed)

| Scenario | Required result |
|---|---|
| 100 concurrent submissions for one candidate/job with different keys | One application/history/event; one 201, remaining own-resource conflicts |
| Lost response + same-key retry | Original command result replay; no additional effect |
| Job close races with submissions | Lock-order-consistent outcome; no submission admitted after close wins |
| Two recruiters use same version | One transition/history/event, one 412 |
| Relay crash after publish | Duplicate event causes no duplicate DB effect |
| Engine returns old generation after new one | Old output cannot replace active newer generation |
| Search/cache stale after privacy revocation | No private profile returned to a new unauthorized read |
| Broker/engine/provider outage | Core application writes remain correct; backlog/staleness visible and bounded |
| 930 mixed API QPS plus peak match churn | Meet API SLO without exhausting DB IO/connections; measure actual engine quota |
| Zonal failover / regional restore | Validate distinct RPO/RTO targets and reconcile external side effects |

## Tooling and export limitations

The installed Excalidraw MCP exposes interactive scene creation and checkpoints, but no native download/export method. Editable `.excalidraw` files and SVG previews are generated from the exact same scene definitions. SVGs use clean deterministic vector shapes rather than reproducing Excalidraw's hand-drawn font/stroke rasterization; PNGs are produced with pinned `@resvg/resvg-js`. All diagram meaning and geometry are shared. Manual Excalidraw edits are not automatically synchronized back into the generator; save those edits separately before rebuilding.

PGlite validates the SQL kernel in an embedded PostgreSQL environment. It does not prove multi-session lock behavior under real concurrent clients, HA durability, production throughput, or completeness of a backend implementation. SLOs and restore times remain explicitly proposed targets.
