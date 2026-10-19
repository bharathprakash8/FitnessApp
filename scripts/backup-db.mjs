// Exports all app data to JSON files (used by the weekly backup workflow): every table the
// API exposes in the public schema, page by page, plus the login accounts. The database
// structure itself is in supabase/migrations/. Needs SUPABASE_URL and SERVICE_KEY.
//   node scripts/backup-db.mjs <folder>
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const url = process.env.SUPABASE_URL;
const key = process.env.SERVICE_KEY;
const out = process.argv[2] ?? 'db';
if (!url || !key) throw new Error('SUPABASE_URL and SERVICE_KEY are required');

const headers = { Authorization: `Bearer ${key}`, apikey: key };
mkdirSync(join(out, 'tables'), { recursive: true });

// Table names from the API's own description of the public schema.
const spec = await (await fetch(`${url}/rest/v1/`, { headers })).json();
const tables = Object.keys(spec.definitions ?? {}).sort();
if (tables.length === 0) throw new Error('No tables found – is the service key right?');

const PAGE = 1000;
const summary = {};
for (const table of tables) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(`${url}/rest/v1/${table}?select=*`, {
      headers: { ...headers, Range: `${from}-${from + PAGE - 1}`, 'Range-Unit': 'items' },
    });
    if (!res.ok) throw new Error(`${table}: HTTP ${res.status}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  writeFileSync(join(out, 'tables', `${table}.json`), JSON.stringify(rows));
  summary[table] = rows.length;
}

// Login accounts (ids, emails, roles) – needed to recreate users with the same ids.
const users = [];
for (let page = 1; ; page++) {
  const res = await fetch(`${url}/auth/v1/admin/users?page=${page}&per_page=200`, { headers });
  if (!res.ok) throw new Error(`auth users: HTTP ${res.status}`);
  const body = await res.json();
  users.push(...(body.users ?? []));
  if ((body.users ?? []).length < 200) break;
}
writeFileSync(join(out, 'auth-users.json'), JSON.stringify(users));

writeFileSync(
  join(out, 'manifest.json'),
  JSON.stringify(
    {
      exported_at: new Date().toISOString(),
      project: url,
      auth_users: users.length,
      tables: summary,
    },
    null,
    2,
  ),
);
console.log(`Exported ${tables.length} tables and ${users.length} login accounts.`);
for (const [t, n] of Object.entries(summary)) console.log(`  ${t}: ${n}`);
