export const DEFAULT_TIMEZONE = 'Asia/Kolkata';

/** e.g. "17 Oct 2026", shown in the user's time zone. */
export function formatDate(iso: string | null | undefined, timeZone = DEFAULT_TIMEZONE): string {
  if (!iso) return '';
  // A plain date (YYYY-MM-DD) is a calendar day, not an instant: don't shift it.
  const isPlainDate = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: isPlainDate ? 'UTC' : timeZone,
  }).format(new Date(isPlainDate ? `${iso}T00:00:00Z` : iso));
}

/** Today's date as YYYY-MM-DD in the given time zone. */
export function todayIn(timeZone = DEFAULT_TIMEZONE): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
}

/** Whole years between a YYYY-MM-DD birth date and today. */
export function ageFrom(
  dob: string | null | undefined,
  timeZone = DEFAULT_TIMEZONE,
): number | null {
  if (!dob) return null;
  const [by, bm, bd] = dob.split('-').map(Number);
  const [ty, tm, td] = todayIn(timeZone).split('-').map(Number);
  if (!by || !bm || !bd || !ty || !tm || !td) return null;
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}
