# Carieeer

career website design.

## What it does

| User | Main actions |
|---|---|
| Candidate | profile, skills, experience, education, goals, portfolio, search, apply |
| Employer | company, jobs, candidate search, application pipeline |
| System | matching, skill gaps, roadmap, notifications |

## Main rules

- Supabase: Auth, PostgreSQL, and private Storage.
- PostgreSQL is the source of truth.
- Search and match data are copies and can be a little late.
- One candidate can apply to one job once.
- Matching is a black box: candidate/job data in, ranked scores out.
- Notifications run in the background.

## Quality targets

99.9% availability target, normal reads under 300 ms, HTTPS, Auth/RLS, backups, logs, retries, and rate limits.

## Application states

```text
Applied -> Screened -> Interview -> Offer
   |          |           |
 Rejected   Rejected    Rejected
```

Invalid moves return `409`. Apply uses a transaction, a unique `(candidate_id, job_id)` rule, and an `Idempotency-Key`.

## Small API list

```text
POST /auth/login
GET/PATCH /me/profile
POST /companies/:id/jobs
GET /jobs?q=&skill=
GET /me/matches
POST /jobs/:id/applications
PATCH /applications/:id/status
POST /me/skill-gaps
POST /me/roadmaps
GET /me/notifications
```

## Architecture in one line

Client -> Backend API -> Supabase Auth / Database / Storage; workers use RabbitMQ, OpenSearch, and the black-box matcher.

## Diagrams

### Requirements

![Requirements](diagrams/exports/requirements.png)
[Open editable file](diagrams/requirements.excalidraw)

### Data model

![Data model](diagrams/exports/data-model.png)
[Open editable file](diagrams/data-model.excalidraw)

### API

![API](diagrams/exports/api-design.png)
[Open editable file](diagrams/api-design.excalidraw)

### Architecture

![Architecture](diagrams/exports/architecture.png)
[Open editable file](diagrams/architecture.excalidraw)

### Flows

![Flows](diagrams/exports/flows.png)
[Open editable file](diagrams/flows.excalidraw)

## Notes

- [Supabase setup](docs/supabase.md)
- [Short deep dives](DEEP_DIVES.md)
- [Estimation](ESTIMATION.md)

## Files

```text
README.md
DEEP_DIVES.md
ESTIMATION.md
docs/supabase.md
diagrams/*.excalidraw
scripts/make-diagrams.mjs
```
