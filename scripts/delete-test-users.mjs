// Deletes ALL test accounts (@fitcoach.test, marked as test) and everything they own: meals,
// workouts, chats, AI coach changes, their photos, plus the head coach's TEST runs.
// Real accounts are never touched. Run from the FitnessApp folder:
//   node scripts/delete-test-users.mjs
import { readFileSync } from 'node:fs';

const env = {};
for (const f of ['.env.local', '.env.test.local']) {
  for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2];
  }
}
const res = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/test-users`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY,
    'x-test-secret': env.TEST_USERS_SECRET,
  },
  body: JSON.stringify({ action: 'cleanup' }),
});
const body = await res.json();
console.log(res.ok ? 'Done:' : 'Failed:', JSON.stringify(body.data ?? body.error, null, 1));
