// Downloads every file of the private photo buckets into a folder (used by the weekly
// backup workflow). Needs SUPABASE_URL and SERVICE_KEY in the environment.
//   node scripts/backup-photos.mjs <folder>
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const url = process.env.SUPABASE_URL;
const key = process.env.SERVICE_KEY;
const out = process.argv[2] ?? 'photos';
if (!url || !key) throw new Error('SUPABASE_URL and SERVICE_KEY are required');

const headers = { Authorization: `Bearer ${key}`, apikey: key };

async function list(bucket, prefix) {
  const res = await fetch(`${url}/storage/v1/object/list/${bucket}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix, limit: 1000, offset: 0 }),
  });
  if (!res.ok) throw new Error(`list ${bucket}/${prefix}: HTTP ${res.status}`);
  return res.json();
}

/** Every file path in a bucket (folders have no id). */
async function walk(bucket, prefix = '') {
  const files = [];
  for (const item of await list(bucket, prefix)) {
    const path = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.id) files.push(path);
    else files.push(...(await walk(bucket, path)));
  }
  return files;
}

let count = 0;
for (const bucket of ['progress-photos', 'meal-photos']) {
  const files = await walk(bucket);
  for (const path of files) {
    const res = await fetch(`${url}/storage/v1/object/${bucket}/${path}`, { headers });
    if (!res.ok) throw new Error(`download ${bucket}/${path}: HTTP ${res.status}`);
    const target = join(out, bucket, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, Buffer.from(await res.arrayBuffer()));
    count++;
  }
  console.log(`${bucket}: ${files.length} files`);
}
console.log(`Downloaded ${count} photos.`);
