// test-users – TEMPORARY, for load testing only. Remove when done (see scripts/load-test.mjs).
// Every call needs the x-test-secret header (TEST_USERS_SECRET). It only ever touches
// accounts whose email ends in @fitcoach.test AND that are marked app_metadata.test = true.
//   { action: 'create' }            2 test trainers + 8 test clients (onboarded, with targets)
//   { action: 'login', email }      a session for one test account (no email, no code)
//   { action: 'cleanup' }           delete all test accounts and their data
import { createClient } from 'npm:@supabase/supabase-js@2';

import { adminClient } from '../_shared/auth.ts';
import { HttpError, serveJson } from '../_shared/http.ts';

const DOMAIN = '@fitcoach.test';
const TRAINERS = ['test.trainer1', 'test.trainer2'];
const CLIENTS = Array.from({ length: 8 }, (_, i) => `test.client${i + 1}`);

function sameSecret(a: string, b: string) {
  if (!a || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

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

async function cleanup(db: Admin) {
  const users = await testUsers(db);
  const ids = users.map((u) => u.id);
  if (ids.length) {
    // Photos first (storage isn't removed by deleting the user).
    for (const bucket of ['meal-photos', 'progress-photos']) {
      for (const id of ids) {
        const { data: files } = await db.storage.from(bucket).list(id, { limit: 1000 });
        const paths = (files ?? []).map((f) => `${id}/${f.name}`);
        if (paths.length) await db.storage.from(bucket).remove(paths);
      }
    }
    // Rows that don't cascade from the profile, then the accounts themselves.
    await db.from('trainer_clients').delete().in('trainer_id', ids);
    await db.from('targets').delete().in('set_by', ids);
    for (const id of ids) await db.auth.admin.deleteUser(id);
  }
  return { deleted: ids.length };
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
    default:
      throw new HttpError(400, 'Unknown action', 'invalid_input');
  }
});
