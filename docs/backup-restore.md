# Backups and restore

A GitHub job (`.github/workflows/backup.yml`) runs **every Monday at 00:00 IST** and can also be
started by hand (GitHub → Actions → **Weekly backup** → **Run workflow**).

- **Database** – every table (profiles, meals, workouts, sessions, summaries…), all login
  accounts, and the database structure (`supabase/migrations`): kept **90 days**, file
  `fitcoach-db-YYYY-MM-DD.tar.gz.gpg`.
- **Photos** – progress photos and meal photos younger than 7 days: kept **35 days**, file
  `fitcoach-photos-YYYY-MM-DD.tar.gz.gpg`.
- Both are **encrypted** (AES-256) before they are stored. This repository is public, so nobody
  can open them without the passphrase.

## Setup (done 19 Oct 2026)

- GitHub secrets `SUPABASE_SERVICE_ROLE_KEY` (copied from the Supabase CLI straight into
  GitHub, never displayed) and `BACKUP_PASSPHRASE`.
- **The passphrase is in `C:\Users\Bharath\FitCoach-keys\backup-passphrase.txt`.** Copy it into
  your password manager too – without it the backups cannot be opened.
- First run checked on 19 Oct: decrypted, 27 tables, 17 login accounts, 7 photos.

If the service key is ever changed in Supabase, ask Claude to update the GitHub secret.

## Restoring (only if something went badly wrong)

Ask Claude to do this with you – it writes data, so it is never done casually. The outline:

1. Download the artifacts (GitHub → Actions → the run → **Artifacts**) and decrypt:

   ```
   gpg --decrypt fitcoach-db-YYYY-MM-DD.tar.gz.gpg > db.tar.gz
   tar -xzf db.tar.gz
   ```

   This gives `db/tables/*.json`, `db/auth-users.json`, `db/manifest.json` and
   `db/migrations/`.

2. In a **new, empty** Supabase project (safest): apply the structure with
   `npx supabase link` + `npx supabase db push` (uses `db/migrations`).
3. Recreate the login accounts with the same ids from `auth-users.json` (Auth admin API), then
   load the tables from `db/tables/` in dependency order with the service key (profiles first,
   then mappings, plans, logs…). Claude writes this script for the exact backup.
4. Point the app at the project (Vercel `VITE_SUPABASE_*`, Edge Function secrets, deploy the
   functions), check logins.
5. Photos: decrypt `fitcoach-photos-…` the same way and upload the folders back into the
   `progress-photos` / `meal-photos` buckets.

## Keep-awake job

`.github/workflows/keepalive.yml` calls the database once a day (08:47 IST) so the free project
never pauses. If it ever fails, open the Supabase dashboard – the project may have been paused –
and press **Restore project**.
