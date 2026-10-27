// Head coach, step 1: download today's digest and the meal photos to check.
//   node scripts/coach-fetch.mjs
// Writes coach-work/digest.json and coach-work/photos/<meal_id>.jpg (git-ignored; delete the
// folder after the run – the photos are private). Needs COACH_API_KEY in .env.coach.local.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const env = {};
for (const f of ['.env.local', '.env.coach.local']) {
  for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2];
  }
}
if (!env.COACH_API_KEY) throw new Error('COACH_API_KEY missing in .env.coach.local');

const res = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/coach`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY,
    'x-coach-key': env.COACH_API_KEY,
  },
  body: JSON.stringify({ action: 'digest' }),
});
const body = await res.json();
if (!res.ok) throw new Error(`digest failed: ${JSON.stringify(body.error)}`);
const digest = body.data;

rmSync('coach-work', { recursive: true, force: true });
mkdirSync('coach-work/photos', { recursive: true });
let photos = 0;
for (const p of digest.people) {
  for (const m of p.meals_to_check) {
    if (!m.photo_url) continue;
    const img = await fetch(m.photo_url);
    if (img.ok) {
      writeFileSync(`coach-work/photos/${m.meal_id}.jpg`, Buffer.from(await img.arrayBuffer()));
      m.photo_file = `coach-work/photos/${m.meal_id}.jpg`;
      photos++;
    }
    delete m.photo_url; // signed links don't need to stay on disk
  }
}
writeFileSync('coach-work/digest.json', JSON.stringify(digest, null, 1));
console.log(
  `mode=${digest.mode} people=${digest.people.length} meals_to_check=${digest.people.reduce((s, p) => s + p.meals_to_check.length, 0)} photos=${photos}`,
);
