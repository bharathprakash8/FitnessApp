// Labels and the "Copy for Claude" text for the admin's problem log.
import type { Problem } from './supportApi';

export const KIND_LABELS: Record<string, string> = {
  report: 'Reported by user',
  crash: 'App crash',
  js: 'App error',
  api: 'Load/save failed',
  sync: 'Health sync',
  ai: 'AI',
  server: 'Server',
};

export const when = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(iso));

/** Plain text with everything Claude needs to look into a problem. */
export function problemReport(p: Problem, person: string) {
  return [
    `FitCoach problem (${KIND_LABELS[p.kind] ?? p.kind})`,
    `When: ${new Date(p.created_at).toISOString()} (${when(p.created_at)} IST)`,
    `Who: ${person}`,
    `Screen / function: ${p.screen ?? '-'}`,
    `App: ${p.app_version ?? '-'} · ${p.platform ?? '-'}`,
    `Device: ${p.device ?? '-'}`,
    `Message: ${p.message}`,
    `Details: ${JSON.stringify(p.details, null, 2)}`,
  ].join('\n');
}
