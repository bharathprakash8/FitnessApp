// admin-health: server RAM, CPU and disk for Admin → App health.
// Reads Supabase's own Prometheus metrics endpoint (service role, server side only) and
// returns a few numbers. Admins only.
import { adminClient, requireAdmin } from '../_shared/auth.ts';
import { serveJson } from '../_shared/http.ts';

type Sample = { name: string; labels: Record<string, string>; value: number };

function parse(text: string): Sample[] {
  const out: Sample[] = [];
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{([^}]*)\})?\s+([^\s]+)/);
    if (!m) continue;
    const labels: Record<string, string> = {};
    for (const l of (m[3] ?? '').matchAll(/(\w+)="([^"]*)"/g)) labels[l[1]!] = l[2]!;
    out.push({ name: m[1]!, labels, value: Number(m[4]) });
  }
  return out;
}

async function fetchMetrics(): Promise<Sample[] | null> {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return null;
  const res = await fetch(`${url}/customer/v1/privileged/metrics`, {
    headers: { Authorization: `Basic ${btoa(`service_role:${key}`)}` },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!res?.ok) {
    console.error('Metrics endpoint failed', res?.status ?? 'network');
    return null;
  }
  return parse(await res.text());
}

const first = (s: Sample[], name: string, labels: Record<string, string> = {}) =>
  s.find((x) => x.name === name && Object.entries(labels).every(([k, v]) => x.labels[k] === v))
    ?.value ?? null;

/** Total idle and total CPU seconds across all cores. */
function cpuTimes(s: Sample[]) {
  let idle = 0;
  let total = 0;
  for (const x of s) {
    if (x.name !== 'node_cpu_seconds_total') continue;
    total += x.value;
    if (x.labels.mode === 'idle' || x.labels.mode === 'iowait') idle += x.value;
  }
  return { idle, total };
}

/** The AI models FitCoach is set to use, in order, and whether Google offers each one. */
async function aiModels() {
  const key = Deno.env.get('GEMINI_API_KEY');
  const wanted = [
    Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.8-flash',
    ...(Deno.env.get('GEMINI_FALLBACK_MODELS') ?? '')
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean),
  ];
  if (!key) return wanted.map((name) => ({ name, available: null }));
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', {
    headers: { 'x-goog-api-key': key },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  const body = res?.ok ? ((await res.json()) as { models?: { name: string }[] }) : null;
  const known = new Set((body?.models ?? []).map((m) => m.name.replace(/^models\//, '')));
  return [...new Set(wanted)].map((name) => ({ name, available: body ? known.has(name) : null }));
}

serveJson(async (req) => {
  await requireAdmin(req, adminClient());
  const models = aiModels().catch(() => []);

  const a = await fetchMetrics();
  if (!a) return { available: false, ai_models: await models };
  // CPU use needs two readings a moment apart.
  await new Promise((r) => setTimeout(r, 1500));
  const b = (await fetchMetrics()) ?? a;

  const memTotal = first(b, 'node_memory_MemTotal_bytes');
  const memAvailable = first(b, 'node_memory_MemAvailable_bytes');
  const t1 = cpuTimes(a);
  const t2 = cpuTimes(b);
  const busy = t2.total - t1.total > 0 ? 1 - (t2.idle - t1.idle) / (t2.total - t1.total) : null;
  const cores = new Set(
    b.filter((x) => x.name === 'node_cpu_seconds_total').map((x) => x.labels.cpu),
  ).size;
  // The metrics are only refreshed every few seconds; if both readings are the same, use
  // the 1-minute load average per core instead.
  const load = first(b, 'node_load1');
  const loadPct = load !== null && cores ? load / cores : null;
  const diskSize =
    first(b, 'node_filesystem_size_bytes', { mountpoint: '/data' }) ??
    first(b, 'node_filesystem_size_bytes', { mountpoint: '/' });
  const diskAvail =
    first(b, 'node_filesystem_avail_bytes', { mountpoint: '/data' }) ??
    first(b, 'node_filesystem_avail_bytes', { mountpoint: '/' });

  return {
    available: true,
    ai_models: await models,
    memory_total_bytes: memTotal,
    memory_used_bytes: memTotal !== null && memAvailable !== null ? memTotal - memAvailable : null,
    cpu_busy_percent:
      busy !== null && t2.total !== t1.total
        ? Math.round(Math.max(0, Math.min(1, busy)) * 100)
        : loadPct !== null
          ? Math.round(Math.min(1, loadPct) * 100)
          : null,
    cpu_cores: cores || null,
    load_1m: first(b, 'node_load1'),
    disk_total_bytes: diskSize,
    disk_used_bytes: diskSize !== null && diskAvail !== null ? diskSize - diskAvail : null,
  };
});
