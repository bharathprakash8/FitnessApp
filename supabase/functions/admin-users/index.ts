// admin-users: everything the Admin console does to users. Admin callers only.
// POST { action: 'create' | 'update' | 'assign' | 'deactivate' | 'reactivate' | 'delete' |
//        'purge' | 'impersonate', ... }
// impersonate: a session for an active client/trainer so the admin can use the app as them
// (never another admin). Recorded in impersonation_log (admin-only); the person isn't told.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';

import { adminClient, requireAdmin } from '../_shared/auth.ts';
import { HttpError, serveJson } from '../_shared/http.ts';

const BAN_FOREVER = '876000h'; // 100 years

const role = z.enum(['admin', 'trainer', 'client']);
const id = z.string().uuid();
const name = z.string().trim().min(1, 'Name is required').max(100);
const phone = z
  .string()
  .trim()
  .max(20)
  .regex(/^[+0-9 ()-]*$/, 'Phone can only contain digits, spaces and + - ( )')
  .transform((v) => v || null);

const Body = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    email: z.string().trim().toLowerCase().email('Enter a valid email'),
    full_name: name,
    phone: phone.optional(),
    role,
    trainer_id: id.optional(),
  }),
  z.object({
    action: z.literal('update'),
    user_id: id,
    full_name: name.optional(),
    phone: phone.optional(),
    role: role.optional(),
    trainer_id: id.optional(),
  }),
  z.object({ action: z.literal('assign'), client_id: id, trainer_id: id }),
  z.object({ action: z.literal('deactivate'), user_id: id }),
  z.object({ action: z.literal('reactivate'), user_id: id }),
  z.object({ action: z.literal('delete'), user_id: id }),
  // Privacy request: delete the person and everything about them (photos too).
  z.object({ action: z.literal('purge'), user_id: id }),
  // Admin support: log in as this person.
  z.object({ action: z.literal('impersonate'), user_id: id }),
]);

type Admin = ReturnType<typeof adminClient>;

interface ProfileRow {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: 'admin' | 'trainer' | 'client';
  is_active: boolean;
}

async function getProfile(db: Admin, userId: string): Promise<ProfileRow> {
  const { data, error } = await db
    .from('profiles')
    .select('id, email, full_name, phone, role, is_active')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, 'User not found', 'not_found');
  return data as ProfileRow;
}

async function requireActiveTrainer(db: Admin, trainerId: string | undefined): Promise<string> {
  if (!trainerId) throw new HttpError(400, 'Pick a trainer for this client', 'trainer_required');
  const t = await getProfile(db, trainerId).catch(() => null);
  if (!t || t.role !== 'trainer' || !t.is_active) {
    throw new HttpError(400, 'The chosen trainer is not an active trainer', 'invalid_trainer');
  }
  return t.id;
}

async function trainerHasClients(db: Admin, trainerId: string): Promise<boolean> {
  const { count, error } = await db
    .from('trainer_clients')
    .select('client_id', { count: 'exact', head: true })
    .eq('trainer_id', trainerId);
  if (error) throw error;
  return (count ?? 0) > 0;
}

async function assertNotLastAdmin(db: Admin, userId: string) {
  const { count, error } = await db
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'admin')
    .eq('is_active', true)
    .neq('id', userId);
  if (error) throw error;
  if ((count ?? 0) === 0) {
    throw new HttpError(409, 'There must always be at least one active admin', 'last_admin');
  }
}

async function setMapping(db: Admin, clientId: string, trainerId: string, by: string) {
  const { error } = await db.from('trainer_clients').upsert(
    {
      client_id: clientId,
      trainer_id: trainerId,
      assigned_by: by,
      assigned_at: new Date().toISOString(),
    },
    { onConflict: 'client_id' },
  );
  if (error) throw error;
}

async function result(db: Admin, userId: string) {
  const profile = await getProfile(db, userId);
  const { data } = await db
    .from('trainer_clients')
    .select('trainer_id')
    .eq('client_id', userId)
    .maybeSingle();
  return { ...profile, trainer_id: data?.trainer_id ?? null };
}

serveJson(async (req) => {
  const db = adminClient();
  const caller = await requireAdmin(req, db);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new HttpError(400, 'Body must be JSON', 'bad_request');
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid input', 'invalid_input');
  }
  const body = parsed.data;

  switch (body.action) {
    case 'create': {
      const trainerId =
        body.role === 'client' ? await requireActiveTrainer(db, body.trainer_id) : null;

      const { data, error } = await db.auth.admin.createUser({
        email: body.email,
        email_confirm: true,
        user_metadata: { full_name: body.full_name, phone: body.phone ?? null },
        app_metadata: { role: body.role },
      });
      if (error) {
        if (error.code === 'email_exists' || /already/i.test(error.message)) {
          throw new HttpError(409, 'A user with this email already exists', 'email_exists');
        }
        throw error;
      }
      const userId = data.user.id;

      try {
        // The auth trigger creates the profile; Supabase saves app_metadata after
        // that insert, so set role and details here.
        const { error: upErr } = await db
          .from('profiles')
          .update({ role: body.role, full_name: body.full_name, phone: body.phone ?? null })
          .eq('id', userId);
        if (upErr) throw upErr;
        if (trainerId) await setMapping(db, userId, trainerId, caller.id);
      } catch (err) {
        await db.auth.admin.deleteUser(userId); // don't leave a half-created user
        throw err;
      }
      return await result(db, userId);
    }

    case 'update': {
      const current = await getProfile(db, body.user_id);
      const newRole = body.role ?? current.role;

      if (newRole !== current.role) {
        if (body.user_id === caller.id) {
          throw new HttpError(409, "You can't change your own role", 'own_role');
        }
        if (current.role === 'admin') await assertNotLastAdmin(db, body.user_id);
        if (current.role === 'trainer' && (await trainerHasClients(db, body.user_id))) {
          throw new HttpError(
            409,
            "Move this trainer's clients to another trainer before changing their role",
            'trainer_has_clients',
          );
        }
      }
      if (body.trainer_id === body.user_id) {
        throw new HttpError(400, "A user can't be their own trainer", 'invalid_trainer');
      }
      const trainerId =
        newRole === 'client' && (body.trainer_id || newRole !== current.role)
          ? await requireActiveTrainer(db, body.trainer_id)
          : null;

      // Unlink before a role change (the database blocks role changes while linked).
      if (newRole !== current.role && current.role === 'client') {
        const { error } = await db.from('trainer_clients').delete().eq('client_id', body.user_id);
        if (error) throw error;
      }

      const changes: Record<string, unknown> = {};
      if (body.full_name !== undefined) changes.full_name = body.full_name;
      if (body.phone !== undefined) changes.phone = body.phone;
      if (newRole !== current.role) changes.role = newRole;
      if (Object.keys(changes).length > 0) {
        const { error } = await db.from('profiles').update(changes).eq('id', body.user_id);
        if (error) throw error;
      }
      if (trainerId) {
        try {
          await setMapping(db, body.user_id, trainerId, caller.id);
        } catch (err) {
          // Put the role back so the user isn't left half-updated.
          if (newRole !== current.role) {
            await db.from('profiles').update({ role: current.role }).eq('id', body.user_id);
          }
          throw err;
        }
      }
      if (newRole !== current.role) {
        await db.auth.admin.updateUserById(body.user_id, { app_metadata: { role: newRole } });
      }
      return await result(db, body.user_id);
    }

    case 'assign': {
      const client = await getProfile(db, body.client_id);
      if (client.role !== 'client') {
        throw new HttpError(400, 'Only clients can be assigned to a trainer', 'not_client');
      }
      const trainerId = await requireActiveTrainer(db, body.trainer_id);
      await setMapping(db, body.client_id, trainerId, caller.id);
      return await result(db, body.client_id);
    }

    case 'deactivate': {
      if (body.user_id === caller.id) {
        throw new HttpError(409, "You can't deactivate yourself", 'self');
      }
      const target = await getProfile(db, body.user_id);
      if (target.role === 'admin') await assertNotLastAdmin(db, body.user_id);
      const { error } = await db
        .from('profiles')
        .update({ is_active: false })
        .eq('id', body.user_id);
      if (error) throw error;
      // Ban in Auth so they can't get new codes or refresh their session.
      const { error: banErr } = await db.auth.admin.updateUserById(body.user_id, {
        ban_duration: BAN_FOREVER,
      });
      if (banErr) throw banErr;
      return await result(db, body.user_id);
    }

    case 'reactivate': {
      await getProfile(db, body.user_id);
      const { error: banErr } = await db.auth.admin.updateUserById(body.user_id, {
        ban_duration: 'none',
      });
      if (banErr) throw banErr;
      const { error } = await db
        .from('profiles')
        .update({ is_active: true })
        .eq('id', body.user_id);
      if (error) throw error;
      return await result(db, body.user_id);
    }

    case 'delete': {
      if (body.user_id === caller.id) {
        throw new HttpError(409, "You can't delete yourself", 'self');
      }
      const target = await getProfile(db, body.user_id);
      if (target.role === 'admin') await assertNotLastAdmin(db, body.user_id);
      const { data: hasData, error: rpcErr } = await db.rpc('user_has_data', {
        uid: body.user_id,
      });
      if (rpcErr) throw rpcErr;
      if (target.role === 'trainer' && (await trainerHasClients(db, body.user_id))) {
        throw new HttpError(
          409,
          'This trainer still has clients. Move them to another trainer first, or deactivate the trainer.',
          'trainer_has_clients',
        );
      }
      if (hasData) {
        throw new HttpError(409, 'This user has data, so they can only be deactivated', 'has_data');
      }
      // Deleting the auth user cascades to profiles and trainer_clients.
      const { error } = await db.auth.admin.deleteUser(body.user_id);
      if (error) throw error;
      return { id: body.user_id, deleted: true };
    }
    case 'impersonate': {
      const target = await getProfile(db, body.user_id);
      if (target.role === 'admin') {
        throw new HttpError(403, "You can't log in as another admin", 'forbidden');
      }
      if (!target.is_active) {
        throw new HttpError(409, 'This account is deactivated – reactivate it first', 'inactive');
      }
      const { data: link, error: linkErr } = await db.auth.admin.generateLink({
        type: 'magiclink',
        email: target.email,
      });
      if (linkErr) throw linkErr;
      const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: s, error: vErr } = await anon.auth.verifyOtp({
        token_hash: link.properties.hashed_token,
        type: 'magiclink',
      });
      if (vErr || !s.session) throw vErr ?? new Error('No session');
      const { error: logErr } = await db
        .from('impersonation_log')
        .insert({ admin_id: caller.id, user_id: target.id });
      if (logErr) throw logErr;
      return {
        access_token: s.session.access_token,
        refresh_token: s.session.refresh_token,
      };
    }
    case 'purge': {
      if (body.user_id === caller.id) {
        throw new HttpError(409, "You can't delete yourself", 'self');
      }
      const target = await getProfile(db, body.user_id);
      if (target.role === 'admin') await assertNotLastAdmin(db, body.user_id);
      if (target.role === 'trainer' && (await trainerHasClients(db, body.user_id))) {
        throw new HttpError(
          409,
          'This trainer still has clients. Move them to another trainer first.',
          'trainer_has_clients',
        );
      }
      // Photos are not removed by deleting the account.
      let photos = 0;
      for (const bucket of ['meal-photos', 'progress-photos']) {
        const { data: days } = await db.storage.from(bucket).list(body.user_id, { limit: 1000 });
        for (const entry of days ?? []) {
          // meal-photos has a date folder level; progress-photos has files directly.
          const isFolder = !entry.id;
          const paths = isFolder
            ? (
                (
                  await db.storage
                    .from(bucket)
                    .list(`${body.user_id}/${entry.name}`, { limit: 1000 })
                ).data ?? []
              ).map((f) => `${body.user_id}/${entry.name}/${f.name}`)
            : [`${body.user_id}/${entry.name}`];
          if (paths.length) {
            await db.storage.from(bucket).remove(paths);
            photos += paths.length;
          }
        }
      }
      // A trainer's own exercises may appear in clients' history: keep them, hidden, in the
      // shared library so that history stays readable.
      if (target.role === 'trainer') {
        await db
          .from('exercises')
          .update({ trainer_id: null, is_archived: true })
          .eq('trainer_id', body.user_id);
      }
      // Everything else belongs to the profile and is deleted with the account.
      const { error } = await db.auth.admin.deleteUser(body.user_id);
      if (error) throw error;
      console.log('User purged (privacy request); photos removed:', photos);
      return { id: body.user_id, purged: true, photos };
    }
  }
});
