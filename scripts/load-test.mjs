// Load test with 10 test users (2 trainers, 8 clients) using the app's real API calls at the
// same time. Uses the temporary test-users Edge Function (no email / code needed).
//
//   node scripts/load-test.mjs create          create the test users (once)
//   node scripts/load-test.mjs run [rounds]    all 10 act at once (default 6 rounds)
//   node scripts/load-test.mjs cleanup         delete the test users and their data
//
// Needs .env.local (VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY) and .env.test.local
// (TEST_USERS_SECRET). Never prints tokens or secrets.
import { readFileSync } from 'node:fs';

import { createClient } from '@supabase/supabase-js';

function readEnv(file) {
  const out = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}

const env = { ...readEnv('.env.local'), ...readEnv('.env.test.local') };
const URL = env.VITE_SUPABASE_URL;
const KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const SECRET = env.TEST_USERS_SECRET;
if (!URL || !KEY || !SECRET) throw new Error('Missing settings in .env.local / .env.test.local');

const TRAINERS = ['test.trainer1', 'test.trainer2'];
const CLIENTS = Array.from({ length: 8 }, (_, i) => `test.client${i + 1}`);
const email = (n) => `${n}@fitcoach.test`;

async function testFn(body) {
  const res = await fetch(`${URL}/functions/v1/test-users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: KEY, 'x-test-secret': SECRET },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
  return json.data;
}

// ---------------------------------------------------------------------------
// Measuring
// ---------------------------------------------------------------------------
const stats = new Map(); // op -> { ms: number[], errors: string[] }
async function timed(op, fn) {
  const s = stats.get(op) ?? { ms: [], errors: [] };
  stats.set(op, s);
  const t0 = performance.now();
  try {
    const r = await fn();
    if (r && r.error) throw r.error;
    s.ms.push(performance.now() - t0);
    return r?.data;
  } catch (err) {
    s.ms.push(performance.now() - t0);
    // Edge Function errors carry the real message in the response body.
    let msg = String(err?.message ?? err);
    if (err?.context && typeof err.context.json === 'function') {
      const body = await err.context.json().catch(() => null);
      msg = `${err.context.status}: ${body?.error?.code ?? ''} ${body?.error?.message ?? msg}`;
    }
    s.errors.push(msg.slice(0, 160));
    return undefined;
  }
}
const pct = (xs, p) => {
  const a = [...xs].sort((x, y) => x - y);
  return a.length ? Math.round(a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))]) : 0;
};
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = () => pause(Math.random() * 400);

function clientFor(token) {
  return createClient(URL, KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ---------------------------------------------------------------------------
// What each person does per round (the same calls the app makes)
// ---------------------------------------------------------------------------
async function clientRound(sb, me, round, pushUpId) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  await Promise.all([
    timed('client: profile', () => sb.from('profiles').select('*').eq('id', me).maybeSingle()),
    timed('client: meals today', () =>
      sb.from('meal_logs').select('*').eq('client_id', me).eq('eaten_on', today),
    ),
    timed('client: targets', () => sb.from('targets').select('*').eq('client_id', me)),
    timed('client: workout logs', () =>
      sb
        .from('workout_logs')
        .select('*, exercises(id, name, log_type, muscle_group)')
        .eq('client_id', me)
        .order('performed_on', { ascending: false })
        .limit(2000),
    ),
    timed('client: activity', () =>
      sb.from('activity_daily').select('*').eq('client_id', me).eq('activity_date', today),
    ),
    timed('client: sessions', () =>
      sb.from('session_attendees').select('status, sessions(*)').eq('client_id', me),
    ),
    timed('client: summaries', () =>
      sb.from('weekly_summaries').select('*').eq('client_id', me).limit(26),
    ),
    timed('client: measurements', () =>
      sb.from('measurements').select('*').eq('client_id', me).limit(200),
    ),
  ]);
  await jitter();
  await timed('client: water +1 glass', () =>
    sb
      .from('habits_daily')
      .upsert(
        { client_id: me, habit_date: today, water_ml: 250 * (round + 1) },
        { onConflict: 'client_id,habit_date' },
      ),
  );
  if (round % 3 === 0) {
    await timed('client: save meal', () =>
      sb.from('meal_logs').insert({
        client_id: me,
        eaten_on: today,
        meal_type: ['breakfast', 'lunch', 'snack', 'dinner'][round % 4],
        source: 'manual',
        items: [
          {
            name: 'Test dal rice',
            portion: '1 plate',
            calories: 450,
            protein_g: 14,
            carbs_g: 70,
            fat_g: 10,
            confidence: 'high',
          },
        ],
        total_calories: 450,
        protein_g: 14,
        carbs_g: 70,
        fat_g: 10,
      }),
    );
  }
  if (pushUpId) {
    await timed('client: log workout set', () =>
      sb.from('workout_logs').insert({
        client_id: me,
        performed_on: today,
        exercise_id: pushUpId,
        set_number: round + 1,
        reps: 10 + round,
        source: 'self',
      }),
    );
  }
  if (round === 1) {
    await timed('client: AI meal estimate (Gemini)', () =>
      sb.functions.invoke('analyze-meal', {
        body: { text: '2 chapatis with dal and a bowl of curd', meal_type: 'lunch' },
      }),
    );
  }
}

async function trainerRound(sb, me, round, clientIds) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  await Promise.all([
    timed('trainer: dashboard flags', () => sb.rpc('trainer_dashboard')),
    timed('trainer: client list', () =>
      sb
        .from('trainer_clients')
        .select('profiles!trainer_clients_client_id_fkey(*)')
        .eq('trainer_id', me),
    ),
    timed('trainer: targets', () => sb.from('targets').select('client_id')),
    timed('trainer: clients meals today', () =>
      sb.from('meal_logs').select('*').in('client_id', clientIds).eq('eaten_on', today),
    ),
    timed('trainer: plans', () =>
      sb
        .from('workout_plans')
        .select('*, plan_days(id), plan_assignments(id, is_active)')
        .eq('trainer_id', me),
    ),
    timed('trainer: sessions', () =>
      sb.from('sessions').select('*, session_attendees(client_id, status)').eq('trainer_id', me),
    ),
    timed('trainer: summaries', () =>
      sb.from('weekly_summaries').select('*').in('client_id', clientIds),
    ),
  ]);
  if (round === 2) {
    await timed('trainer: AI weekly summary (Gemini)', () =>
      sb.functions.invoke('cron-weekly-summary', {
        body: { action: 'generate', client_id: clientIds[0] },
      }),
    );
  }
}

// ---------------------------------------------------------------------------
async function run(rounds) {
  console.log('Logging in 10 test users at the same time…');
  const t0 = performance.now();
  const sessions = Object.fromEntries(
    await Promise.all(
      [...TRAINERS, ...CLIENTS].map(async (n) => [
        n,
        await testFn({ action: 'login', email: email(n) }),
      ]),
    ),
  );
  console.log(`  all logged in after ${Math.round(performance.now() - t0)} ms`);

  const anyClient = clientFor(sessions[CLIENTS[0]].access_token);
  const { data: pushUp } = await anyClient
    .from('exercises')
    .select('id')
    .eq('name', 'Push-up')
    .is('trainer_id', null)
    .maybeSingle();

  const clientIdsOf = (t) =>
    CLIENTS.filter((_, i) => (t === 0 ? i < 4 : i >= 4)).map((c) => sessions[c].user_id);

  console.log(`Running ${rounds} rounds – all 10 users at once…`);
  const start = performance.now();
  await Promise.all([
    ...CLIENTS.map(async (c) => {
      const sb = clientFor(sessions[c].access_token);
      for (let r = 0; r < rounds; r++) {
        await clientRound(sb, sessions[c].user_id, r, pushUp?.id);
        await jitter();
      }
    }),
    ...TRAINERS.map(async (t, ti) => {
      const sb = clientFor(sessions[t].access_token);
      for (let r = 0; r < rounds; r++) {
        await trainerRound(sb, sessions[t].user_id, r, clientIdsOf(ti));
        await jitter();
      }
    }),
  ]);
  const secs = (performance.now() - start) / 1000;

  let total = 0;
  let errors = 0;
  const rows = [];
  for (const [op, s] of [...stats.entries()].sort()) {
    total += s.ms.length;
    errors += s.errors.length;
    rows.push({
      request: op,
      calls: s.ms.length,
      errors: s.errors.length,
      'p50 ms': pct(s.ms, 50),
      'p95 ms': pct(s.ms, 95),
      'max ms': pct(s.ms, 100),
    });
  }
  console.table(rows);
  console.log(
    `${total} requests in ${secs.toFixed(1)} s (${(total / secs).toFixed(1)}/s), ${errors} errors`,
  );
  for (const [op, s] of stats) {
    const unique = [...new Set(s.errors)];
    if (unique.length) console.log(`  ${op}: ${unique.join(' | ')}`);
  }
}

/** N test clients ask the AI at the same moment; shows which Google quota refuses them. */
async function aiBurst(n) {
  const names = CLIENTS.slice(0, n);
  const sessions = await Promise.all(
    names.map((c) => testFn({ action: 'login', email: email(c) })),
  );
  const t0 = performance.now();
  await Promise.all(
    sessions.map((s) =>
      timed('AI meal estimate', () =>
        clientFor(s.access_token).functions.invoke('analyze-meal', {
          body: { text: '1 bowl of poha with peanuts', meal_type: 'breakfast' },
        }),
      ),
    ),
  );
  const st = stats.get('AI meal estimate');
  console.log(
    `${n} at once: ${st.ms.length - st.errors.length} ok, ${st.errors.length} refused, ` +
      `slowest ${Math.round(Math.max(...st.ms))} ms (all done after ${Math.round(performance.now() - t0)} ms)`,
  );
  for (const e of new Set(st.errors)) console.log('  ' + e);
}

const cmd = process.argv[2];
if (cmd === 'create')
  console.log(
    await testFn({ action: 'create' }).then(
      (r) => `Created ${r.trainers} trainers and ${r.clients} clients.`,
    ),
  );
else if (cmd === 'cleanup')
  console.log(await testFn({ action: 'cleanup' }).then((r) => `Deleted ${r.deleted} test users.`));
else if (cmd === 'run') await run(Number(process.argv[3] ?? 6));
else if (cmd === 'ai-burst') await aiBurst(Number(process.argv[3] ?? 8));
else console.log('Use: node scripts/load-test.mjs create | run [rounds] | cleanup');
