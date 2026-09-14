# Carieeer

Carieeer is a small career website idea. Candidates make a profile, find jobs, apply, and see a simple career plan. Companies publish jobs and review applications.

This is a simple competition design. Supabase is used for login, PostgreSQL data, and private file storage.

## Goals / Scope

- Help candidates show skills, experience, education, goals, and portfolio items.
- Help companies create a company page and job postings.
- Let people search jobs and candidates with filters.
- Use a black-box matching engine to return ranked jobs or candidates.
- Let a candidate apply once to a job and let the employer move the application through a small pipeline.
- Show missing skills for a target job and a basic roadmap.
- Send notifications when useful events happen.

## Assumptions

- One backend API contains clear modules. We do not start with many microservices.
- Supabase is the main platform: Auth, Database (PostgreSQL), and Storage.
- Search and matching are derived features, so they can be a little behind the database.

## Functional Requirements

1. Candidate can sign up, edit profile, skills, experience, education, goals, and portfolio.
2. Employer can create a company profile and publish, edit, or close a job.
3. Candidate and employer can search with keywords and simple filters.
4. Matching sends candidate and job attributes to a black-box engine and stores its score.
5. Candidate can apply, view applications, and cancel an application before a final result.
6. Employer can view applications and use these states: Applied, Screened, Interview, Offer, or Rejected.
7. A candidate/job pair cannot have two active applications.
8. Candidate can request a skill-gap result and a roadmap for a target job.
9. Notifications can be in-app or email and respect user preferences.

## Non-Functional Requirements

- **Availability:** target 99.9% for reading profiles and jobs. A short search outage must not delete applications.
- **Scalability:** add API instances and workers as users and jobs grow.
- **Performance:** normal reads and searches target under 300 ms; matching may be asynchronous.
- **Consistency:** applications and status changes are strongly consistent in PostgreSQL. Search and matches are eventually consistent.
- **Durability:** Supabase backups protect profiles, jobs, and applications. Uploaded files are in a private Storage bucket.
- **Security and privacy:** Supabase Auth, row-level security, roles, HTTPS, and private file links protect candidate information.
- **Reliability:** retries are safe with idempotency keys; failed background work goes to a dead-letter queue.
- **Observability:** logs include request ID and application ID; metrics cover errors, latency, queue depth, and notification delivery.
- **Maintainability:** a small modular backend and documented state transitions keep the project easy to change.

## Data Model

Supabase PostgreSQL is the transactional source of truth. Main tables are `users`, `candidate_profiles`, `companies`, `jobs`, `skills`, `candidate_skills`, `job_skills`, `applications`, `application_status_history`, `matches`, `skill_gaps`, `roadmaps`, `notifications`, and `notification_preferences`.

The important rule is a database unique constraint on `(candidate_id, job_id)` in `applications`. Search indexes, cached matches, and notifications are copies or events derived from this database.

See [the small data model diagram](diagrams/data-model.excalidraw).

## API Design

The API is REST-like and uses JSON. Every protected route needs a Supabase access token.

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/register` | Create account through Supabase Auth |
| POST | `/auth/login` | Login and return session |
| GET/PATCH | `/me/profile` | Read or edit candidate profile |
| POST | `/companies` | Create company profile |
| POST/PATCH | `/companies/:id/jobs` | Create or edit a job |
| GET | `/jobs?q=&skill=&min_salary=` | Search jobs |
| GET | `/candidates?q=&skill=` | Search public candidate profiles |
| GET | `/me/matches` | Read saved match results |
| POST | `/jobs/:id/applications` | Apply to a job |
| GET | `/me/applications` | List candidate applications |
| PATCH | `/applications/:id/status` | Employer changes status |
| POST | `/me/skill-gaps` | Calculate missing skills for a job |
| POST | `/me/roadmaps` | Create a simple roadmap |
| GET | `/me/notifications` | List notifications |

`POST /jobs/:id/applications` accepts an `Idempotency-Key`. The backend starts a transaction, checks the unique candidate/job rule, inserts the application, and publishes an event after commit. A duplicate returns `409 Conflict` (or the original result for the same idempotency key).

For status changes, the request contains `status` and `expected_version`. The server accepts only valid next states and increases the version in the same transaction. Invalid transitions return `409 Conflict`. Each accepted change adds one append-only status-history row.

Common errors are `400` invalid input, `401` not logged in, `403` not allowed, `404` missing record, `409` duplicate/conflict, and `429` rate limit.

See [the API diagram](diagrams/api-design.excalidraw).

## High-Level Architecture

1. Web or mobile client calls one backend API.
2. Backend modules handle Auth, Profile, Company/Jobs, Applications, Search, Matching, Career, and Notifications.
3. Supabase Auth handles identity. Supabase PostgreSQL stores the truth. Supabase Storage stores resumes and portfolio files.
4. A small queue (RabbitMQ in this design) sends indexing, matching, and notification jobs to workers.
5. OpenSearch is an optional derived search index. The black-box matching engine is called by a worker and its result is stored in `matches`.

See [the architecture diagram](diagrams/architecture.excalidraw).

## Critical Flows

**Publish job:** save the job in PostgreSQL, publish `JobPublished`, index it, ask the black-box matcher for affected candidates, save matches, and send notifications. Only the database write is on the request path.

**Apply:** validate the job and candidate, use a transaction plus the unique rule, write `Applied` and its history row, then publish `ApplicationCreated`. Notification delivery happens later.

See [the flow diagram](diagrams/flows.excalidraw).

## Application Pipeline

| Current state | Allowed next state |
|---|---|
| Applied | Screened or Rejected |
| Screened | Interview or Rejected |
| Interview | Offer or Rejected |
| Offer | none |
| Rejected | none |

## Simple Deep Dives

The main decisions and failure handling are in [DEEP_DIVES.md](DEEP_DIVES.md).

## Estimation

Small planning numbers are in [ESTIMATION.md](ESTIMATION.md).

## Supabase Notes

See [docs/supabase.md](docs/supabase.md) for the selected Supabase services and a basic RLS example.

## Repository Structure

```text
README.md
DEEP_DIVES.md
ESTIMATION.md
docs/supabase.md
diagrams/*.excalidraw
scripts/make-diagrams.mjs
```

## Diagram Index

- [Requirements](diagrams/requirements.excalidraw)
- [Data model](diagrams/data-model.excalidraw)
- [API](diagrams/api-design.excalidraw)
- [Architecture](diagrams/architecture.excalidraw)
- [Flows](diagrams/flows.excalidraw)
