# Push notifications

Firebase project **fitcoach-be9f6** (owner nidhi@samhithe.in), free Spark plan. Only Cloud
Messaging (and later App Distribution) is used.

## How it works

- **Web / iPhone (home-screen app):** the app's own service worker (`src/sw.ts`, built with
  vite-plugin-pwa `injectManifest`) shows pushes and opens the right screen when tapped. The device
  token comes from the Firebase JS SDK (`getToken` with our service worker and the VAPID key).
  iPhone needs iOS 16.4+ and "Add to Home Screen"; permission is asked from a button tap.
- **Android app:** `@capacitor/push-notifications` with `google-services.json` (added in CI from
  the `GOOGLE_SERVICES_JSON_BASE64` secret). Channel `reminders`, small icon
  `res/drawable/ic_stat_notify.xml`.
- Tokens are stored in `push_tokens` via `claim_push_token()` (a token moves to whoever registers it
  last). Tokens Firebase reports as `UNREGISTERED` are deleted automatically.
- **Sending:** `supabase/functions/_shared/fcm.ts` (FCM HTTP v1, OAuth with the service account).
  `send-push` = test notification for the signed-in user, or internal sends with the cron secret.
  `cron-meal-reminders` runs every 15 minutes.

## Settings

| Where                                  | Name                                                                                                                                        | Value                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `.env.local`, GitHub variables, Vercel | `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_VAPID_KEY` | public web config + Web Push key pair                           |
| GitHub secret                          | `GOOGLE_SERVICES_JSON_BASE64`                                                                                                               | Android Firebase config                                         |
| Supabase secret                        | `FIREBASE_SERVICE_ACCOUNT_JSON`                                                                                                             | service account key (server only)                               |
| Supabase secret                        | `APP_URL`                                                                                                                                   | https://fitcoach-ten-nu.vercel.app (links in web notifications) |

`scripts/setup-firebase-secrets.ps1` stores the two downloaded files and deletes the service account
key from Downloads.

## samhithe.in organisation policy

Google Workspace organisations block service account key creation by default
(`iam.disableServiceAccountKeyCreation`). For fitcoach-be9f6 it was turned **off at project level**
on 17 Oct 2026 (Cloud console → IAM & Admin → Organization Policies → Disable service account key
creation → Override parent → Enforcement Off), after granting nidhi@samhithe.in the Organization
Policy Administrator role. It can be switched back on – the stored key keeps working; only new keys
are blocked. A new key (e.g. for prod) needs the override again.
