# Welcome email (28 Oct 2026)

When the admin adds a user (Admin → Add user), the `admin-users` function emails them:
- the iPhone web-app link (Safari → Share → Add to Home Screen) and the Android APK link,
- how to log in (their email + 6-digit code),
- the two setup guides attached as PDFs (also online at `/guides/android.html` and
  `/guides/iphone.html`).

The user is created even if the email fails; the Add user screen shows "sent" or the reason.
Send it again from the user's page → **Send welcome email**.

## Setup (once)

Sent through Gmail SMTP (port 465) as nidhi@samhithe.in with a Google **app password**:
1. Log in to https://myaccount.google.com as nidhi@samhithe.in → Security → 2-Step
   Verification must be on → https://myaccount.google.com/apppasswords → name it
   "FitCoach welcome" → Create → keep the 16-letter password on screen.
   (If the Workspace admin has blocked app passwords: admin.google.com → Security →
   Less secure apps / app passwords.) The one already used for the Supabase login-code SMTP
   works too.
2. In a separate terminal in this folder:
   `powershell -ExecutionPolicy Bypass -File scripts/set-email-secret.ps1`
   Secrets: `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_NAME`. Optional `APP_URL` (default
   https://fitcoach-ten-nu.vercel.app).

## Changing the guides

Edit `public/guides/android.html` / `iphone.html` (+ `guide.css`), then rebuild the PDFs with
`powershell -ExecutionPolicy Bypass -File scripts/build-guides.ps1` and deploy the web app –
the email fetches the PDFs from the live site. Email text: `supabase/functions/_shared/welcome.ts`.
Gmail limit: ~2,000 emails a day for Workspace – far above what we need.
