# iPhone: "FitCoach Sync" Shortcut

iPhone users use FitCoach as a home-screen web app, which can't read Apple Health. Instead an
Apple Shortcut reads the numbers and posts them to the `health-sync` Edge Function every night.

You (the owner) build the Shortcut **once** on any iPhone, share its iCloud link, and put the link
in `src/config.ts` (`IPHONE_SHORTCUT_URL`). Each client then installs it and pastes **their own**
sync code from **Me → Health sync → Set up iPhone sync**.

## Build the Shortcut (about 10 minutes)

Open **Shortcuts → + (new shortcut)**, name it **FitCoach Sync**, and add these actions in order:

1. **Text** – paste a placeholder `PASTE-SYNC-CODE`. Rename the output (tap it) to **Sync Code**.
2. **Text** – `https://updctclaxbawgtrhtdor.supabase.co/functions/v1/health-sync`. Rename to
   **Sync URL**.
3. **Find Health Samples** – Type **Active Energy**, Start Date **is today**. Tap **Show More**:
   Group By **Day**, Fill Missing **off**. Then add **Calculate Statistics** → **Sum** of
   _Health Samples_ → rename result to **Active**.
4. **Find Health Samples** – **Resting Energy**, today, grouped by day → **Calculate Statistics →
   Sum** → rename to **Resting**.
5. **Find Health Samples** – **Steps**, today, grouped by day → **Calculate Statistics → Sum** →
   rename to **Steps**.
6. **Find Health Samples** – **Sleep Analysis**, Start Date **is in the last 1 day**, Value **is
   Asleep** (or _Core/Deep/REM_) → **Get Details of Health Sample → Duration** → **Calculate
   Statistics → Sum** → **Calculate**: result ÷ 60 → rename to **Sleep Minutes**. (Skip this step if
   sleep isn't tracked; it's optional.)
7. **Get Contents of URL** – URL: **Sync URL**. Tap **Show More**:
   - Method **POST**
   - Headers: `X-Sync-Token` = **Sync Code**, `Content-Type` = `application/json`
   - Request Body **JSON** with fields:
     - `active_calories` (Number) = **Active**
     - `resting_calories` (Number) = **Resting**
     - `steps` (Number) = **Steps**
     - `sleep_minutes` (Number) = **Sleep Minutes**
     - `days_ago` (Number) = `0`
8. (Optional) **Show Notification** – "FitCoach synced".

In the Shortcut's settings (ⓘ) turn on **Import Questions → Sync Code** so each person is asked
for their own code when they add it.

**Share → Copy iCloud Link**, then put the link in `src/config.ts` and redeploy.

### Morning copy for yesterday

Duplicate the Shortcut as **FitCoach Sync (yesterday)**: change every "is today" to "is
yesterday" and set `days_ago` to `1`.

## Each client (shown in the app too)

1. Me → Health sync → **Set up iPhone sync** → copy the code (shown once).
2. Open the shared iCloud link → **Add Shortcut** → paste the code when asked.
3. Run it once by hand and **Allow** Health access.
4. Shortcuts → **Automation → + → Time of Day** 22:00, Daily, **Run Immediately** → FitCoach Sync.

Shared link: https://www.icloud.com/shortcuts/502ebc485a414436a83d36174f9f57b2

## Notes

- The function accepts the last 7 days, max 20 calls per day per person, and replaces that day's
  numbers each time (`source = apple_shortcut`).
- Errors come back as JSON `{ "error": { "message": … } }` – visible if you add **Show Result** after
  step 7 while testing.
- Creating a new code in the app immediately stops the old one.
