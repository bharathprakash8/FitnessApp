// Small helpers shared by several Edge Functions (one copy instead of one per function).

/** Constant-time comparison for shared secrets (cron, coach and test keys). Empty never matches. */
export function sameSecret(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** Today's date (YYYY-MM-DD) in a time zone. */
export function todayIn(timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
}

/** A YYYY-MM-DD date moved by n days. */
export function addDays(day: string, n: number) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** ISO weekday of a YYYY-MM-DD date: Monday = 1 … Sunday = 7. */
export function isoWeekday(day: string) {
  const d = new Date(`${day}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}
