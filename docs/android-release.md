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
