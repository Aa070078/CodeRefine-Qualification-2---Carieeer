# Back-of-the-envelope estimation

These are design assumptions for a regional growth-stage product, not measured traffic. Decimal KB/GB are used; 1 day = 86,400 seconds. The design should be load-tested before committing to instance sizes or cost.

## Population and workload

| Quantity | Assumption / calculation |
|---|---|
| Registered users | 1M candidates + 20k employer users ≈1.02M accounts (roles may overlap; upper planning count) |
| Companies | 10k; average two employer memberships/company |
| DAU | 100k total ≈10% of registered accounts |
| Jobs | 100k published + 900k historical/draft = 1M stored |
| Job publications/material edits | 4k/day; assume ~1k newly published, 3k edits |
| Applications | 100k DAU ×0.5 = 50k/day; ≈18.25M/year before retention |
| Searches | 100k DAU ×10 = 1M/day (900k job, 100k candidate searches) |
| Profile/detail/list reads | 100k DAU ×60 = 6M/day |
| Other requests | 1M/day, including 50k submits, 100k status changes, ~100k profile edits, saves/preferences/task polling/commands |
| Total public API | 1M searches +6M reads +1M other = 8M/day |

100k status changes/day assumes two post-submit changes per application on average across cohorts, not that every day's applications immediately progress. Initial Applied history adds another 50k rows/day. Annual publications (~365k) are compatible with 100k live jobs at roughly 100-day average publication lifetime; tune for real close rates.

## Average and peak QPS

| Workload | Average | Peak assumption |
|---|---:|---:|
| Public API | 8,000,000/86,400 = 92.6/s | 10× = 926/s, rounded to 930 |
| Search | 1,000,000/86,400 = 11.6/s | 116/s |
| Detail/list reads | 6,000,000/86,400 = 69.4/s | 694/s |
| Other API | 1,000,000/86,400 = 11.6/s | 116/s |
| Application submit subset | 50,000/86,400 = 0.58/s | 5.8/s normally; stress one popular job at 100 submits/s separately |
| Status transitions subset | 100,000/86,400 = 1.16/s | 11.6/s |

The 930-QPS public envelope does not include worker DB writes, broker redelivery or object uploads. At 930 QPS ×0.2 s average API residence time, Little's law suggests ~186 in-flight requests across the fleet; this is not a DB connection requirement because not all request time holds a connection. Bound connection pools and measure query time.

## Matching cost: requests are not pair evaluations

- Daily active-candidate refresh/profile changes coalesced into 100k tasks/day.
- 4k job changes/day × at most 100 targeted candidate refreshes = up to 400k tasks/day before cross-trigger coalescing.
- Budget **500k candidate-ranking tasks/day**, each with at most 500 job inputs: **250M pair inputs/day**. This is input volume, not a claim about engine internals.
- Average ranking throughput = 500k/86,400 = 5.79 tasks/s; 10× burst ≈58/s. Provision/quota planning target 100 tasks/s leaves catch-up capacity.
- At assumed 0.5 s mean per task, 100/s needs ~50 concurrent calls. At 2 s it needs ~200; test the actual engine before choosing concurrency/quota. A 10 s timeout is a failure boundary, not the expected latency.
- At ≤100 persisted rows/task: ≤50M Match row writes/day before coalescing, ~579/s average, ~5.8k/s at 10×. Batch each generation insert and expire old generations; this derived write load is more significant than applications.
- 1M candidates ×100 current results =100M Match rows steady state; previous generations for the 100k daily refreshed candidates add ~10M rows. A workload where every candidate refreshes daily would roughly double retained row count; storage below assumes the active cohort.
- A one-hour engine outage at 5.79/s accumulates ~20.8k tasks. At 100/s capacity and 5.79/s new arrivals, ideal drain time ≈221 s. At peak 58/s arrivals, drain ≈496 s. Quotas, DB throughput and coalescing determine actual recovery.

Bounded shortlist retrieval limits compute but sacrifices exhaustive recall. This is an explicit product trade-off; monitor eligible-job coverage. At 10× registered population, do not simply multiply fan-out by population: keep bounded retrieval, measure quality, and provision derived storage/engine separately.

## Notifications and events

| Volume | Calculation |
|---|---|
| Application submitted alerts | 50k/day, one designated recruiter recipient per job |
| Application changed alerts | 100k/day, candidate recipient |
| Match alerts/digest items | Up to 400k/day after threshold and cap (not one per result row) |
| Milestone alerts | 50k/day |
| Logical notifications | 600k/day =6.94/s average, 69.4/s at 10× |
| External delivery attempts before retries | 50% email +10% push =360k/day =4.17/s; in-app =600k writes/day |
| Broker domain events | ~100k profile +4k job +50k apply +100k status +500k match ready +50k milestone +100k analysis/other ≈904k/day |
| Subscription/work fan-out | Budget 3M delivered work messages/day ≈34.7/s average, 347/s peak; excludes retries |

Assume 1 KB average compact message. One day of 3M queued deliveries is ~3 GB payload, ~9 GB across three replicas before metadata and filesystem overhead. Provision materially more (e.g. 30 GB) and alert by byte usage/oldest age. Profile snapshots and resume bytes are not broker payloads. Provider quotas need ≥42 external sends/s at a 10× burst plus retry headroom; lower quotas imply digesting/delay, not unlimited workers.

## Storage: logical payload before replicas

| Data | Calculation | Approximate footprint |
|---|---|---:|
| Candidate profiles + normalized children | 1M ×10 KB | 10 GB |
| Companies/memberships/jobs/skills | 1M jobs ×5 KB + small company/member overhead | 5.1 GB |
| Applications, 12-month planning window | 18.25M ×2 KB (snapshot + row, file pointer only) | 36.5 GB |
| History | 150k/day ×365 ×0.2 KB | 10.95 GB |
| Current + previous active Match rows | 110M ×0.2 KB | 22 GB |
| MatchSet metadata + gaps/roadmaps | Budget; 1M candidate analyses/plans ×~5 KB plus generation metadata | 6 GB |
| Inbox, 90-day TTL | 600k ×90 ×0.5 KB | 27 GB |
| Delivery state, 30-day TTL | 360k ×30 ×0.3 KB | 3.24 GB |
| Outbox, 7-day retained dispatched events | 904k ×7 ×1 KB | 6.33 GB |
| Consumer inbox, 7-day | 3M ×7 ×0.1 KB | 2.1 GB |
| Command receipts, 24 h | Budget 500k commands ×1 KB | 0.5 GB |
| Tasks/audits/saved jobs and margin | Explicit provisional allowance | 4 GB |
| **Logical subtotal** | Sum | **133.72 GB** |
| Index/tuple/bloat allowance | ×1.8, validate using realistic records | **240.70 GB** |

Provision ~500 GB usable primary storage to keep growth and maintenance headroom. A synchronous standby holds another full copy; backup/WAL and optional read replicas are additional. ~241 GB is occupied planning space, not total cloud billing storage. Application retention is 12 months after terminal status, not exactly after creation; long-lived nonterminal records can push application/history totals above the annual-window estimate. Monitor age distribution and preserve retention headroom.

Gross daily logical relational writes/growth before expiration: applications 100 MB + history 30 MB + notifications 300 MB + delivery 108 MB + outbox 904 MB + inbox 300 MB + match writes up to 10 GB/day + receipt churn ~500 MB/day, plus profiles/tasks. Much of this expires or replaces derived state; it is **not** all net annual growth. WAL may be several times logical writes; measure at peak, especially match inserts/deletes and index churn.

- Files: 1M candidates ×1 MB average retained resume/portfolio allocation ≈1 TB. 10k replacement uploads/day ×1 MB =10 GB/day gross; 30-day old-version expiry adds ~300 GB, excluding retained application attachments. File reuse/reference counting and retention policy dominate long-term growth.
- Search: 600k opted-in candidates ×2 KB +100k live jobs ×3 KB ≈1.5 GB source docs; allow ×3 inverted-index/column overhead and one replica →~9 GB. Rebuild side-by-side temporarily doubles this; actual mappings require measurement.
- Redis: 100k hot users ×20 cached IDs/score entries ×100 B ≈200 MB raw; metadata, keys and overhead budget ~1 GB, plus public details. Provision ~2 GB with eviction; never depend on holding all recommendations.
- Network: 8M API responses ×3 KB average ≈24 GB/day excluding TLS overhead and file downloads; 10× peak ≈2.8 MB/s. Match requests with 500×0.5 KB job attributes can add up to125 GB/day internal/provider egress, so batch compact attributes and measure provider cost.

## What would change this design?

The first pressure is likely matching write churn/provider spend, not application transaction QPS. Load test 930 mixed API QPS alongside 5.8k peak Match inserts/s and a popular-job burst. If result churn degrades apply p95, reduce recomputation, isolate worker connection/IO budgets, then consider a separate derived-results store. If query/index IO dominates primary reads, add replicas for stale-tolerant paths. Sharding comes only after measured single-writer limits and a defensible tenant/candidate partition strategy.
