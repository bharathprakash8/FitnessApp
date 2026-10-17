export const DEFAULT_TIMEZONE = 'Asia/Kolkata';

/** e.g. "17 Oct 2026", shown in the user's time zone. */
export function formatDate(iso: string | null | undefined, timeZone = DEFAULT_TIMEZONE): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone,
  }).format(new Date(iso));
}
