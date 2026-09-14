# Requirements and acceptance criteria

This is a proposed design at the envelope in [ESTIMATION](../ESTIMATION.md). Product choices below resolve ambiguities rather than implying unstated competition rules.

## Functional requirements

| ID | Actor / behavior | Acceptance criterion | Primary owner |
|---|---|---|---|
| F1 | User signs in and manages account | Verified OIDC subject maps to one User; disabled users cannot mutate data | Access |
| F2 | Candidate maintains profile | Skills, proficiency, experience, education, goals and portfolio are editable; revisions increment atomically | Talent |
| F3 | Company admin manages employer membership | Admin can grant/revoke admin or recruiter role only within that company | Employers/jobs |
| F4 | Recruiter manages job lifecycle | Draft → Published → Closed; only published, unexpired jobs accept applications; no reopening in this scope | Employers/jobs |
| F5 | Candidate/employer discovers opportunities | Keywords, skills, experience, location, work mode, salary range/currency/pay period; expertise filters for consenting candidates | Discovery |
| F6 | Candidate saves a job | PUT is repeatable; closed jobs can remain saved but are clearly closed | Talent |
| F7 | Candidate/employer retrieves ranked matches | Black-box results expose generation, score metadata and computed time; engine outage does not break profile/apply | Matching |
| F8 | Candidate applies and tracks status | Unique candidate/job; same idempotent retry returns original response; closed job conflicts are rejected | Applications |
| F9 | Recruiter progresses hiring pipeline | Only forward adjacent transitions or rejection from nonterminal stages; history contains actor/time/version | Applications |
| F10 | Candidate requests skill analysis | Versioned target-role requirements yield matched/missing skills and priorities; stale input is detectable | Career growth |
| F11 | Candidate follows roadmap | Ordered milestones with todo/done state; completion triggers an event once per version; refreshed analysis does not erase progress | Career growth |
| F12 | User manages notifications | In-app inbox/read state, email/push preferences, deduplicated logical alerts for matches, statuses and milestones | Notifications |

Candidate IDs always come from authentication for self-service routes. Recruiters cannot read unrelated applications or private candidate fields. Search rank and engine scores are advisory; they never decide eligibility to submit or advance an application.

## Non-functional requirements

| ID | Target / measurement | Design consequence and acceptance probe |
|---|---|---|
| N1 Availability | Core API 99.9% successful eligible requests/month; about 43.2 min error budget in 30 days | Includes gateway and DB failures; excludes valid 4xx, includes capacity 429/5xx. Inject search/broker outage and verify apply remains correct |
| N2 Scale | 8M public requests/day, 10× peak (~930 QPS); no guaranteed infinite scale | Load test mixed traffic plus a popular-job burst before claiming capacity; bound DB connections |
| N3 Latency | Server ingress-to-response p95: reads <200 ms, writes <300 ms, search <500 ms; p99 reads/writes <1 s | Excludes client network/file transfer/async execution. Report separate endpoint histograms; fail fast on saturated dependencies |
| N4 Consistency | Strong uniqueness/status; search p95 ≤60 s, match recompute p95 ≤15 min, in-app status alert p95 ≤60 s | Freshness measured from domain commit to usable projection/delivery; outage exceptions visible on dashboards; no stale eligibility decision |
| N5 Durability | Acknowledged commit survives one AZ loss (RPO 0); regional loss RPO ≤5 min/RTO ≤60 min | Synchronous zonal DB standby; cross-region WAL/backup replication. Quarterly failover/restore drills are required to validate targets |
| N6 Privacy/security | All private reads authorized by owner or current hiring-company relation | Consent revocation enforced at API immediately after DB commit; async purge target ≤24 h; test cross-tenant access and stale search hits |
| N7 Reliability | Every committed business event eventually dispatched or visibly quarantined | Kill relay/consumer before and after ack; reconcile missing projection; duplicate deliveries cannot duplicate applications/history |
| N8 Observability | Trace request → outbox → worker; alert on queue age and SLO burn | No resumes or contact details in telemetry. Page when apply error burn is sustained; ticket isolated poison messages |
| N9 Maintainability | Domain-owned writes, versioned APIs/events, safe expand/contract migrations | Contract checks and compatibility review; old workers tolerate added fields; destructive migration waits for all old readers |

Search has its own 99.5% proposed monthly availability SLO; matching completion is a freshness SLO rather than a synchronous dependency. Email/push targets refer to provider acceptance within five minutes p95, not inbox arrival or human receipt. A broker outage can violate freshness while core API availability remains healthy; report both, never hide it.

## Product semantics

- Pay uses integer minor units plus ISO currency and period (`year`, `month`, `hour`); compare only compatible currency/period. No implicit FX conversion.
- Experience is nonnegative months; dates cannot run backward; skill proficiency uses a documented 1–5 ordinal scale.
- A target role is a versioned curated skill-requirement template. Roadmaps are suggestions, not qualification guarantees.
- Application attachment/profile snapshots are retained for a proposed 12 months after terminal status, subject to an actual deployment's policy review. Pseudonymized uniqueness tombstones prevent accidental reapplication for retained jobs; account recreation abuse needs separate policy and controls.
- No automatic rejection from match scores. A recruiter remains accountable for status changes.

[Requirements scene](../diagrams/requirements.excalidraw) · [Audit traceability](judge-audit.md)
