# Deep dives: decisions under load and failure

The design favors local correctness and bounded asynchronous work. The figures below refer to [ESTIMATION](ESTIMATION.md); algorithms and wire contracts live in [flows](docs/flows.md) and [API design](docs/api-design.md), so this document concentrates on judgment and failure behavior.

## 1. Relational database

**Problem:** An application, its first history entry and its event must agree. Jobs belong to companies; permissions and foreign keys must not drift.

**Scale concern:** 18.25M new applications/year is substantial but does not, by itself, demand sharding. Match churn and notification retention generate more write traffic than hiring commands.

**Design / technology:** PostgreSQL with normalized core records, constraints and short transactions. READ COMMITTED plus explicit locks is sufficient for the defined races. Synchronous cross-AZ standby protects acknowledged commits under a single-AZ failure.

**Consistency:** Unique candidate/job and composite job/company FK are database invariants. History, command receipt and outbox commit with the application. No distributed transaction is needed.

**Failure modes:** DB unavailability rejects writes; a stale replica cannot authorize hiring changes. Failover may return an ambiguous commit outcome; retry the same command key. Exhausted storage can stop both domain writes and outbox progress, so provision headroom.

**Trade-offs / why:** A single writer is a scaling boundary, but relational constraints directly express the hardest product rules. Do not exchange that simplicity for cross-shard uniqueness before measurements require it.

## 2. Indexes and query optimization

**Problem:** A recruiter filtering one job's Applied candidates needs predictable latency regardless of total applications.

**Scale concern:** A global status index has low selectivity. Large tenant pipelines, high match write churn and offset scans cause IO and vacuum pressure.

**Design / technology:** Use the query-shaped composite indexes in [data model](docs/data-model.md#query-driven-indexes), keyset pagination and batched projection reads. Select only fields needed for lists; retrieve resume links separately. Keep full-text search off the primary.

**Consistency:** Indexes accelerate the same transactional rows; they do not change truth. Application uniqueness stays global when adding retention strategies.

**Failure modes:** A slow plan can consume the connection pool. Use statement timeouts, staging EXPLAIN/BUFFERS, query fingerprints, and realistic skewed data. Build production indexes concurrently when supported and inspect invalid builds after interruption.

**Trade-offs / why:** Each index adds write amplification. Start with access paths tied to actual APIs; remove unused indexes only after workload observation. Partition append-heavy retention tables before considering the application aggregate itself.

## 3. Read scaling

**Problem:** Millions of profile/detail reads should not crowd out small but critical hiring transactions.

**Scale concern:** Peak public reads approach 700/s, with additional worker queries. Blindly adding API replicas can exhaust DB connections.

**Design / technology:** First optimize queries, batch lookups and pool connections. Then route public stale-tolerant company/job descriptive reads and reporting to a PostgreSQL read replica. Keep own application reads, job eligibility, consent and membership on primary. Reads immediately after a mutation use primary.

**Consistency:** Replica lag is permitted only where product semantics allow it; a replica response cannot authorize access or decide whether a job accepts an application.

**Failure modes:** Replica lag or loss routes a limited amount of traffic to primary under a circuit breaker, not an unbounded failover flood. Shed optional reporting if primary is busy.

**Trade-offs / why:** Replicas add cost and routing complexity. At this envelope they are an incremental optimization, not a prerequisite for correctness; never promise linear scaling from replica count.

## 4. Caching

**Problem:** Hot discovery/detail/recommendation pages repeat, while permission and status fields change.

**Scale concern:** A cache outage can create a stampede large enough to overwhelm an otherwise healthy DB.

**Design / technology:** Redis cache-aside for public descriptive job fields and match pages keyed by generation. Five-minute TTL with jitter; event invalidation is an optimization. Single-flight refresh and bounded fallback concurrency prevent thundering herds. Fetch authoritative eligibility/consent before returning personalized results. Prefer caching IDs over full private profiles.

**Consistency:** Read current generation pointer from DB; cached content is valid only for that version. Closed jobs and revoked candidates are filtered independently of cache freshness. Do not cache application writes or command receipts in Redis.

**Failure modes:** Redis loss discards performance state. Stale public descriptions are acceptable briefly; stale permissions are not. When DB fallback budget is exhausted, return a retryable error for optional reads.

**Trade-offs / why:** Authoritative checks reduce the apparent hit-rate benefit but preserve privacy. No Redlock/lease can replace the permanent unique application constraint.

## 5. Search and indexing

**Problem:** Keywords, facets, skill expertise and salary filters are discovery queries, not transactional lookups.

**Scale concern:** Complex filtering on normalized profile tables competes with application commits. Search indexing may lag under edits or bulk rebuilds.

**Design / technology:** Dedicated OpenSearch job and candidate projections. Outbox events trigger full-snapshot upserts using DB aggregate versions and external version checks. A stale worker's lower-version write is discarded. Closed/opted-out entities become minimal tombstone documents with newer versions, not immediately forgotten deletes. Retain tombstones beyond replay horizon to avoid old-event resurrection.

**Consistency:** Eventual, p95 ≤60 s normally. Batch hydrate search hits from primary for visibility and status. Search counts/facets are approximate after authorization filtering; API never returns private candidate details from the index alone.

**Failure modes:** On poison mapping data, quarantine with entity/version and alert; don't block all indexing. Rebuild into a new versioned index from a consistent DB snapshot while capturing subsequent changes, catch up through a recorded watermark, compare counts/sample hashes and atomically swap alias. Keep old index for rollback. Ensure DB tombstones/changes bridge the snapshot interval; an uncoordinated bulk copy followed by alias swap loses edits.

**Trade-offs / why:** Operating a second datastore costs money and introduces lag, but gives appropriate discovery semantics. No broad SQL fallback during an OpenSearch outage; known job details and saved lists remain usable. External-version behavior is documented by [OpenSearch](https://docs.opensearch.org/latest/api-reference/document-apis/index-document/).

## 6. Broker and transactional outbox

**Problem:** Writing the DB and directly publishing an event is a dual-write gap: either can succeed without the other.

**Scale concern:** Roughly 3M fan-out/work messages/day is modest throughput, but dependency outages create a backlog that must be bounded and visible.

**Design / technology:** RabbitMQ durable exchange and quorum queues with persistent messages, publisher confirms, unroutable-return handling and explicit consumer ack. Separate subscription queues isolate indexing, matching and notifications. Relay leases outbox rows; do not hold a database transaction open while waiting for the broker. Expired leases are reclaimable.

**Consistency:** Domain + outbox commit atomically. Publish then mark means a relay crash can duplicate messages; never mark before publish. ConsumerInbox dedupes DB effects in the same transaction as those effects. Search versioning and provider delivery IDs handle non-DB effects separately.

**Failure modes:** Broker loss accumulates outbox. Missing routing is a failure even if broker confirms; deployment checks ensure required bindings exist. Quorum loss pauses delivery; page on age/bytes before disk alarms. Retain dispatched outbox seven days and never expire undispatched entries. For longer outages enforce storage budgets and shed optional producer work; before DB exhaustion return retryable errors even for new writes rather than lose facts.

**Trade-offs / why:** RabbitMQ fits bounded task scheduling and independent consumers. It is not an indefinite replay log; DB snapshot rebuild plus retained outbox is the recovery contract. Kafka becomes attractive with many replay consumers and long retention, not simply because events exist. [RabbitMQ's quorum documentation](https://www.rabbitmq.com/docs/quorum-queues) defines the relevant durability boundary.

## 7. Matching pipeline

**Problem:** The engine is opaque and potentially expensive. Users need recommendations without tying page latency to engine latency.

**Scale concern:** Full 1M×100k matching is infeasible. Even bounded recomputation budgets up to 250M pair inputs and 50M result-row writes/day.

**Design / technology:** Candidate-centric generations, ≤500 retrieved job inputs, ≤100 persisted results, durable coalesced tasks, independently throttled workers. Contract and triggers are in [flows](docs/flows.md#4-black-box-matching-contract). Persist results in PostgreSQL initially to switch a complete generation atomically; Redis caches pages.

**Consistency:** Input versions and monotonic generation fence late completions. Current profile/job eligibility is rechecked; old-but-eligible results can be served with timestamps/stale flag during failure. Employer matches reverse current consenting candidate sets, so they are bounded recommendations rather than an independent exhaustive score system.

**Failure modes:** Engine timeout, malformed output, out-of-order completion, retry storms and profile-edit churn. Validate output, reuse request ID, expire leases, coalesce pending work, and quarantine persistent failures. Engine returns cannot advance application state.

**Trade-offs / why:** Bounded retrieval loses coverage; track sampled recall and exploration coverage. Persisted generations cost write IO; isolate pool budgets and consider a separate derived-result store only if measured churn hurts transactional SLOs. No claim about AI/ML internals is needed.

## 8. Application consistency

**Problem:** Two recruiters can act on the same application while a candidate edits a profile or the company closes a job.

**Scale concern:** Popular jobs produce concentrated contention even when average submit QPS is low.

**Design / technology:** Optimistic application version, explicit state graph, append-only history, immutable submission snapshot, and short PostgreSQL transactions. Job submit takes a share lock; close takes an update lock. Recruiter authorization is checked against a locked active membership. SQL kernel also guards allowed transitions.

**Consistency:** Application record is authoritative. Compare-and-swap update, history and status event commit together. `Offer`/`Rejected` are terminal; adjacent forward moves and rejection from nonterminal stages are the only options.

**Failure modes:** Stale version →412; forbidden transition →422; lost response →same-key retry. No silent last-writer-wins. A lock timeout is retryable, not evidence that application was created. Retries after ambiguous commit inspect receipt first.

**Trade-offs / why:** A brief job lock may delay closure behind active submissions, but defines a clear order. Broad serializable isolation could also protect invariants with transaction retries, but explicit small lock scope plus constraints is easier to reason about for these known races. [PostgreSQL locking](https://www.postgresql.org/docs/17/explicit-locking.html) describes the lock conflicts used here.

## 9. Duplicate prevention

**Problem:** Double-clicks, multiple browser tabs and delayed mobile retries can all submit the same application.

**Scale concern:** A check-before-insert works in a demo and fails under concurrency. Distributed API replicas make in-memory locks meaningless.

**Design / technology:** Permanent UNIQUE(candidate_id,job_id), enforced in the transaction with `INSERT ... ON CONFLICT DO NOTHING`. Actor identity is server-derived. One winner gets 201; different-key duplicate gets 409 and only its own existing application reference.

**Consistency:** DB index arbitrates concurrent inserts, even when command receipts differ or expire. Terminal status does not release the constraint; reapplication requires a new requisition ID.

**Failure modes:** Winner rollback allows the contender to insert; winner commit produces a conflict. App-level prechecks improve messaging but cannot replace the index. Pseudonymized retained records preserve business uniqueness after personal fields are redacted, subject to retention policy.

**Trade-offs / why:** Lifetime uniqueness is stricter than allowing reapplication after rejection, but it is predictable and avoids multiple conflicting pipelines. Idempotency complements this rule; it does not define it.

## 10. Command and consumer idempotency

**Problem:** A client cannot tell whether a timed-out command committed; a worker may crash after its effect but before ack.

**Scale concern:** Receipts grow with commands and can themselves become a hot path or contain sensitive snapshots.

**Design / technology:** PostgreSQL command receipts keyed by actor/route/key, request hash and exact minimal response for 24 h. Claim and complete inside the domain transaction, so rolled-back work leaves no committed incomplete receipt. Concurrent inserts wait on uniqueness briefly; bounded wait returns retryable busy state. Separate ConsumerInbox handles event redelivery.

**Consistency:** Same key + same canonical request returns same outcome; changed body or precondition gets 409. Authorization is evaluated before replay. Consumer inbox insert and DB effect commit together, not in separate transactions.

**Failure modes:** Receipt expiry means exact replay ends, but application uniqueness remains. For events replayed beyond seven-day inbox retention, projection version checks and permanent Notification event uniqueness (within its 90-day retention) protect normal effects. Rebuild/replay jobs explicitly suppress external sends; never replay historical notifications after dedupe expiry as live delivery.

**Trade-offs / why:** Receipts cost storage and require canonical hashing. They give predictable retry semantics; a misleading blanket “exactly once” promise does not. Retention boundaries are part of the public/API and operational contract.

## 11. Notification processing

**Problem:** Hiring updates matter, but email latency must not block an application.

**Scale concern:** Up to 600k logical notifications/day; match fan-out can drown status updates and provider quotas.

**Design / technology:** Planner transaction writes logical Notification plus channel Delivery and inbox dedupe. Dedicated status and digest queues receive fair scheduling. Stable provider idempotency key, leased send attempts, signed callbacks and explicit unknown state. Recheck preferences immediately before send; use a designated recruiter recipient initially instead of emailing every company member.

**Consistency:** In-app logical record is deduped by user/event/category. External delivery is at least once at best; providers with idempotency/query support reduce duplicates. Preferences changed before send suppress pending work; already accepted messages cannot be recalled.

**Failure modes:** Provider timeout after acceptance is ambiguous. Reconcile first, then bounded retry; duplicate email remains possible. Dead addresses become permanent failures; don't retry them like 429. Delayed status alerts older than current version are suppressed, preserving history in the application UI.

**Trade-offs / why:** Eventual delivery and digests reduce cost but delay some engagement. Preserve status-change service quality ahead of match marketing and report provider acceptance separately from final delivery.

## 12. Horizontal scaling

**Problem:** API traffic and engine/provider workloads scale differently.

**Scale concern:** CPU-based scaling alone can add workers while the actual bottleneck is PostgreSQL IO or an external quota.

**Design / technology:** Stateless API replicas behind a load balancer; separate search, matching, career and notification worker pools. Autoscale workers on oldest due task age and completion rate, subject to hard provider concurrency and DB connection budgets. Use rolling deployments with graceful drain, readiness checks and request deadlines.

**Consistency:** Shared DB constraints and generation fencing keep correctness independent of replica count. Graceful worker shutdown either completes/acks or relinquishes a lease for another worker.

**Failure modes:** A worker killed mid-call may be redelivered; lease expiry and idempotency handle it. Scale-down too quickly amplifies retries. Limit per-tenant in-flight work so one company cannot consume all capacity.

**Trade-offs / why:** More replicas improve capacity only while dependencies have headroom. Scale modules operationally through worker pools before paying for independent network services and distributed ownership.

## 13. Backpressure and admission control

**Problem:** Unlimited queues move overload into tomorrow and hide it from users.

**Scale concern:** Job edit bursts and engine outages can exceed the 15-minute match target; notification campaigns can exceed send quotas.

**Design / technology:** Coalesce to latest candidate version, cap per-job fan-out, debounce repeated edits, token-bucket provider calls, bounded consumer prefetch, and fair queues for status versus optional matches. Public refresh endpoint has per-user limits. Use oldest task age/byte budgets, not only queue count.

**Consistency:** Dropping an obsolete pending recompute is safe only because its latest successor exists. Never drop application records or undelivered authoritative events. Reconciliation finds missing latest projections.

**Failure modes:** Under long outage pause optional recompute/admission before disk exhaustion; show queued/stale state. Do not endlessly return 202 when the backlog cannot meet the advertised freshness target; rate-limit explicit refresh or report degraded processing status.

**Trade-offs / why:** Lower freshness beats cascading core-write failure. The user can still apply to an eligible job even if recommendations are delayed. Capacity and queue-age budgets make that priority enforceable.

## 14. Retries and dead letters

**Problem:** Transient failures need retry; malformed events and permanent provider errors do not heal with repetition.

**Scale concern:** Immediate requeue loops can consume all broker/worker capacity and amplify an outage.

**Design / technology:** Classify errors: transient network/429/5xx → bounded exponential backoff with full jitter and Retry-After; invalid schema/permanent destination → quarantine. Persist next-attempt time and lease for DB-managed tasks. Broker consumers use delayed retry queues or a scheduler, not a tight nack/requeue loop. Five attempts is the starting policy for matching; channel-specific delivery deadlines may differ.

**Consistency:** Preserve event/request ID across retries. Ack the original only after durable retry/quarantine handoff is confirmed; configure safe dead-letter transfer rather than assuming defaults guarantee it. Aggregate version protects against delayed stale results.

**Failure modes:** Dead-letter storage can also fail or fill. Alert on oldest quarantined message and quota; retain enough input reference for repair without PII payload dumps. Operator replay requires a fixed cause, version-aware consumers and a dry-run count. Poison entity should not halt other jobs.

**Trade-offs / why:** Bounded retries can delay eventual recovery until intervention, but prevent retry storms. DLQ is an operational work list with ownership, not a place to silently discard correctness problems.

## 15. Failure recovery

**Problem:** A process retry cannot recover a lost region or a corrupted search projection.

**Scale concern:** Database, object files, projections and event dedupe can recover to different times, causing duplicate effects or missing file references.

**Design / technology:** Automated DB backups + WAL archive, synchronous zonal standby, cross-region backup copies, object versioning and an inventory reconciliation job. Proposed regional RPO ≤5 min/RTO ≤60 min requires repeated drills. Search and Redis rebuild from DB; matching is recomputable. Preserve outbox and current projection versions.

**Consistency:** After DB restore, suspend external sends, reconcile provider delivery IDs and replicated file objects, then replay retained events with version guards. At-least-once replay may include events whose effects survived outside the DB. Regional disaster can lose acknowledged writes within the stated RPO; do not confuse this with the single-AZ RPO 0 target.

**Failure modes:** Missing scanned objects are marked unavailable and surfaced to owner; don't silently attach another file. A lagging failover copy must not be promoted without an explicit durability decision. Old index data cannot restore application truth.

**Trade-offs / why:** Cross-region active-active is expensive and complicates uniqueness. Backup-based regional recovery is proportional to the competition envelope; its targets are hypotheses until validated with timed restoration and consistency checks.

## 16. Observability

**Problem:** A healthy HTTP response can hide a stuck match/index/notification pipeline.

**Scale concern:** Per-user metric labels explode cardinality; logging payloads leaks resumes and contact data.

**Design / technology:** OpenTelemetry-compatible traces propagate request/trace ID through outbox; metrics use bounded labels (route, module, error code, queue). Redacted structured logs carry event/aggregate identifiers only under controlled retention. Dashboards separate core API success/latency, queue oldest age, index commit-to-visible delay, generation age, worker throughput, duplicate conflicts, lock waits, DB pool saturation and provider acceptance/failure.

**Consistency:** Trace links connect asynchronous effects without pretending the initial request waited for them. SLO freshness starts at domain commit, not queue receive time.

**Failure modes:** Alert on multi-window core error-budget burn; page when outbox age or DB disk threatens durability. Ticket isolated poisoned input, page systemic poison growth. Include runbook owner and mitigation; telemetry outage should not block application commits.

**Trade-offs / why:** Sample routine traces but retain error paths and security audits separately. Operational insight is useful only when it distinguishes stale recommendations from lost applications and points to a bounded repair action.

## 17. Security and privacy

**Problem:** Candidates disclose sensitive career data; a recruiter must never inspect another company's pipeline or a nonconsenting person's discovery profile.

**Scale concern:** Enumeration, scraping, fake companies, credential theft and upload abuse increase with discovery usage.

**Design / technology:** OIDC with PKCE/state/nonce, short-lived sessions/tokens, CSRF defense for cookie writes, RBAC plus resource ownership. Every hiring query includes authorized company ID, with composite FK defense for writes. Verify current account/membership on sensitive requests; tenant IDs in bodies/tokens are not sufficient. Use parameterized SQL, schema validation, output escaping, TLS and managed encryption keys at rest.

Candidate search returns minimal opted-in fields. Batch-check current consent on primary after search/cache retrieval. Revocation commit is the read authorization boundary; new requests after it cannot expose the candidate even if index purge lags. Applicant snapshots remain visible only to the hiring company under retention policy. Secure uploaded files with owner-bound signed URLs, size/MIME/content checks, quarantine, malware scanning and safe download headers; never fetch arbitrary portfolio URLs server-side (SSRF risk).

**Consistency:** Privacy checks require current primary state. Search/cache purge is asynchronous, target ≤24 h, but does not grant access. Revocation and hiring writes coordinate on membership locks. Backup retention/restore procedures must reapply erasure tombstones before serving restored data.

**Failure modes:** Fail closed when permission state cannot be checked. Rate-limit by user/company/IP; cap exports and repeated applications; verify companies before mass discovery/publishing. Store secrets in a secret manager, rotate provider credentials, verify webhooks and prohibit PII in logs/events. Audit actor, company, operation, resource, result and time for role changes and application transitions.

**Trade-offs / why:** Extra authoritative checks cost latency but prevent stale caches becoming access-control bypasses. Keep scope practical: a policy review determines deployment-specific retention/legal obligations; the design does not claim compliance certification. Security is part of the normal data path, not an afterthought attached to the diagram.

## 18. Skill analysis and roadmap revisions

**Problem:** An updated profile or target-role template can invalidate a gap report while a candidate is completing its roadmap.

**Scale concern:** Recompute every historical goal on every edit creates needless work and erases useful progress if results overwrite plans.

**Design / technology:** Immutable SkillGap keyed by candidate/role revisions and analyzer version; coalesced background work for active goals. Adopted Roadmap and stable Milestone IDs have a separate lifecycle from recomputable suggestions. Cache by digest, not merely candidate ID.

**Consistency:** GET compares authoritative input revisions and labels stale output. Old analysis can be retained but never silently becomes current. Milestone completion and its outbox event commit together; idempotency prevents duplicate completion alerts.

**Failure modes:** Analyzer errors preserve the last report with a stale flag. In-flight old revisions are stored as historical results, and latest input is queued. Adoption of stale analysis requires an explicit client acknowledgement.

**Trade-offs / why:** Versioning consumes modest storage and UI explanation, but protects candidate progress and avoids claims that an analysis is timeless or guarantees employability.
