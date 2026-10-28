// test-users – TEMPORARY, for load testing only. Remove when done (see scripts/load-test.mjs).
// Every call needs the x-test-secret header (TEST_USERS_SECRET). It only ever touches
// accounts whose email ends in @fitcoach.test AND that are marked app_metadata.test = true.
//   { action: 'create' }            2 test trainers + 8 test clients (onboarded, with targets)
//   { action: 'login', email }      a session for one test account (no email, no code)
//   { action: 'cleanup' }           delete all test accounts and their data
//   { action: 'map_to_coach', n }   put the first n test clients on the AI coach
import { createClient } from 'npm:@supabase/supabase-js@2';

import { adminClient } from '../_shared/auth.ts';
import { HttpError, serveJson } from '../_shared/http.ts';
import { sameSecret } from '../_shared/util.ts';

const DOMAIN = '@fitcoach.test';
const TRAINERS = ['test.trainer1', 'test.trainer2'];
const CLIENTS = Array.from({ length: 8 }, (_, i) => `test.client${i + 1}`);

type Admin = ReturnType<typeof adminClient>;

async function testUsers(db: Admin) {
  const users: { id: string; email: string }[] = [];
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    for (const u of data.users) {
      if (u.email?.endsWith(DOMAIN) && u.app_metadata?.test === true) {
        users.push({ id: u.id, email: u.email });
      }
    }
    if (data.users.length < 200) break;
  }
  return users;
}

async function create(db: Admin) {
  const existing = new Map((await testUsers(db)).map((u) => [u.email, u.id]));
  const ids: Record<string, string> = {};
  for (const [i, name] of [...TRAINERS, ...CLIENTS].entries()) {
    const email = `${name}${DOMAIN}`;
    let id = existing.get(email);
    if (!id) {
      const role = TRAINERS.includes(name) ? 'trainer' : 'client';
      const { data, error } = await db.auth.admin.createUser({
        email,
        email_confirm: true,
        app_metadata: { role, test: true },
        user_metadata: {
          full_name: `Test ${role === 'trainer' ? 'Trainer' : 'Client'} ${name.slice(-1)}`,
        },
      });
      if (error) throw error;
      id = data.user.id;
    }
    ids[name] = id;
    const isClient = CLIENTS.includes(name);
    const now = new Date().toISOString();
    const { error: pErr } = await db
      .from('profiles')
      .update({
        // The profile trigger runs before app_metadata is applied, so set the role here.
        role: isClient ? 'client' : 'trainer',
        timezone: i % 3 === 2 ? 'Europe/London' : 'Asia/Kolkata',
        ...(isClient
          ? {
              date_of_birth: `19${85 + (i % 10)}-0${(i % 9) + 1}-15`,
              sex: i % 2 ? 'female' : 'male',
              height_cm: 160 + i * 2,
              goal: ['lose_weight', 'build_muscle', 'get_fitter', 'maintain'][i % 4],
              diet_preference: ['veg', 'egg', 'non_veg', 'vegan'][i % 4],
              consent_at: now,
              consent_version: '2026-10-17',
              onboarded_at: now,
            }
          : {}),
      })
      .eq('id', id);
    if (pErr) throw pErr;
  }
  // Clients 1–4 → trainer 1, clients 5–8 → trainer 2; targets and a starting weight.
  for (const [i, c] of CLIENTS.entries()) {
    const trainer = ids[TRAINERS[i < 4 ? 0 : 1]!]!;
    const client = ids[c]!;
    const { error: mErr } = await db
      .from('trainer_clients')
      .upsert({ client_id: client, trainer_id: trainer }, { onConflict: 'client_id' });
    if (mErr) throw mErr;
    const { count } = await db
      .from('targets')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', client);
    if (!count) {
      await db.from('targets').insert({
        client_id: client,
        calories: 1800 + i * 50,
        protein_g: 100,
        carbs_g: 200,
        fat_g: 60,
        set_by: trainer,
      });
      await db.from('measurements').insert({ client_id: client, weight_kg: 60 + i * 3 });
    }
  }
  return { trainers: TRAINERS.length, clients: CLIENTS.length, ids };
}

async function login(db: Admin, email: string) {
  if (!email.endsWith(DOMAIN)) throw new HttpError(403, 'Test accounts only', 'forbidden');
  const users = await testUsers(db);
  if (!users.some((u) => u.email === email)) {
    throw new HttpError(404, 'Not a test account', 'not_found');
  }
  const { data, error } = await db.auth.admin.generateLink({ type: 'magiclink', email });
  if (error) throw error;
  const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: s, error: vErr } = await anon.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: 'magiclink',
  });
  if (vErr || !s.session) throw vErr ?? new Error('No session');
  return {
    access_token: s.session.access_token,
    refresh_token: s.session.refresh_token,
    expires_at: s.session.expires_at,
    user_id: s.session.user.id,
  };
}

/** Every file under a folder (meal photos sit in date sub-folders: {user}/{date}/{file}). */
async function filesUnder(db: Admin, bucket: string, folder: string): Promise<string[]> {
  const { data } = await db.storage.from(bucket).list(folder, { limit: 1000 });
  const out: string[] = [];
  for (const f of data ?? []) {
    const path = `${folder}/${f.name}`;
    // Folders have no id; files do.
    if (f.id) out.push(path);
    else out.push(...(await filesUnder(db, bucket, path)));
  }
  return out;
}

async function cleanup(db: Admin) {
  const users = await testUsers(db);
  const ids = users.map((u) => u.id);
  const problems: string[] = [];
  let photos = 0;
  if (ids.length) {
    // Photos first (storage isn't removed by deleting the user). Only the test accounts' own
    // folders are touched.
    for (const bucket of ['meal-photos', 'progress-photos', 'problem-shots']) {
      for (const id of ids) {
        const paths = await filesUnder(db, bucket, id);
        if (paths.length) {
          const { error } = await db.storage.from(bucket).remove(paths);
          if (error) problems.push(`${bucket}/${id}: ${error.message}`);
          else photos += paths.length;
        }
      }
    }
    // Rows that don't cascade from the profile, then the accounts themselves (their meals,
    // workouts, chats, coach changes etc. are deleted with the profile).
    await db.from('trainer_clients').delete().in('trainer_id', ids);
    await db.from('targets').delete().in('set_by', ids);
    for (const id of ids) {
      const { error } = await db.auth.admin.deleteUser(id);
      if (error) problems.push(`account ${id}: ${error.message}`);
    }
  }
  // Test runs of the head coach (reports starting with "TEST") and their changes.
  const { data: runs } = await db.from('coach_runs').select('id').like('report', 'TEST%');
  const runIds = (runs ?? []).map((r) => r.id as string);
  if (runIds.length) {
    await db.from('coach_actions').delete().in('run_id', runIds);
    await db.from('coach_runs').delete().in('id', runIds);
  }
  return {
    deleted_accounts: ids.length - problems.filter((p) => p.startsWith('account')).length,
    photos,
    test_runs: runIds.length,
    problems,
  };
}

/** Put the first n test clients on the AI coach (with conditions for the safety checks). */
const PERSONAS = [
  {
    full_name: 'Test Amma',
    date_of_birth: '1964-05-10',
    sex: 'female',
    diet_preference: 'veg',
    goal: 'get_fitter',
    health_conditions: ['knee', 'bp'],
    doctor_ok: true,
    language: 'kn',
    foods_to_avoid: 'brinjal',
  },
  {
    full_name: 'Test Ravi',
    date_of_birth: '1988-02-01',
    sex: 'male',
    diet_preference: 'veg',
    goal: 'lose_weight',
    health_conditions: [],
    doctor_ok: null,
    language: 'en',
    foods_to_avoid: null,
  },
  {
    full_name: 'Test Appa',
    date_of_birth: '1960-08-20',
    sex: 'male',
    diet_preference: 'egg',
    goal: 'maintain',
    health_conditions: ['diabetes'],
    doctor_ok: true,
    language: 'en',
    foods_to_avoid: null,
  },
  {
    full_name: 'Test Priya',
    date_of_birth: '1995-11-12',
    sex: 'female',
    diet_preference: 'vegan',
    goal: 'build_muscle',
    health_conditions: [],
    doctor_ok: null,
    language: 'en',
    foods_to_avoid: 'peanuts',
  },
  {
    full_name: 'Test Ajji',
    date_of_birth: '1952-03-03',
    sex: 'female',
    diet_preference: 'veg',
    goal: 'maintain',
    health_conditions: ['knee', 'back', 'thyroid'],
    doctor_ok: false,
    language: 'kn',
    foods_to_avoid: null,
  },
  {
    full_name: 'Test Kiran',
    date_of_birth: '1990-06-30',
    sex: 'male',
    diet_preference: 'non_veg',
    goal: 'build_muscle',
    health_conditions: ['back'],
    doctor_ok: true,
    language: 'en',
    foods_to_avoid: null,
  },
  {
    full_name: 'Test Meena',
    date_of_birth: '1978-09-09',
    sex: 'female',
    diet_preference: 'egg',
    goal: 'lose_weight',
    health_conditions: ['bp', 'thyroid'],
    doctor_ok: true,
    language: 'kn',
    foods_to_avoid: 'mushroom',
  },
  {
    full_name: 'Test Suresh',
    date_of_birth: '1970-01-15',
    sex: 'male',
    diet_preference: 'non_veg',
    goal: 'lose_weight',
    health_conditions: ['heart'],
    doctor_ok: true,
    language: 'en',
    foods_to_avoid: null,
  },
];

async function mapToCoach(db: Admin, n: number) {
  const { data: coach } = await db
    .from('profiles')
    .select('id')
    .eq('is_ai_coach', true)
    .maybeSingle();
  if (!coach) throw new HttpError(400, 'Set up the AI coach first', 'no_coach');
  const users = (await testUsers(db)).filter((u) => u.email.startsWith('test.client'));
  users.sort((a, b) => a.email.localeCompare(b.email));
  const mapped = [];
  for (const [i, u] of users.slice(0, Math.min(8, n)).entries()) {
    const { error } = await db
      .from('trainer_clients')
      .upsert({ client_id: u.id, trainer_id: coach.id }, { onConflict: 'client_id' });
    if (error) throw error;
    // Different people for the coach tests (ages, diets, conditions, languages).
    await db
      .from('profiles')
      .update({ ...PERSONAS[i % PERSONAS.length], coach_consent_at: new Date().toISOString() })
      .eq('id', u.id);
    mapped.push(u.email);
  }
  return { mapped };
}

serveJson(async (req) => {
  const secret = Deno.env.get('TEST_USERS_SECRET') ?? '';
  if (!secret || !sameSecret(req.headers.get('x-test-secret') ?? '', secret)) {
    throw new HttpError(401, 'Not allowed', 'unauthorized');
  }
  const db = adminClient();
  const body = (await req.json().catch(() => ({}))) as { action?: string; email?: string };
  switch (body.action) {
    case 'create':
      return await create(db);
    case 'login':
      return await login(db, String(body.email ?? ''));
    case 'cleanup':
      return await cleanup(db);
    case 'coach_mode': {
      // Testing only: switch the AI coach between dry_run and live.
      const mode = (body as { mode?: string }).mode === 'live' ? 'live' : 'dry_run';
      await db.from('app_settings').upsert({ key: 'coach_mode', value: mode });
      return { mode };
    }
    case 'assist_setup': {
      // Both AI coach modes: clients 1–4 AI-only, 5–6 trainer 1 + assistant, 7–8 trainer 2 + assistant.
      const mapped = await mapToCoach(db, 8);
      const users = await testUsers(db);
      const id = (name: string) => users.find((u) => u.email === `${name}${DOMAIN}`)?.id;
      for (const [client, trainer] of [
        ['test.client5', 'test.trainer1'],
        ['test.client6', 'test.trainer1'],
        ['test.client7', 'test.trainer2'],
        ['test.client8', 'test.trainer2'],
      ] as const) {
        const { error } = await db
          .from('trainer_clients')
          .upsert(
            { client_id: id(client)!, trainer_id: id(trainer)!, ai_assist: true },
            { onConflict: 'client_id' },
          );
        if (error) throw error;
      }
      return {
        ...mapped,
        assisted: ['client5', 'client6 → trainer1', 'client7', 'client8 → trainer2'],
      };
    }
    case 'map_to_coach':
      return await mapToCoach(db, Number((body as { n?: number }).n ?? 2));
    default:
      throw new HttpError(400, 'Unknown action', 'invalid_input');
  }
});
