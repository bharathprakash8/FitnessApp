# FitCoach – Claude Code Instructions

This single file contains everything: Part 1 is the rules, Part 2 is the full build plan.

# Part 1 – Rules for Claude Code

You are building **FitCoach**, a private fitness coaching app. The full specification, schema and milestones are in Part 2 of this file. Read it before starting any milestone, and update the **Status** table at the end of this file when a milestone is done.

## The owner
- The owner (Bharath) is not a full-time developer. Explain what you are doing in plain language, keep steps short, and tell him exactly what to click or type when he must act (dashboards, keys, phone testing).
- Ask before making decisions not covered by this file. Offer a recommended option.
- Never ask him to paste secret keys into this chat. When a secret is needed, give him the exact command (e.g. `npx supabase secrets set GEMINI_API_KEY=`) to run himself in a separate terminal.

## Product in one paragraph
One admin creates trainers and clients and maps each client to one trainer. Trainers plan workouts, set calorie targets, run in-person or Google Meet sessions and review their clients. Clients (about 20, all friends, not charged) log food by photo or text (Gemini estimates calories), log workouts, and get calories burnt from their phone. Android users install an APK (Capacitor); iPhone users use the same app as a PWA from Safari's "Add to Home Screen". The whole thing must run for a year at about ₹0.

## Stack (do not change without asking)
- **Frontend:** React 18+ with TypeScript (strict), Vite, Ionic React, React Router, TanStack Query, `vite-plugin-pwa`
- **Android:** Capacitor (same codebase) with Health Connect, Local Notifications, Push Notifications, Camera plugins
- **Backend:** Supabase – Postgres with Row Level Security, Auth (email OTP code), Storage, Edge Functions (Deno/TypeScript), `pg_cron` + `pg_net`
- **Push:** Firebase Cloud Messaging only (web push for the PWA, FCM for Android). No other Firebase services except App Distribution.
- **AI:** Gemini API, called **only** from Edge Functions, model from the `GEMINI_MODEL` secret, structured JSON output
- **Hosting:** Vercel (Hobby). **Errors:** Sentry (optional). **CI/ops:** GitHub Actions.

## Non-negotiable rules
1. **Security:** RLS on every table, enabled in the same migration that creates the table. Never expose the Supabase secret/service-role key, Gemini key, YouTube key or Firebase service account to the frontend. Frontend uses only the publishable key.
2. **Secrets:** never commit `.env*`, `google-services.json`, keystores or service-account files. Keep `.gitignore` up to date. Provide `.env.example` with variable names only.
3. **Database changes only through migrations** in `supabase/migrations/` (`npx supabase migration new <name>`). Never edit the dev database by hand except the documented admin bootstrap.
4. **Free tier discipline:** compress images on the device before upload (max 1280px longest side, JPEG ~0.7, target ≤ 150 KB). Meal photos are deleted after 7 days by a scheduled job. No paid services.
5. **Mobile-first UI**, tested at 375px width. Large tap targets. Works in the iPhone home-screen PWA and the Android APK.
6. **Login is email OTP (6-digit code)**, never magic links, with `shouldCreateUser: false`. Only admins create users.
7. **AI output is an estimate:** always shown as "Estimated", always editable by the client before saving. No medical advice anywhere in prompts or UI.
8. **Small, working steps:** build one milestone at a time, commit after each working step with clear messages, push at the end of each milestone.
9. **Verify before claiming done:** run `npm run build` and `npm run lint` with no errors, run the RLS checks for any new tables, and give the owner a short phone test checklist.
10. **Time zone:** store timestamps in UTC; display and schedule in each user's `timezone` (default `Asia/Kolkata`).

## Conventions
- Folders: `src/features/<feature>/` (components, hooks, api), `src/components/` (shared UI), `src/lib/` (supabase client, firebase, utils), `supabase/functions/<name>/`, `supabase/migrations/`.
- Generate DB types with `npx supabase gen types typescript --linked > src/lib/database.types.ts` after each migration and use them.
- Data access through TanStack Query hooks in each feature's `api.ts`.
- Edge Functions: validate input (zod), verify the caller's JWT and role, return JSON `{ data } | { error }`, log errors without secrets.
- Units: kg, cm, kcal, grams, ml. Indian English copy, simple and friendly.

## Useful commands
- `npm run dev` – local app at http://localhost:5173
- `npx supabase db push` – apply migrations to the linked project
- `npx supabase functions deploy <name>` – deploy a function
- `npx supabase gen types typescript --linked > src/lib/database.types.ts`
- `npx cap sync android` – copy the web build into the Android project

---

# Part 2 – Build Plan

Work milestone by milestone (section 9). Update the **Status** table at the end after each milestone.

---

## 1. Users and roles

| Role | Who | Can do |
|---|---|---|
| `admin` | Bharath (owner) | Create, edit, deactivate and delete users; set roles; map each client to a trainer; view everything |
| `trainer` | Personal trainer(s) | Manage only the clients mapped to them: plans, targets, sessions, recipe playlists, chat, weekly summaries |
| `client` | ~20 friends | Their own data only: food, workouts, activity, measurements, sessions, chat with their trainer |

Rules:
- One role per account. If Bharath also wants to act as a trainer, he creates a separate trainer account.
- Each client belongs to **exactly one** trainer at a time (reassignable by admin). A trainer can have many clients.
- Sign-up is disabled. Users exist only when the admin creates them.
- A deactivated user cannot log in; their data is kept.

---

## 2. Architecture

```
React + Ionic PWA (Vercel)  ──┐
Android APK (Capacitor)      ─┴─► Supabase
                                   ├── Auth (email OTP)
                                   ├── Postgres + RLS
                                   ├── Storage (private buckets)
                                   ├── Edge Functions ──► Gemini API
                                   │                  ──► Firebase Cloud Messaging (push)
                                   │                  ──► YouTube Data API
                                   │                  ──► Google Calendar API (Meet)
                                   └── pg_cron + pg_net (scheduled jobs → Edge Functions)
iPhone Shortcuts app ──► Edge Function `health-sync` (Apple Health data, nightly)
Android Health Connect ──► app ──► Supabase (on app open + daily)
GitHub Actions ──► daily keep-alive ping, weekly database backup
```

---

## 3. Project structure

```
fitcoach-app/
├── CLAUDE.md
├── .env.example
├── index.html
├── vite.config.ts            (vite-plugin-pwa configured)
├── capacitor.config.ts       (appId com.fitcoach.app, appName FitCoach)
├── public/                   (icons, manifest assets, firebase-messaging-sw.js)
├── src/
│   ├── main.tsx, App.tsx     (router, role-based layouts)
│   ├── lib/                  (supabase.ts, firebase.ts, database.types.ts, image.ts, dates.ts, offlineQueue.ts)
│   ├── components/           (shared UI)
│   └── features/
│       ├── auth/             (login, OTP, session, role guard)
│       ├── admin/            (users, create user, assignments)
│       ├── onboarding/       (consent, profile quiz, permissions, iPhone install + Shortcut setup)
│       ├── today/
│       ├── food/
│       ├── workouts/
│       ├── activity/
│       ├── healthyFood/
│       ├── progress/
│       ├── sessions/
│       ├── chat/
│       ├── notifications/
│       └── trainer/          (dashboard, client detail, plans, weekly summaries)
├── android/                  (generated by Capacitor in Milestone 4)
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   └── functions/
│       ├── _shared/          (cors, auth helpers, gemini client, fcm client)
│       ├── admin-users/
│       ├── analyze-meal/
│       ├── health-sync/
│       ├── send-push/
│       ├── cron-meal-reminders/
│       ├── cron-photo-cleanup/
│       ├── cron-weekly-summary/
│       ├── youtube-playlist/
│       └── calendar-session/
└── .github/workflows/        (keepalive.yml, backup.yml)
```

---

## 4. Data model (Postgres, schema `public`)

All tables: `id uuid primary key default gen_random_uuid()` unless stated, `created_at timestamptz default now()`. RLS enabled on every table.

### Identity and mapping
**profiles** – one row per auth user, created automatically by a trigger on `auth.users` insert.
- `id uuid pk references auth.users on delete cascade`
- `email text unique not null`, `full_name text`, `phone text`
- `role text not null default 'client' check (role in ('admin','trainer','client'))`
- `is_active boolean not null default true`
- `timezone text not null default 'Asia/Kolkata'`
- Client profile fields: `date_of_birth date`, `sex text`, `height_cm numeric`, `goal text`, `diet_preference text check in ('veg','egg','non_veg','vegan')`, `injuries text`
- `consent_at timestamptz`, `onboarded_at timestamptz`
- `health_sync_token_hash text` (sha-256 of the iPhone Shortcut token)

**trainer_clients** – the mapping.
- `client_id uuid primary key references profiles(id) on delete cascade` (one trainer per client)
- `trainer_id uuid not null references profiles(id)`
- `assigned_at timestamptz default now()`, `assigned_by uuid references profiles(id)`
- Check (via trigger): `client_id` has role `client`, `trainer_id` has role `trainer`.

### Coaching
**targets** – `client_id`, `calories int`, `protein_g int`, `carbs_g int`, `fat_g int`, `effective_from date`, `set_by uuid`. Latest row by `effective_from` applies.

**exercises** – `trainer_id uuid null` (null = shared library), `name`, `muscle_group`, `equipment`, `demo_url`, `cues text`.

**workout_plans** – `trainer_id`, `name`, `description`.
**plan_days** – `plan_id`, `day_index int`, `title`.
**plan_exercises** – `plan_day_id`, `exercise_id`, `sort_order`, `sets int`, `reps text` (e.g. "8-10"), `rest_seconds int`, `notes`.
**plan_assignments** – `plan_id`, `client_id`, `start_date`, `is_active boolean`.

**workout_logs** – `client_id`, `performed_on date`, `plan_day_id null`, `exercise_id`, `set_number int`, `reps int`, `weight_kg numeric`, `duration_min numeric null`.

### Nutrition and activity
**meal_logs** – `client_id`, `eaten_at timestamptz`, `meal_type text check in ('breakfast','lunch','snack','dinner')`, `source text check in ('photo','text','manual')`, `photo_path text null`, `photo_deleted boolean default false`, `input_text text`, `items jsonb` (array of `{name, portion, calories, protein_g, carbs_g, fat_g, confidence}`), `total_calories int`, `protein_g`, `carbs_g`, `fat_g` numeric, `edited boolean default false`.

**ai_usage** – `user_id`, `used_on date`, `feature text`, `count int`; unique (`user_id`,`used_on`,`feature`). Used for daily caps.

**activity_daily** – primary key (`client_id`, `activity_date`); `active_calories int`, `resting_calories int null`, `steps int`, `sleep_minutes int`, `source text check in ('health_connect','apple_shortcut','manual','estimated')`, `updated_at`.

**habits_daily** – primary key (`client_id`, `habit_date`); `water_ml int`.

**measurements** – `client_id`, `measured_on date`, `weight_kg`, `waist_cm`, `notes`, `photo_paths text[]`.

### Sessions, content, communication
**sessions** – `trainer_id`, `title`, `starts_at timestamptz`, `duration_min int`, `type text check in ('in_person','online')`, `meet_url text`, `calendar_event_id text`, `notes`.
**session_attendees** – primary key (`session_id`, `client_id`); `status text check in ('invited','present','missed') default 'invited'`.

**recipe_playlists** – `trainer_id`, `category text`, `title`, `youtube_playlist_id`, `sort_order`.
**youtube_cache** – `playlist_id text pk`, `payload jsonb`, `fetched_at` (refresh at most every 24 h to save quota).

**messages** – `trainer_id`, `client_id`, `sender_id`, `body`, `read_at`.

**reminder_settings** – `client_id pk`, `enabled boolean default true`, `breakfast_time time default '08:30'`, `lunch_time '13:30'`, `snack_time '17:00'`, `dinner_time '20:30'`, `workout_reminder_time time null`.
**push_tokens** – `user_id`, `token text unique`, `platform text check in ('web','android')`, `last_seen_at`.
**notification_log** – `user_id`, `kind text`, `ref_date date`, `sent_at`; unique (`user_id`,`kind`,`ref_date`) to avoid duplicate reminders.

**weekly_summaries** – `client_id`, `week_start date`, `stats jsonb`, `summary_text`, `status text check in ('draft','shared') default 'draft'`; unique (`client_id`,`week_start`).

**integration_tokens** – `owner_id`, `provider text` ('google_calendar'), `refresh_token_encrypted text`, `scope`, `updated_at`. RLS: no client access at all; read only by Edge Functions with the service role.

### Helper functions (SQL, `security definer`, `set search_path = public`)
- `app_role()` → role of `auth.uid()` (null if inactive)
- `is_admin()` → `app_role() = 'admin'`
- `is_trainer_of(client uuid)` → exists row in `trainer_clients` with `trainer_id = auth.uid()` and `client_id = client`
- `my_trainer()` → trainer id of the current client

### RLS policy pattern
| Table type | Client | Trainer | Admin |
|---|---|---|---|
| `profiles` | Select/update own row (cannot change `role`, `is_active`, `email` – enforce with a trigger or column grants) | Select profiles of mapped clients; update their own row | All |
| `trainer_clients` | Select own row | Select rows where they are trainer | All |
| Client-owned data (`meal_logs`, `workout_logs`, `activity_daily`, `habits_daily`, `measurements`, `reminder_settings`, `push_tokens` own) | Full CRUD on own rows | Select for mapped clients | All |
| `targets`, `plan_assignments`, `weekly_summaries` | Select own (`weekly_summaries` only when `shared`) | Full CRUD for mapped clients | All |
| Trainer-owned (`workout_plans`, `plan_days`, `plan_exercises`, `exercises`, `sessions`, `recipe_playlists`) | Select when assigned / invited / owned by `my_trainer()`; shared exercises readable by all | Full CRUD on own | All |
| `session_attendees` | Select own | CRUD for own sessions | All |
| `messages` | Select/insert where `client_id = auth.uid()` | Select/insert for mapped clients | Select |
| `ai_usage`, `notification_log`, `youtube_cache`, `integration_tokens` | None (service role only) | None | Select (except tokens) |

### Storage (private buckets)
- `meal-photos/{client_id}/{yyyy-mm-dd}/{uuid}.jpg` – owner read/write, mapped trainer read, admin read. Deleted after 7 days.
- `progress-photos/{client_id}/{uuid}.jpg` – same access. Kept (small volume).
- `exercise-media/{trainer_id}/...` – trainer write, authenticated read.
Use signed URLs (1 hour) to display images.

### RLS tests
Create `supabase/tests/rls_checks.sql` (or a small script) that, using test users, confirms: client A cannot read client B's rows; trainer X cannot read clients of trainer Y; client cannot change own role; deactivated user gets no rows. Run after every migration that adds tables.

---

## 5. Edge Functions

All functions: CORS for the app origin(s), zod input validation, JWT check, role check, JSON responses, no secrets in logs.

| Function | Caller | What it does |
|---|---|---|
| `admin-users` | Admin only | Actions: `create` (email, full_name, phone, role, trainer_id for clients) → `auth.admin.createUser({ email, email_confirm: true })`, update profile, insert mapping; `update` (name, phone, role); `assign` (client → trainer, reassign); `deactivate` / `reactivate` (set `is_active`, ban/unban in Auth); `delete` (only users with no data, else deactivate). Optionally emails a welcome note with the app link. Writes nothing to the frontend that includes secrets. |
| `analyze-meal` | Client | Input `{ photo_path? , text?, meal_type }`. Checks daily cap (15 per client per day via `ai_usage`). Downloads the photo with the service role (must belong to caller), calls Gemini with the prompt in section 6 and a JSON response schema, validates output with zod, optionally cross-checks against a small built-in table of common Indian foods, returns items. Does **not** save the meal – the client confirms first. |
| `health-sync` | iPhone Shortcut | Header `X-Sync-Token`. Hash and match `profiles.health_sync_token_hash`. Body `{ date, active_calories, resting_calories?, steps?, sleep_minutes? }` (allow last 7 days). Upsert `activity_daily` with `source = 'apple_shortcut'`. Rate limit 20 calls per day per user. |
| `send-push` | Other functions (service role) | Sends to all `push_tokens` of given user ids through FCM HTTP v1 using `FIREBASE_SERVICE_ACCOUNT_JSON`. Removes invalid tokens. |
| `cron-meal-reminders` | pg_cron every 15 min | For clients with reminders enabled, converts now to their timezone; if a meal time just passed (within the 15-min window) and that meal isn't logged today and `notification_log` has no entry, sends "Time to log your lunch 🍛" and logs it. Also session reminders 15 min before `starts_at`. |
| `cron-photo-cleanup` | pg_cron weekly (Sunday 23:00 IST) | Deletes `meal-photos` objects older than 7 days through the Storage API, sets `photo_deleted = true` and `photo_path = null`. |
| `cron-weekly-summary` | pg_cron Monday 06:00 IST | Per client: compute stats for the past week (workouts done vs planned, avg intake vs target, avg burn, net balance, weight change, days without logs), ask Gemini for a 4–6 line plain summary for the trainer, upsert `weekly_summaries` as `draft`. |
| `youtube-playlist` | Client/trainer | Returns playlist videos (title, thumbnail, videoId) from `youtube_cache`, refreshing from YouTube Data API if older than 24 h. |
| `calendar-session` | Trainer | Milestone 7. Creates/updates/cancels a Google Calendar event with a Meet link using the admin's connected Workspace account (`conferenceData.createRequest`), invites trainer and attendees, stores `meet_url` and `calendar_event_id`. Includes the OAuth connect/callback endpoints. |

Schedule jobs with `pg_cron` + `pg_net` calling the function URLs, with the service key stored in Supabase Vault (never in the migration file). Document the schedule SQL in a migration that reads the key from Vault.

---

## 6. AI prompts (Gemini, called from Edge Functions only)

### Meal analysis
System instruction:
> You are a nutrition estimation assistant for an Indian fitness coaching app. Identify each distinct food item in the meal photo or description. Estimate a realistic portion size for each and its calories, protein, carbohydrates and fat. Recognise Indian dishes accurately (for example idli, dosa, sambar, chapati, rajma chawal, paneer dishes, biryani, poha, upma) and account for typical home-style oil or ghee use. If the input is not food, return an empty items array. Never give medical or diet advice. Return only JSON matching the schema.

User content: the image (or text) plus `Diet preference: <veg|egg|non_veg|vegan>. Meal type: <lunch>.`

Response schema:
```json
{
  "items": [{ "name": "string", "portion": "string", "calories": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0, "confidence": "high|medium|low" }],
  "follow_up_question": "string or null",
  "total_calories": 0
}
```
`follow_up_question` is used when an important detail is unclear (for example "How many chapatis?"). The app shows it with quick-answer buttons and re-runs or adjusts.

### Weekly summary
> Write a short, encouraging, factual summary for a personal trainer about one client's past week, using only the numbers provided. 4–6 lines. Mention consistency, nutrition vs target, activity, and one thing to focus on next week. Do not give medical advice or diagnose. If intake is far below target or falling sharply, add a neutral note for the trainer to check in.

---

## 7. Screens

### Shared
- **Login:** email → "Send code" → 6-digit code entry. Clear error if the account doesn't exist or is deactivated ("Ask your trainer/admin for access").
- After login, route by role: admin → `/admin`, trainer → `/trainer`, client → `/today` (or `/onboarding` if `onboarded_at` is null).

### Admin console (`/admin`) – Milestone 0
- **Users list:** search, filter by role and status; columns name, email, role, trainer (for clients), status, created.
- **Create user:** full name, email, phone, role; if role = client, pick trainer (required). Shows success with "Share login instructions" (copyable text with the app link, Android APK link, iPhone install steps).
- **User detail / edit:** change name, phone, role (warn when changing a trainer who has clients), reassign trainer, deactivate/reactivate, delete (only if no data).
- **Assignments view:** each trainer with their clients; move a client to another trainer.
- Admin can also open any trainer or client view read-only (nice to have).

### Client (bottom tabs)
1. **Today:** calories in vs target ring, burn (active + resting estimate), net balance, today's workout card, next session with **Join** button (opens `meet_url`), water tracker, reminders due.
2. **Log food:** camera / gallery / type it; AI result card with editable items and portions (stepper ×0.5, ×1, ×1.5, ×2 and free edit), follow-up question chips, confirm → saved. Meal history by day.
3. **Workouts:** assigned plan, today's day, exercise detail (demo video, cues), set logger (reps, kg), history and personal bests.
4. **Healthy food:** trainer's playlists by category, in-app YouTube embed, save favourites.
5. **Me:** progress charts (weight, intake, burn, workouts per week), measurements + progress photos, reminder settings, health sync status and setup, chat with trainer, privacy & data (export request, delete account request), log out.

### Onboarding (client, first login)
1. Welcome
2. **Consent** (must accept): what is collected (profile, food photos, food and workout logs, activity from phone, measurements), who can see it (your trainer and the admin), photos analysed by Google's Gemini AI and may be used by Google to improve its services (free tier) – photograph only your food, meal photos deleted after 7 days, you can ask for your data to be deleted any time. Health disclaimer: consult a doctor before starting a new programme; calories are estimates.
3. Profile quiz (DOB, sex, height, weight, goal, diet preference, injuries)
4. Notifications permission (on iPhone: first show "Add to Home Screen" steps if not installed as PWA – detect `display-mode: standalone`)
5. Activity sync: Android → Health Connect permission; iPhone → Shortcut setup page (Milestone 4)

### Trainer (bottom tabs)
1. **Dashboard:** client cards with flags – no food log in 2 days, missed planned workouts, intake < 70% or > 120% of target (3-day avg), weekly summary ready.
2. **Clients:** list → client detail tabs: Overview, Food log (with photos while available), Workouts, Activity, Measurements, Targets (edit), Plan (assign), Summary (edit & share), Notes.
3. **Plans:** plan builder (days → exercises with sets/reps/rest), exercise library (add own with demo URL), assign to clients.
4. **Sessions:** calendar list, create session (in person / online, pick clients), Join button for online, mark attendance after.
5. **More:** recipe playlists (add YouTube playlist link + category), chat inbox, profile.

---

## 8. Platform specifics

### iPhone (PWA)
- Manifest: name, short_name, icons (192, 512, maskable), `display: standalone`, theme colour.
- Web push via Firebase JS SDK messaging + `public/firebase-messaging-sw.js` (iOS 16.4+, only after Add to Home Screen; permission requested from a button tap).
- **Apple Health via Shortcuts:** Me → Health sync → "Set up iPhone sync": generate a random token (show once, store hash), show the endpoint URL and token with copy buttons, link to the shared Shortcut, and step-by-step instructions with screenshots placeholders:
  1. Install the "FitCoach Sync" shortcut (owner creates it once in the Shortcuts app and shares the iCloud link; document how to build it in `docs/iphone-shortcut.md`: Find Health Samples – Active Energy (today, sum), Resting Energy, Steps, Sleep → Get Contents of URL, POST JSON to the endpoint with header `X-Sync-Token`).
  2. Create a Personal Automation: Time of Day 22:00 daily (and 07:00 for the previous day as backup), Run Immediately.
- Manual entry fallback: "Enter today's active calories" card when no sync for the day.

### Android (Capacitor APK)
- `appId: com.fitcoach.app`. `google-services.json` placed in `android/app/` (git-ignored).
- Health Connect: choose a maintained Capacitor Health Connect plugin (check npm activity and Android 14+ support; explain the choice). Read active calories burned, total calories burned, steps, sleep for the last 7 days on app open and once a day; upsert `activity_daily` with `source = 'health_connect'`. Handle "Health Connect not installed" with a Play Store link.
- Notifications: `@capacitor/push-notifications` (FCM) + `@capacitor/local-notifications` for meal reminders scheduled on device (keep server reminders for iPhone only, or dedupe via `notification_log`).
- Onboarding step asking users to set battery usage to Unrestricted (Xiaomi/Oppo/Vivo/Realme/OnePlus).
- Signed release APK; distribute through Firebase App Distribution. Document the build and upload steps in `docs/android-release.md`.

### Offline
- `offlineQueue.ts`: if a meal/workout/water save fails due to no network, store it in IndexedDB and retry on reconnect; show a "Saved offline – will sync" badge. Photo analysis needs a network; offer text/manual entry offline.

---

## 9. Milestones

Each milestone ends with: `npm run build` + `npm run lint` clean, migrations pushed to dev, functions deployed, RLS checks passing (when tables change), a commit + push, a phone test checklist for the owner, and the Status section updated.

### Milestone 0 – Foundation + Admin console
- Scaffold Vite + React + TS + Ionic + Router + TanStack Query + PWA plugin; ESLint/Prettier; `.env.example`; `.gitignore`; `vercel.json` with an SPA rewrite so deep links work.
- Supabase: `supabase init`, link dev project, migrations for `profiles` (+ trigger from `auth.users`), `trainer_clients`, helper functions, RLS; role/is_active protection trigger.
- Auth: email OTP login, session persistence, role-based routing and guards, deactivated-user handling.
- `admin-users` Edge Function and the full Admin console (section 7).
- Placeholder home screens for trainer and client.
- Deploy: push to GitHub; guide the owner to connect the GitHub repo to Vercel, add the VITE_ environment variables, and add the Vercel URL to Supabase Auth URL settings.
- **Done when:** owner (admin) logs in with a code, creates 1 trainer and 2 clients, maps them, each logs in and lands on the right home; RLS checks prove isolation; works on Vercel URL on a phone.

### Milestone 1 – Onboarding, profiles, targets
- Client onboarding flow with consent (blocks app until accepted), profile quiz.
- Trainer: client list (only mapped clients), client detail Overview, set targets.
- **Done when:** a new client completes onboarding; trainer sees them and sets targets; client sees targets on Today.

### Milestone 2 – Workouts
- Exercise library (seed ~40 common gym and home exercises with cues; demo URLs optional), plan builder, assignment, client workout view and set logging, history and personal bests.
- **Done when:** trainer builds and assigns a 3-day plan; client logs a session; trainer sees it.

### Milestone 3 – Food logging with AI
- Image compression, upload to `meal-photos`, `analyze-meal` function with Gemini, result card with edit + follow-up, save meal, daily totals vs target, meal history; text logging; manual entry; daily AI cap.
- `cron-photo-cleanup` scheduled weekly.
- **Done when:** owner logs 5 real meals by photo and 2 by text on a phone; totals update; trainer sees the log; cleanup job tested on dev with a short interval then set to weekly.

### Milestone 4 – Activity (calories burnt) + Android app
- Capacitor Android project, Health Connect integration, manual entry fallback, estimated burn from logged workouts when no device data (MET × kg × hours, labelled "Estimated").
- `health-sync` function + iPhone Shortcut setup page + `docs/iphone-shortcut.md`.
- Net balance on Today and in trainer view.
- `docs/android-release.md`; first signed APK uploaded to Firebase App Distribution.
- **Done when:** one Android phone shows burn from Health Connect; one iPhone shows burn after running the Shortcut manually.

### Milestone 5 – Notifications
- FCM web push (PWA) and Android push; token registration; reminder settings; `send-push`, `cron-meal-reminders` (+ session reminders); "Send test notification" button in Me.
- **Done when:** test notification arrives on Android (APK) and iPhone (home-screen PWA); a meal reminder fires at the set time only if the meal isn't logged.

### Milestone 6 – Offline + PWA polish
- Offline queue, install guidance for iPhone, app icons/splash, loading and empty states, error boundaries, Sentry (if DSN provided).
- **Done when:** a meal logged in airplane mode syncs after reconnecting; Lighthouse PWA checks pass.

### Milestone 7 – Sessions (Google Calendar + Meet)
- Guide the owner to create an **Internal** OAuth consent screen and OAuth client in the Workspace Google Cloud project with the Calendar events scope; admin connects once in the Admin console; tokens stored encrypted in `integration_tokens`.
- `calendar-session` function; trainer creates sessions; clients see Join; attendance marking; session reminders.
- **Done when:** trainer schedules an online session; clients get the calendar invite and see Join in the app; attendance is saved.

### Milestone 8 – Healthy food videos
- Trainer adds playlists by category; `youtube-playlist` with 24 h cache; client browsing, in-app player, favourites.
- **Done when:** client watches a recipe video from a trainer-curated playlist inside the app.

### Milestone 9 – Trainer dashboard + weekly AI summary
- Dashboard flags; `cron-weekly-summary`; trainer edits and shares; client sees shared summary.
- **Done when:** running the job on dev produces summaries for test clients; trainer shares one.

### Milestone 10 – Progress, habits, chat
- Measurements, progress photos (private), charts, water tracking, trainer–client chat (Supabase Realtime) with push on new message.
- **Done when:** client adds weight and a progress photo; charts render; chat works both ways with a push notification.

### Milestone 11 – Operations and go-live
- `.github/workflows/keepalive.yml`: daily request to the Supabase REST API (prevents free-tier pause).
- `.github/workflows/backup.yml`: weekly `pg_dump` using `SUPABASE_DB_URL`, uploaded as a workflow artifact (90-day retention); document restore steps in `docs/backup-restore.md`.
- Prod project setup (second Supabase project with the same Auth settings, migrations, functions, secrets, Vercel production env vars, admin bootstrap); data export for a client (JSON) for privacy requests.
- **Done when:** both workflows run green; go-live checklist complete.

---

## 10. Out of scope
Group challenges and leaderboards, payments, public app store listings, Apple Watch app, video form-check.

---

## 11. Status
Update after each milestone: date, what was built, anything deferred, open issues.

| Milestone | Status | Date | Notes |
|---|---|---|---|
| 0 Foundation + Admin | Done (owner phone test passed) | 17 Oct 2026 | Dev: Supabase `fitcoach-dev` (updctclaxbawgtrhtdor, Mumbai), Vercel `samhithe/fitcoach` → https://fitcoach-ten-nu.vercel.app. Admin: nidhi@samhithe.in (see docs/admin-bootstrap.md). Login codes sent via Gmail SMTP from nidhi@samhithe.in. RLS checks `npm run db:test`; function checks `scripts/test-admin-users.ps1`. Open: Vercel ↔ GitHub auto-deploy not connected yet (deploys via `npx vercel --prod`); Android APK link in login instructions comes in M4. Clients can also read their own trainer's profile (for name/chat). |
| 1 Onboarding, targets | Done (owner phone test passed) | 17 Oct 2026 | Client onboarding (welcome → consent, recorded with `consent_version` → profile quiz); client tabs Today (targets card) and Me (details, edit); trainer tabs Clients (flags: onboarding not finished, no targets) and Me; client detail Overview + Targets (Mifflin-St Jeor "Estimated" starting point with activity level, 4/4/9 macro check, history, delete). `measurements` table created now for the onboarding weight (screens in M10). Notification and activity-sync onboarding steps come in M5/M4. Routing note: no `/` or `*` route inside IonRouterOutlet (Ionic reuses that view and taps bounce) – `RootRedirect` outside the outlet handles them. |
| 2 Workouts | Done (owner phone test passed) | 17 Oct 2026 | Tables per brief + `exercises.log_type` (weights / bodyweight / timed) and `is_archived`; one active plan per client (unique index + trigger ends the previous one); plan days rotate (next = day after the last logged; same day if logged today). 46 shared starter exercises with cues, no demo links (trainers add their own). Admin edits the shared library at /admin/exercises; trainers add/edit only their own. Trainer: Plans tab (builder, reorder, duplicate, assign), client detail Workouts tab. Client: Workouts tab, set logging with last-time guide and rest timer, history and personal bests, Today card. Gotcha: SELECT policies must not depend on a lookup of the same row (INSERT … RETURNING fails) – see the fix_workout_plans_select migration. |
| 3 Food + AI | Not started | | |
| 4 Activity + Android | Not started | | |
| 5 Notifications | Not started | | |
| 6 Offline + polish | Not started | | |
| 7 Sessions | Not started | | |
| 8 Healthy food videos | Not started | | |
| 9 Dashboard + summary | Not started | | |
| 10 Progress, habits, chat | Not started | | |
| 11 Ops + go-live | Not started | | |
