// cron-meal-reminders: every 15 minutes (pg_cron). For each client with a device, sends
// "time to log your <meal>" when a reminder time has just passed in the client's time zone
// and that meal isn't logged today; same for the workout reminder. notification_log makes
// sure each reminder goes out at most once a day.
// Also sends the trainer's custom reminders (cardio, session, food, other) on their weekdays.
// Reminders the trainer locked (meal_times_locked, or client_can_mute = false) are sent even
// when the client has paused reminders.
import { adminClient } from '../_shared/auth.ts';
import { sendToUsers, type PushMessage } from '../_shared/fcm.ts';
import { HttpError, serveJson } from '../_shared/http.ts';

const WINDOW_MIN = 30; // a run can be a little late; the log prevents doubles

const MEALS = [
  { key: 'breakfast', label: 'breakfast', emoji: '🍳', defOn: true, defTime: '08:30' },
  { key: 'lunch', label: 'lunch', emoji: '🍛', defOn: true, defTime: '13:30' },
  { key: 'snack', label: 'evening snack', emoji: '🍎', defOn: false, defTime: '17:00' },
  { key: 'dinner', label: 'dinner', emoji: '🍲', defOn: true, defTime: '20:30' },
] as const;

const CUSTOM_URL = {
  cardio: '/workouts',
  session: '/today',
  food: '/food/new/photo',
  other: '/today',
} as const;

function sameSecret(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function localNow(timeZone: string) {
  const now = new Date();
  const date = new Intl.DateTimeFormat('en-CA', { timeZone }).format(now);
  const hm = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(now);
  const [h, m] = hm.split(':').map(Number);
  const wd = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(now);
  const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(wd) + 1; // ISO
  return { date, weekday, minutes: (h ?? 0) * 60 + (m ?? 0) };
}

const toMinutes = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

const due = (time: string, nowMin: number) => {
  const t = toMinutes(time);
  return t <= nowMin && nowMin - t < WINDOW_MIN;
};

serveJson(async (req) => {
  const expected = Deno.env.get('CRON_SECRET');
  if (!expected || !sameSecret(req.headers.get('x-cron-secret') ?? '', expected)) {
    throw new HttpError(401, 'Not allowed', 'unauthorized');
  }
  const db = adminClient();

  // Clients who have at least one device registered.
  const { data: tokenRows, error: tErr } = await db.from('push_tokens').select('user_id');
  if (tErr) throw tErr;
  const withDevice = [...new Set(tokenRows.map((r) => r.user_id))];
  if (withDevice.length === 0) return { checked: 0, sent: 0 };

  const [
    { data: clients, error: cErr },
    { data: settings, error: sErr },
    { data: customs, error: rErr },
  ] = await Promise.all([
    db
      .from('profiles')
      .select('id, timezone, full_name')
      .in('id', withDevice)
      .in('role', ['client', 'trainer'])
      .eq('is_active', true)
      .not('onboarded_at', 'is', null),
    db.from('reminder_settings').select('*').in('client_id', withDevice),
    db
      .from('custom_reminders')
      .select('id, client_id, kind, title, body, remind_at, days, client_can_mute, muted')
      .in('client_id', withDevice)
      .eq('is_active', true),
  ]);
  if (cErr) throw cErr;
  if (sErr) throw sErr;
  if (rErr) throw rErr;
  const settingsOf = new Map(settings.map((s) => [s.client_id, s]));
  const customsOf = new Map<string, typeof customs>();
  for (const r of customs) customsOf.set(r.client_id, [...(customsOf.get(r.client_id) ?? []), r]);

  let sent = 0;
  for (const c of clients) {
    const s = settingsOf.get(c.id);
    const paused = Boolean(s && !s.enabled);
    // Paused reminders skip everything except what the trainer locked.
    const mealsOn = !paused || Boolean(s?.meal_times_locked);
    const { date, weekday, minutes } = localNow(c.timezone || 'Asia/Kolkata');
    const jobs: { kind: string; msg: PushMessage; check: () => Promise<boolean> }[] = [];

    for (const meal of mealsOn ? MEALS : []) {
      const on = s ? (s[`${meal.key}_on` as keyof typeof s] as boolean) : meal.defOn;
      const time = s ? String(s[`${meal.key}_time` as keyof typeof s]) : meal.defTime;
      if (!on || !due(time, minutes)) continue;
      jobs.push({
        kind: `meal_${meal.key}`,
        msg: {
          title: `Time to log your ${meal.label} ${meal.emoji}`,
          body: 'Snap a photo of your plate – it takes 10 seconds.',
          url: '/food/new/photo',
          tag: `meal-${meal.key}`,
        },
        // only if this meal isn't logged yet today
        check: async () => {
          const { count } = await db
            .from('meal_logs')
            .select('id', { count: 'exact', head: true })
            .eq('client_id', c.id)
            .eq('eaten_on', date)
            .eq('meal_type', meal.key);
          return (count ?? 0) === 0;
        },
      });
    }

    if (mealsOn && s?.workout_reminder_time && due(String(s.workout_reminder_time), minutes)) {
      jobs.push({
        kind: 'workout',
        msg: {
          title: 'Your workout is waiting 💪',
          body: "Open FitCoach to see today's exercises.",
          url: '/workouts',
          tag: 'workout',
        },
        // only with an active plan and nothing logged today
        check: async () => {
          const [{ count: plans }, { count: logs }] = await Promise.all([
            db
              .from('plan_assignments')
              .select('id', { count: 'exact', head: true })
              .eq('client_id', c.id)
              .eq('is_active', true),
            db
              .from('workout_logs')
              .select('id', { count: 'exact', head: true })
              .eq('client_id', c.id)
              .eq('performed_on', date),
          ]);
          return (plans ?? 0) > 0 && (logs ?? 0) === 0;
        },
      });
    }

    for (const r of customsOf.get(c.id) ?? []) {
      if (r.client_can_mute && (r.muted || paused)) continue;
      if (!r.days.includes(weekday) || !due(String(r.remind_at), minutes)) continue;
      jobs.push({
        kind: `custom_${r.id}`,
        msg: {
          title: r.title,
          body: r.body || 'A reminder from your trainer.',
          url: CUSTOM_URL[r.kind as keyof typeof CUSTOM_URL] ?? '/today',
          tag: `custom-${r.id}`,
        },
        check: () => Promise.resolve(true),
      });
    }

    for (const job of jobs) {
      if (!(await job.check())) continue;
      // Claim the reminder first; a second run in the window finds the row and skips.
      const { error: logErr } = await db
        .from('notification_log')
        .insert({ user_id: c.id, kind: job.kind, ref_date: date });
      if (logErr) continue; // already sent today
      const r = await sendToUsers(db, [c.id], job.msg);
      sent += r.sent;
    }
  }
  return { checked: clients.length, sent };
});
