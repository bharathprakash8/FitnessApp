# Go-live checklist

The current Supabase project (`updctclaxbawgtrhtdor`, Mumbai) **is production** (decided
19 Oct 2026) – friends already use it. A separate test project can be added later if needed.

## Before inviting everyone

- [x] **Backups set up** (19 Oct) – secrets set, first run decrypted and checked. Copy the
      passphrase from `C:\Users\Bharath\FitCoach-keys\backup-passphrase.txt` into your password manager.
- [x] **Keep-awake job** – ran green on 19 Oct.
- [ ] **Test accounts removed** – `node scripts/load-test.mjs cleanup`, then ask Claude to delete
      the `test-users` Edge Function and the `TEST_USERS_SECRET` secret.
- [ ] **AI** – Admin → App health shows ✓ for all five models; the daily limit says 1060.
- [ ] **Google Calendar** – OAuth app published ("In production"); one trainer connected.
- [ ] **Android app** – ask Claude to build a fresh APK from the latest code, install it on one
      Android phone and log in.
- [ ] **iPhone** – open the web app, Add to Home Screen, log in, turn on notifications.
- [ ] **Privacy** – Admin → a test user → _Export all their data_ downloads a file;
      _Delete user and ALL their data_ removes them (try it on a test user once).

## Adding a friend

1. Admin → Users → **+** → name, email, role **Client**, pick the trainer → **Add user**.
2. **Copy login instructions** and send them (WhatsApp is fine): the app link, the Android
   download link and the iPhone "Add to Home Screen" steps.
3. They log in with the 6-digit code from their email and go through onboarding.

## Every week (2 minutes)

- Admin → **App health**: everything green? (Database, photos, RAM, AI requests.)
- GitHub → Actions: **Weekly backup** and **Keep database awake** green.

## If something breaks

- Blank or stuck screen: close and reopen the app (iPhone: from the home-screen icon).
- "AI is busy": the free AI quota is used up for the day – manual entry still works; it resets
  around 12:30 pm IST. App health shows how much was used.
- Login codes not arriving: check Gmail SMTP for nidhi@samhithe.in (see `docs/admin-bootstrap.md`).
- Anything else: tell Claude what you saw (a screenshot helps).
