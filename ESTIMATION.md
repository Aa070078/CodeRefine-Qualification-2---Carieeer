# Small capacity estimate

These are assumptions for an initial version, not measured traffic.

| Item | Assumption |
|---|---:|
| Registered candidates | 100,000 |
| Employer accounts | 2,000 |
| Active users per day | 10,000 |
| Open jobs | 10,000 |
| Applications per day | 5,000 |
| Searches per day | 50,000 |
| Profile/detail/list requests per day | 150,000 |
| Other API requests per day, including applications | 20,000 |

## Requests

Total = 50,000 + 150,000 + 20,000 = **220,000 requests/day**.

Average QPS = 220,000 / 86,400 ≈ **2.5 requests/second**.

Assuming a peak ten times the average gives about **25 requests/second**. This does not need a large microservice setup. Actual capacity still depends on query cost and must be tested.

## Matching and notifications

Assume up to 20,000 candidate refresh tasks/day after combining repeated changes. At up to 200 jobs/task, that is **4 million candidate/job comparisons/day**, not four million API requests. Store at most 20 returned results per task.

Assume 5,000 application alerts + 5,000 status alerts + 10,000 match/milestone alerts = **20,000 notifications/day**. These run in workers rather than in the original requests.

## Storage

- Profiles: 100,000 × 5 KB ≈ **500 MB**.
- Open job data: 10,000 × 5 KB ≈ **50 MB**, excluding older closed jobs.
- Applications: 5,000/day × 365 × 2 KB ≈ **3.65 GB/year**.
- Two history rows per application on average: 1.825M × 2 × 200 B ≈ **730 MB/year**.
- Resumes: 100,000 × 1 MB ≈ **100 GB** in Supabase Storage.
- Match writes: 20,000 × 20 = up to 400,000 rows/day. Seven-day expiry caps retained rows at roughly 2.8M before upsert reuse; at 100 B/row that is about **280 MB** before indexes.
- Notifications: 20,000/day × 90 days × 500 B ≈ **900 MB** with a 90-day retention window.

These are rough data sizes. Indexes, backups, file replacements and replicas need additional space. The main early concerns are growing application history and the cost of matching, rather than average API traffic.

Use these numbers when choosing Supabase database compute, Auth usage, Storage and egress allowances. They are workload estimates, not a claim that a free plan covers this deployment. OpenSearch, RabbitMQ and the matching engine have separate resource costs.
