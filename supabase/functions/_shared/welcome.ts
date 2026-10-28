// Welcome email for a new user: app links (iPhone web app, Android APK), how to log in, and
// the two setup guides (PDFs from the web app's /guides folder) attached.
import { type Attachment, sendEmail } from './email.ts';

const APP_URL = (Deno.env.get('APP_URL') ?? 'https://fitcoach-ten-nu.vercel.app').replace(/\/$/, '');
const ANDROID_URL =
  'https://github.com/bharathprakash8/FitnessApp/releases/latest/download/FitCoach.apk';
const GUIDES = [
  { file: 'FitCoach-android-setup.pdf', page: 'android.html', label: 'Android setup guide' },
  { file: 'FitCoach-iphone-setup.pdf', page: 'iphone.html', label: 'iPhone setup guide' },
];

export interface WelcomeTo {
  email: string;
  full_name: string | null;
  role: 'admin' | 'trainer' | 'client';
}

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

async function guides(): Promise<Attachment[]> {
  return await Promise.all(
    GUIDES.map(async (g) => {
      const res = await fetch(`${APP_URL}/guides/${g.file}`);
      if (!res.ok) throw new Error(`Could not load ${g.file} (${res.status})`);
      return {
        filename: g.file,
        contentType: 'application/pdf',
        content: new Uint8Array(await res.arrayBuffer()),
      };
    }),
  );
}

export async function sendWelcome(to: WelcomeTo, trainerName: string | null): Promise<void> {
  const first = (to.full_name ?? '').trim().split(/\s+/)[0] || 'there';
  const intro =
    to.role === 'client'
      ? trainerName
        ? `You've been added to FitCoach – your trainer is ${trainerName}. Log your food and workouts, see the calories you burn, and follow your plan, all in one place.`
        : `You've been added to FitCoach. Log your food and workouts, see the calories you burn, and follow your plan, all in one place.`
      : to.role === 'trainer'
        ? `You've been added to FitCoach as a trainer. You can plan workouts, set targets and follow your clients' progress.`
        : `You've been added to FitCoach as an admin.`;

  const text = [
    `Hi ${first},`,
    '',
    intro,
    '',
    'iPHONE',
    `1. Open ${APP_URL} in Safari.`,
    '2. Tap Share, then "Add to Home Screen", and open FitCoach from the new icon.',
    '',
    'ANDROID',
    `1. Open ${ANDROID_URL} on your phone to download the app.`,
    '2. Allow "install from this source" when asked, then tap Install.',
    '',
    'LOG IN',
    `Use this email address (${to.email}). We'll email you a 6-digit code – type it in and you're in.`,
    '',
    'Step-by-step setup guides for Android and iPhone are attached (also online:',
    `${APP_URL}/guides/android.html and ${APP_URL}/guides/iphone.html).`,
    '',
    'See you in the app!',
    'FitCoach',
    '',
    'Calories in FitCoach are estimates. Please check with your doctor before starting a new exercise or diet programme.',
  ].join('\n');

  const button = (href: string, label: string, primary: boolean) =>
    `<a href="${href}" style="display:inline-block;padding:12px 18px;margin:4px 6px 4px 0;border-radius:10px;font-weight:600;text-decoration:none;${
      primary ? 'background:#2f6fde;color:#ffffff' : 'background:#eef3fc;color:#2f6fde'
    }">${label}</a>`;

  const html = `<!doctype html><html><body style="margin:0;background:#f4f6fa;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#1d2433">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
<div style="background:#ffffff;border-radius:16px;padding:24px">
<div style="display:inline-block;width:44px;height:44px;line-height:44px;text-align:center;border-radius:12px;background:#2f6fde;color:#fff;font-weight:700;font-size:18px">FC</div>
<h1 style="font-size:22px;margin:14px 0 6px">Welcome to FitCoach, ${esc(first)}!</h1>
<p style="font-size:15px;line-height:1.55;margin:0 0 18px">${esc(intro)}</p>

<h2 style="font-size:16px;margin:18px 0 6px">📱 iPhone</h2>
<p style="font-size:15px;line-height:1.55;margin:0 0 8px">Open the link in <b>Safari</b>, tap <b>Share → Add to Home Screen</b>, then open FitCoach from the new icon.</p>
${button(APP_URL, 'Open FitCoach', true)}

<h2 style="font-size:16px;margin:18px 0 6px">🤖 Android</h2>
<p style="font-size:15px;line-height:1.55;margin:0 0 8px">Download the app on your phone. Allow <b>"install from this source"</b> when asked, then tap <b>Install</b>.</p>
${button(ANDROID_URL, 'Download Android app', true)}

<h2 style="font-size:16px;margin:18px 0 6px">🔑 Log in</h2>
<p style="font-size:15px;line-height:1.55;margin:0">Use this email address (<b>${esc(to.email)}</b>). We'll email you a <b>6-digit code</b> – type it in and you're in. No password needed.</p>

<div style="background:#eef3fc;border-radius:12px;padding:12px 14px;margin:20px 0 0;font-size:14px;line-height:1.5">
📎 <b>Setup guides attached</b> – step by step for Android and iPhone (notifications, calories burnt from your phone or watch). Also online:
<a href="${APP_URL}/guides/android.html" style="color:#2f6fde">Android</a> ·
<a href="${APP_URL}/guides/iphone.html" style="color:#2f6fde">iPhone</a>
</div>
</div>
<p style="font-size:12px;color:#6b7385;line-height:1.5;margin:14px 4px 0">Calories in FitCoach are estimates. Please check with your doctor before starting a new exercise or diet programme.</p>
</div></body></html>`;

  await sendEmail({
    to: to.email,
    subject: 'Welcome to FitCoach – your login and setup guide',
    text,
    html,
    attachments: await guides(),
  });
}
