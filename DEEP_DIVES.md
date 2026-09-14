# Short design notes

| Problem | Simple choice |
|---|---|
| Main data | Supabase PostgreSQL; indexes for common reads |
| Duplicate apply | transaction + unique `(candidate_id, job_id)` + idempotency key |
| Pipeline race | valid transition list + `version` + status history |
| Search | OpenSearch copy; worker retries from database events |
| Matching | black-box worker; cache score with timestamp |
| Notifications | RabbitMQ worker; retry, dedupe, dead-letter queue |
| Files/security | Supabase private Storage, Auth, RLS, signed links |

The database is the truth. Search, matches, and notifications may be a few seconds late. This keeps the request fast and makes failures recoverable.
