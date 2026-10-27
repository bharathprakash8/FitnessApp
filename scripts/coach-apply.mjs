// Head coach, step 3: send the actions and the report from coach-work/actions.json.
//   node scripts/coach-apply.mjs
// actions.json: { "actions": [ ... ], "report": "...", "people": 3, "photos": 7 }
// The server checks every action against the safety rules (dry_run = proposals only).
import { readFileSync, rmSync } from 'node:fs';

const env = {};
for (const f of ['.env.local', '.env.coach.local']) {
  for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2];
  }
}
const call = async (body) => {
  const res = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/coach`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY,
      'x-coach-key': env.COACH_API_KEY,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${body.action} failed: ${JSON.stringify(json.error)}`);
  return json.data;
};

const plan = JSON.parse(readFileSync('coach-work/actions.json', 'utf8'));
const { run_id, mode } = await call({ action: 'start_run', source: 'claude' });
const { results } = await call({ action: 'apply', run_id, actions: plan.actions ?? [] });
const counts = {};
for (const r of results) counts[r.status] = (counts[r.status] ?? 0) + 1;
const problems = results
  .map((r, i) => ({ ...r, input: plan.actions[i] }))
  .filter((r) => r.status === 'refused' || r.status === 'invalid');
let report = plan.report ?? '';
if (problems.length) {
  report += `\n\nBlocked or invalid (${problems.length}):\n${problems
    .map((p) => `- ${p.input?.kind}: ${p.refused_reason ?? p.error}`)
    .join('\n')}`;
}
await call({
  action: 'finish_run',
  run_id,
  report,
  people: plan.people ?? 0,
  photos: plan.photos ?? 0,
});
console.log(`run ${run_id} (${mode}):`, JSON.stringify(counts));
for (const p of problems) console.log(`  ${p.status}: ${p.input?.kind} – ${p.refused_reason ?? p.error}`);
// Photos are private: remove the working folder.
rmSync('coach-work', { recursive: true, force: true });
