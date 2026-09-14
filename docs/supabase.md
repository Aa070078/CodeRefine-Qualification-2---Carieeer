# Supabase setup for Carieeer

Supabase is the managed platform choice for this design:

- **Auth** handles signup, login, email confirmation and sessions. The application `User` row references `auth.users.id`; it does not store passwords.
- **Database** is Supabase's managed PostgreSQL database. Jobs, profiles, applications and status history stay here because they need foreign keys, a unique candidate/job constraint and transactions.
- **Storage** uses a private bucket for resumes and portfolio files. Store only the object path, owner and scan status in the database. Return a short-lived signed URL after checking access.
- **Realtime** is optional for a small in-app notification badge. The durable Notification table remains the source of truth; a reconnecting client can fetch missed notifications.
- **Edge Functions or the backend worker** can publish outbox events and call the black-box matcher. Do not call the matcher from a browser request.

## Access rules

Enable Row Level Security (RLS) on every table exposed through the Supabase Data API. Keep application status changes behind the backend because they need the transaction, idempotency key and transition check.

Example profile policy:

```sql
alter table candidate_profiles enable row level security;

create policy "candidate reads own profile"
on candidate_profiles for select to authenticated
using ((select auth.uid()) = user_id);

create policy "candidate updates own profile"
on candidate_profiles for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
```

Employer policies should check membership in the `employers` table and the matching `company_id`, not a user editable profile field. Never use `raw_user_meta_data` for authorization; a user can edit it. If role information is placed in JWT `app_metadata`, remember it can be stale until the token refreshes, so sensitive routes also check the current database membership.

Storage policies should bind a file path to the authenticated owner and keep the bucket private:

```sql
create policy "candidate uploads own file"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'career-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
```

The upload route still validates size/MIME/checksum and sends the object to malware scanning before attaching it to an application. The `service_role` key is server-only and never shipped to a browser.

## Backups and limits

Use the Supabase plan's database backups or point-in-time recovery as appropriate, and keep a separate backup/retention policy for Storage objects because database backups contain Storage metadata, not the file bytes. The estimates in [ESTIMATION.md](../ESTIMATION.md) are for choosing database, Auth, Storage and egress capacity; a free project is not assumed to cover the whole envelope.

This is a design submission rather than a connected Supabase project, so the policies above are examples to apply and test in a real project's migrations.
