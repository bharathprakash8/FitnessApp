# Android release (APK)

The Android app is the same web app wrapped with Capacitor (`android/`), package
`com.fitcoach.app`. It is built and signed **on GitHub's servers** – no Android Studio on the PC.

## One-time setup

1. **Signing key** – run in the repo folder:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\create-android-keystore.ps1
   ```

   It signs you in to GitHub (`gh`), asks for a password, creates
   `%USERPROFILE%\FitCoach-keys\fitcoach-release.p12` (alias `fitcoach`) and stores it, encrypted, as
   the GitHub Secrets `ANDROID_KEYSTORE_BASE64` and `ANDROID_KEYSTORE_PASSWORD`. It also sets the
   GitHub variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.

   Created 17 Oct 2026. Certificate: `C=IN, O=FitCoach, CN=FitCoach`, SHA-256 fingerprint
   `2d4b96ac69be40aff1be669e32fda93a7ce20b61525c844fda191e66b5393ec6`.

   **Back up the `.p12` file and the password.** Android only installs updates signed with the
   same key; if it is lost, everyone has to uninstall and reinstall.

2. **Firebase App Distribution** (to send the APK to friends)
   1. console.firebase.google.com → **Add project** → "FitCoach" (Google Analytics not needed).
   2. **Add app → Android**, package name `com.fitcoach.app`, nickname "FitCoach". Skip the
      `google-services.json` and SDK steps for now (they are for push notifications, Milestone 5).
   3. **Release & Monitor → App Distribution → Get started**. Under **Testers & Groups** create a
      group with alias **`friends`** and add the testers' emails.
   4. Upload the first APK by dragging it in (see "Building" below), choose the `friends` group,
      **Distribute**. Testers get an email with an install link.
   5. Optional – automatic uploads from GitHub: Project settings → Service accounts → create a key
      for a service account with the **Firebase App Distribution Admin** role, then
      `gh secret set FIREBASE_SERVICE_ACCOUNT_JSON < key.json` and
      `gh variable set FIREBASE_ANDROID_APP_ID --body "1:…:android:…"` (Project settings → Your apps).
      Delete the downloaded key file afterwards.

## Building

- GitHub → **Actions → Android APK → Run workflow** (optional "What changed" note), or from the PC:
  `gh workflow run android.yml -f release_notes="..."`.
- Or push a tag: `git tag android-v1.1 && git push origin android-v1.1`.
- The run takes 5–8 minutes. The APK is attached to the run as an artifact
  (`FitCoach-<version>.apk`, kept 30 days). With the Firebase settings above it is also sent to the
  `friends` group automatically.
- `versionCode` = GitHub run number (always increases), `versionName` = `package.json` version +
  run number.

## Telling everyone about an update

- **Website / iPhone:** deploy as usual. Phones find the new version when the app is opened or
  brought back, and every 30 minutes. The popup offers **Update now**; if the person taps
  **Later** it asks again after a day, and closing and reopening the app also applies it.
- **Android:** run the workflow with a short note, which is shown in the popup:
  `gh workflow run android.yml -f release_notes="Faster meal logging"`. It publishes the release
  (`FitCoach.apk`, the file the app's link downloads), then saves the new version with
  `set_latest_android`, and phones show the popup the next time the app is opened or brought back.
- **Build without announcing it** (to try an APK on one phone first): add `-f publish=false` and
  install the APK from the run's artifacts.
- **Force an update** (only when old APKs can no longer work with the server): set `min_code` in
  `app_settings` key `latest_android` to the lowest build number allowed. Older phones then get
  no **Later** button.
- APKs up to 0.1.0.14 have no popup, so those phones need the download link sent to them once.

## Installing on a phone

Testers open the Firebase email on the phone → **Get started** → install the App Tester app → install
FitCoach. Android asks to **allow installs from this source** the first time. Health Connect is built
into Android 14+; on Android 13 or older the app links to it on the Play Store.

## What's in the app

- Permissions: internet, and **read-only** Health Connect access to active calories, total
  calories, steps and sleep (all other permissions the health plugin declares are removed in
  `android/app/src/main/AndroidManifest.xml`). App backups are off.
- Health Connect's "Privacy policy" link opens https://fitcoach-ten-nu.vercel.app/privacy.html.
- Icons and splash come from `public/icon.svg` via `node scripts/make-icons.cjs` and
  `npx @capacitor/assets generate --android`.
