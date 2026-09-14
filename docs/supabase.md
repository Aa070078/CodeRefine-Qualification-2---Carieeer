# Supabase choice

Supabase keeps the first version simple:

- **Auth:** email/password or OAuth login and access tokens.
- **Database:** hosted PostgreSQL for profiles, jobs, applications, and history.
- **Storage:** private bucket for resumes and portfolio files; the backend returns short-lived signed links.
- **Realtime (optional):** useful for a new in-app notification count, but it is not required for the core flow.

The browser may read safe public data through Supabase with RLS. Sensitive writes, employer actions, and application status changes go through the backend API.

Example policy idea:

```sql
alter table candidate_profiles enable row level security;

create policy "owner can edit profile"
on candidate_profiles for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
```

The `service_role` key stays on the server. Database backups and Storage file backups should be enabled separately.
