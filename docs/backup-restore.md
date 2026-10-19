# Backups and restore

A GitHub job (`.github/workflows/backup.yml`) runs **every Monday at 00:00 IST** and can also be
started by hand (GitHub → Actions → **Weekly backup** → **Run workflow**).

- **Database** (accounts, profiles, meals, workouts, sessions, summaries… everything):
  kept **90 days**, file `fitcoach-db-YYYY-MM-DD.tar.gz.gpg`.
- **Photos** (progress photos, and meal photos younger than 7 days): kept **35 days**, file
  `fitcoach-photos-YYYY-MM-DD.tar.gz.gpg`.
- Both are **encrypted** with your backup passphrase before they are stored. This repository is
  public, so nobody can read them without the passphrase. **Keep the passphrase safe** (for
  example in a password manager) – without it the backups cannot be opened.

## One-time setup (GitHub secrets)

Run these in a terminal in the FitnessApp folder. Each command **asks you to paste the value**
(nothing is shown or saved in the project). Never paste them into chat.

1. **Database address** – Supabase dashboard → your project → **Connect** (top) →
   **Session pooler** → copy the URI. Replace `[YOUR-PASSWORD]` with the database password
   (Project Settings → Database → _Reset database password_ if you don't have it).

   ```
   gh secret set SUPABASE_DB_URL
   ```

2. **Backup passphrase** – make up a long passphrase (5+ random words), save it in your password
   manager first, then:

   ```
   gh secret set BACKUP_PASSPHRASE
   ```

3. **Photos (optional but recommended)** – Supabase dashboard → Project Settings → **API Keys** →
   copy the **secret** key (`sb_secret_…`), then:

   ```
   gh secret set SUPABASE_SERVICE_ROLE_KEY
   ```

4. Test it: GitHub → **Actions** → **Weekly backup** → **Run workflow**. Both jobs should turn
   green, and the run page lists the encrypted files under **Artifacts**.

## Restoring (only if something went badly wrong)

You need: the backup file from the Actions run, your passphrase, and a terminal with
`gpg`, `psql` (PostgreSQL 17 client) and the Supabase CLI. Ask Claude to do this with you – it
overwrites data, so it is never done casually.

1. Download the artifact (GitHub → Actions → the run → Artifacts) and unzip it.
2. Decrypt and unpack:

   ```
   gpg --decrypt fitcoach-db-YYYY-MM-DD.tar.gz.gpg > db.tar.gz
   tar -xzf db.tar.gz        # gives roles.sql, schema.sql, data.sql
   ```

3. Restore into a **new, empty** Supabase project (safest), using its Session pooler URI:

   ```
   psql --single-transaction --variable ON_ERROR_STOP=1 \
     --file roles.sql --file schema.sql \
     --command 'SET session_replication_role = replica' \
     --file data.sql --dbname "<new project session pooler URI>"
   ```

4. Point the app at the new project (Vercel `VITE_SUPABASE_*` values, Edge Function secrets,
   `supabase link`), deploy the Edge Functions, and check logins.
5. Photos: decrypt `fitcoach-photos-…` the same way and upload the folders back into the
   `progress-photos` / `meal-photos` buckets (Claude can script this).

## Keep-awake job

`.github/workflows/keepalive.yml` calls the database once a day (08:47 IST) so the free project
never pauses. If it ever fails, open the Supabase dashboard – the project may have been paused –
and press **Restore project**.
