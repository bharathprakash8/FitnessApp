# Admin bootstrap

The first admin can't be created from the app (only admins create users), so it is set up once per Supabase project.

Dev project `fitcoach-dev` (updctclaxbawgtrhtdor): admin is **nidhi@samhithe.in**, created 17 Oct 2026.

## Steps (for a new project, e.g. prod in Milestone 11)

1. **Create the auth user.** Supabase dashboard → Authentication → Users → **Add user** → **Create new user** → enter the email, leave the password empty, tick **Auto Confirm User**.
2. **Make it admin.** Supabase dashboard → SQL Editor → run:

   ```sql
   update public.profiles set role = 'admin', full_name = 'Your Name'
   where email = 'admin@example.com';
   ```

   This is the only hand edit to the database the project allows. It works from the SQL editor because the editor runs as `postgres`; the app itself never lets anyone change their own role.

3. **Check.** Open the app, enter the email, type the 6-digit code from the email. You should land on `/admin`.

## Why the role isn't set at creation

The `on_auth_user_created` trigger reads `role` from `app_metadata`, but Supabase Auth saves `app_metadata` after it inserts the user row, so the trigger sees no role and uses `client`. The `admin-users` Edge Function therefore sets `profiles.role` itself after creating each user.

## Auth settings that matter

Kept in `supabase/config.toml` and applied with `npx supabase config push`:

- `[auth] enable_signup = false` blocks sign-ups.
- `[auth.email] enable_signup = true` must stay on: on the hosted project it switches email login on or off entirely.
- SMTP user and app password come from `supabase/.env` (`SMTP_USER`, `SMTP_PASS`), which is git-ignored.
