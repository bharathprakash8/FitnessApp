# Google Calendar + Meet for sessions (one-time setup)

Trainers connect **their own Google account** (personal Gmail is fine) in FitCoach → Sessions.
FitCoach then creates the calendar event with a Google Meet link in the trainer's calendar and
Google emails the invite to the clients. For that, FitCoach itself must be registered with
Google once. This is that registration. It is free and takes about 20 minutes.

Sign in as **nidhi@samhithe.in** and use the existing Firebase project **fitcoach-be9f6**.

## 1. Turn on the Google Calendar API

1. Open <https://console.cloud.google.com/apis/library/calendar-json.googleapis.com>.
2. In the project picker at the top, choose **fitcoach-be9f6**.
3. Click **Enable**.

## 2. Register the app (Google Auth Platform)

1. Open <https://console.cloud.google.com/auth/overview> → **Get started**.
2. **App information:** App name `FitCoach`, User support email `nidhi@samhithe.in` → Next.
3. **Audience:** choose **External** (trainers use personal Gmail) → Next.
4. **Contact information:** `nidhi@samhithe.in` → Next → tick the agreement → **Create**.

## 3. Branding (links shown to trainers)

1. Left menu **Branding**.
2. Application home page: `https://fitcoach-ten-nu.vercel.app`
3. Application privacy policy link: `https://fitcoach-ten-nu.vercel.app/privacy.html`
4. Leave the logo empty (a logo makes Google insist on a review). **Save**.

## 4. Permission: calendar events only

1. Left menu **Data access** → **Add or remove scopes**.
2. In the filter type `calendar.events` and tick
   `https://www.googleapis.com/auth/calendar.events` → **Update** → **Save**.

## 5. Publish (so trainers stay connected)

1. Left menu **Audience** → under Publishing status click **Publish app** → **Confirm**.
2. Google may say the app needs verification. That is fine – it simply shows trainers a
   "Google hasn't verified this app" screen once (up to 100 users). Do **not** leave it in
   "Testing": in Testing, Google disconnects everyone after 7 days.

## 6. Create the OAuth client

1. Left menu **Clients** → **Create client**.
2. Application type **Web application**, name `FitCoach web`.
3. **Authorised redirect URIs** → **Add URI** and paste exactly:
   `https://updctclaxbawgtrhtdor.supabase.co/functions/v1/calendar-session/callback`
4. **Create**. Google shows the **Client ID** and **Client secret** – click **Download JSON**
   and keep the file somewhere private (Google shows the secret only once). Never share it or
   paste it into chat.

## 7. Save the keys in Supabase

In a **separate** PowerShell window, in the FitnessApp folder:

```
powershell -ExecutionPolicy Bypass -File .\scripts\set-google-secrets.ps1
```

Paste the Client ID, then the Client secret, when asked (nothing is shown on screen). The
script also creates the key that encrypts trainers' Google connections (only the first time).

## How trainers connect

FitCoach → **Sessions** → **Connect Google Calendar** → choose their Gmail → on "Google hasn't
verified this app" tap **Advanced** → **Go to FitCoach (unsafe)** → tick the calendar box →
**Continue** → "Connected ✅" → back to FitCoach.

## Good to know

- Free Gmail: Google Meet calls with **3 or more people end after 60 minutes** (1-to-1 calls
  can last 24 hours). Longer group classes need Google One / Workspace or a new call.
- Change or cancel sessions **in FitCoach** – edits made directly in Google Calendar are not
  copied back.
- A trainer can disconnect in FitCoach → Sessions, or at
  <https://myaccount.google.com/connections>.
- If the secret ever leaks: Google Auth Platform → Clients → FitCoach web → add a new secret,
  run the script again, then delete the old secret.
