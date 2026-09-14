# Simple Deep Dives

## Supabase database

PostgreSQL keeps applications and status changes together because these records must agree. Normal indexes cover user IDs, job status, skills, and application lookups. Read replicas can be added later for busy public pages.

## Duplicate applications

The problem is two clicks or two servers applying at the same time. A unique `(candidate_id, job_id)` constraint is the final protection. A transaction and `Idempotency-Key` make retries safe. The trade-off is that a candidate gets one application per job.

## Application states

The API has a small transition table. It checks `expected_version`, updates the row, and appends history in one transaction. This stops two employer tabs from silently overwriting each other.

## Search

OpenSearch makes keyword and filter queries fast. It is only a copy: `JobUpdated` is retried by an indexing worker and a full reindex can rebuild it from PostgreSQL. A recently changed job may take a few seconds to appear.

## Matching

The matcher is a black box. A worker sends candidate/job skills, experience, and eligibility, then stores returned scores. Events trigger recomputation; cached results have a time-to-live. Retries use a job ID so the same result can be written safely. The API can return a stale result with its timestamp while a new one is being calculated.

## Notifications

Application and match events go to RabbitMQ. A notification worker checks preferences and calls email or push providers. It retries temporary errors, deduplicates by event ID, and sends permanent failures to a dead-letter queue. The user request never waits for email.

## Security and recovery

Supabase Auth provides login, RLS limits rows by user/company, and server code checks employer permissions. Files use a private bucket and short-lived URLs. HTTPS, validation, rate limits, audit logs, metrics, alerts, and database backups cover common failures. Workers can be restarted and replay events from the queue or an outbox table.

