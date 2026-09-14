# Deep Dives (short version)

These are the main decisions behind the design:

1. **Supabase Database:** stores the real data. It is good for relationships between users, jobs and applications.
2. **Duplicate applications:** add `UNIQUE(candidate_id, job_id)` and use a transaction. This is safer than checking first in application code.
3. **Status updates:** store a version and allow only the states shown in the README. Save a status history row for every change.
4. **Search:** use OpenSearch for keywords and filters. It copies data from Supabase, so a new job may appear a little later.
5. **Matching:** treat the matching engine as a black box and run it in a worker. Save its scores in the database instead of calling it on every page load.
6. **Notifications:** put notification work on RabbitMQ. A failed push should not cancel an application.
7. **Scaling:** start with one backend split into modules. Add more backend instances or workers only when traffic grows.
8. **Security:** use Supabase Auth, Row Level Security, company membership checks and private Supabase Storage files.

The main trade-off is simple: applications need an immediate correct database result, while search, matching and notifications can finish shortly afterward.
