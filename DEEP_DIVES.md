# Deep Dives

## 1. Database and duplicate applications

Supabase Database provides PostgreSQL, which fits the main data because users, companies, jobs and applications are related. A transaction lets the application and its status history succeed or fail together. Use a server-side Postgres transaction on one pooled connection: several separate Supabase API calls would not make these writes atomic.

Checking “does this application exist?” before inserting is not enough: two requests could both pass that check. Add a UNIQUE constraint on `(candidate_id, job_id)`. One request succeeds; the other gets 409 and the existing application ID.

For a lost response, the client retries with the same Idempotency-Key. Keep the key, request hash and response in the same transaction as the application for 24 hours. Same key and same request returns the saved response; a changed request gets 409. Even after the key expires, the unique constraint still prevents another application.

A job can also close while someone applies. The apply transaction takes a shared row lock on the job and checks it is open; closing the job takes a conflicting update lock. Whichever gets the lock first determines the order. Keep the transaction short and never wait for notifications inside it.

Trade-off: database checks add some work, but a duplicate or wrongly accepted application is worse than a slightly slower submit. Supabase reduces setup work, but database capacity and backup features still depend on the selected plan; it is not unlimited infrastructure.

## 2. Application status changes

Only allow the transitions listed in the README. Store a version number on each application. Rejected can happen from Applied, Screened or Interview; Offer and Rejected are terminal.

If two recruiters both edit version 1, the update checks `WHERE version = 1`. One update creates version 2. The other changes no rows and returns 409, asking the client to refresh.

Save the new status and a history record in one transaction. History records show who changed the status and when; previous records are not edited. A retried status update with the old version cannot advance the application twice.

This is more predictable than letting the last request silently overwrite the first.

## 3. Search and database load

Use OpenSearch for keywords, skills, experience and salary filters. PostgreSQL remains the source of truth.

When a job or searchable profile changes, send an event to an indexing worker. The worker reads current data from PostgreSQL and updates the search document. Include a revision number so a delayed old update cannot overwrite newer data.

The trade-off is eventual consistency: a new job may take a few seconds to appear. When someone opens or applies to a job, check its current database status. Recheck candidate visibility before returning search results, so an old index entry cannot expose a profile that was made private.

Retry failed index updates. If the index is lost, rebuild it from PostgreSQL and replay changes made during the rebuild before switching to the new index.

Add indexes for application lookups by candidate, job and status, and for skill joins. Start with ordinary pagination, limited to 50 items. Cursor pagination would be a useful improvement for very large or quickly changing lists.

## 4. Matching and skill gaps

The matching engine is a black box:

- Input: candidate/job skills, experience and eligibility.
- Output: ranked IDs, scores and any supplied match metadata.

Run it in background workers when a job is published or important profile fields change. Do not call it on every page load. Store candidate/job scores in Match; both candidate and employer recommendation pages read that data.

To avoid comparing everyone with every job, first select a limited group using skills and eligibility. For example, compare an updated candidate with up to 200 open jobs. This reduces cost but can miss useful matches, so the shortlist rule needs checking as the product grows.

Give each task an ID and input revision. Save results only if those inputs are still current; otherwise queue a fresh task. Upsert each candidate/job pair to prevent duplicate rows. Retry engine timeouts, and show older results with their computed time while it is unavailable. Exclude closed jobs and expired results; refresh active users daily and expire scores after seven days.

Skill gaps can start with a simple comparison against a target role's required skills. Return matched skills, missing skills and priorities. Save the result, and recompute when the profile or target role changes. A roadmap turns missing skills into milestones. Keep completion progress separate from new suggestions so an updated analysis does not erase the user's work.

## 5. Background events and notifications

Use RabbitMQ so indexing, matching and push delivery do not block application requests. Workers can be added independently when the queue grows.

There is a possible failure between saving an application and publishing its event. To avoid losing it, save a small pending-event record in PostgreSQL inside the same transaction. A background publisher sends it to RabbitMQ, waits for confirmation, then marks it sent. This is the outbox pattern.

An event may be delivered twice if the publisher crashes after sending. Give each event an ID. Notification records have a unique `(user_id, event_id)` key, and workers acknowledge messages after saving their result.

Check notification preferences before sending push messages. Track pending, sent and failed delivery states. Retry temporary errors with increasing delays; after five failures, move the task to a dead-letter queue for investigation. A push provider timeout may mean it accepted the message but the response was lost; use its idempotency feature when available, otherwise an occasional duplicate push is still possible.

At high load, keep application updates ahead of optional match alerts. Limit worker concurrency and combine repeated profile changes into one matching task. Adding unlimited workers would only overload the database or push provider.

## 6. Scaling, caching and failure handling

Start with one backend codebase and separate worker processes. Add API instances behind a load balancer when request traffic increases. Keep database connection pools limited so extra instances do not open unlimited connections.

Add Redis only when repeated reads become a measured problem. Cache popular job details briefly, for example one minute. The cache may be stale, so it cannot decide whether an application is allowed. On cache failure, read from PostgreSQL with rate limits.

A read replica can later handle public read traffic if the selected Supabase setup supports it, but application writes and permission checks should use the primary database. Sharding is unnecessary at the starting scale.

Choose an appropriate Supabase backup/recovery option and test restoring it. Database backups do not restore the bytes in Storage buckets, so arrange separate file backups too. If Supabase Database is unavailable, return an error rather than claiming an application succeeded. If matching or notifications fail, applications should still work. Monitor API errors, latency, slow queries and the oldest queued task; logs should help identify failed requests without containing resumes or passwords.

## 7. Security

Use Supabase Auth for password handling and sessions instead of implementing password storage. The backend verifies token signature, issuer and expiry and uses the verified user ID. Serve requests over HTTPS.

Candidates can edit only their own profile. Employers can change jobs and view applications only for their company. Candidate discovery is opt-in; applying shares the required candidate information with that job's employer.

Use private Supabase Storage buckets, validate file type/size and scan uploads before making them available. Scanning is our worker's responsibility, not an assumed Storage feature. Use short-lived signed download links after checking ownership or hiring-company access. Validate API input, limit login/application attempts and record employer status changes for auditing.

Enable RLS for tables exposed through the Data API: for example, a candidate can access their own private profile and a user can read their own notifications. Storage policies restrict file access too. Keep application/status writes behind the backend, without direct browser write grants, so clients cannot bypass the transaction or state rules. Secret/service-role keys stay on the server; they can bypass RLS, so backend permission checks are still required. A public client key is not authorization by itself.

Hiding a button in the interface is not authorization. Supabase supplies the tools, but we still have to write and test the access rules.
