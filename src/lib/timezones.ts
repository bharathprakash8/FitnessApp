import { DEFAULT_TIMEZONE } from './dates';

/** Time zones offered in pickers (India first). Any valid IANA zone also works. */
export const TIME_ZONES: { tz: string; label: string }[] = [
  { tz: 'Asia/Kolkata', label: 'India (IST)' },
  { tz: 'Asia/Dubai', label: 'UAE (Dubai)' },
  { tz: 'Asia/Riyadh', label: 'Saudi Arabia (Riyadh)' },
  { tz: 'Asia/Qatar', label: 'Qatar (Doha)' },
  { tz: 'Asia/Kathmandu', label: 'Nepal' },
  { tz: 'Asia/Dhaka', label: 'Bangladesh' },
  { tz: 'Asia/Colombo', label: 'Sri Lanka' },
  { tz: 'Asia/Singapore', label: 'Singapore' },
  { tz: 'Asia/Kuala_Lumpur', label: 'Malaysia' },
  { tz: 'Asia/Hong_Kong', label: 'Hong Kong' },
  { tz: 'Asia/Tokyo', label: 'Japan' },
  { tz: 'Australia/Perth', label: 'Australia – Perth' },
  { tz: 'Australia/Sydney', label: 'Australia – Sydney / Melbourne' },
  { tz: 'Pacific/Auckland', label: 'New Zealand' },
  { tz: 'Europe/London', label: 'UK (London)' },
  { tz: 'Europe/Dublin', label: 'Ireland' },
  { tz: 'Europe/Paris', label: 'Central Europe (Paris, Berlin, Amsterdam)' },
  { tz: 'Africa/Johannesburg', label: 'South Africa' },
  { tz: 'Africa/Nairobi', label: 'Kenya' },
  { tz: 'America/New_York', label: 'US / Canada – Eastern' },
  { tz: 'America/Chicago', label: 'US / Canada – Central' },
  { tz: 'America/Denver', label: 'US / Canada – Mountain' },
  { tz: 'America/Los_Angeles', label: 'US / Canada – Pacific' },
  { tz: 'America/Toronto', label: 'Canada – Toronto' },
  { tz: 'America/Vancouver', label: 'Canada – Vancouver' },
];

export function timeZoneLabel(tz: string | null | undefined): string {
  const z = tz || DEFAULT_TIMEZONE;
  return TIME_ZONES.find((t) => t.tz === z)?.label ?? z.replace(/_/g, ' ');
}

/** Old names some systems still report, mapped to the current ones. */
const ZONE_ALIASES: Record<string, string> = {
  'Asia/Calcutta': 'Asia/Kolkata',
  'Asia/Katmandu': 'Asia/Kathmandu',
  'Asia/Saigon': 'Asia/Ho_Chi_Minh',
  'Asia/Rangoon': 'Asia/Yangon',
};

/** The phone's own time zone (e.g. "Europe/London"), or IST if it can't tell. */
export function deviceTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE;
    return ZONE_ALIASES[tz] ?? tz;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/** Options for a picker, making sure `current` is in the list. */
export function zoneOptions(current?: string | null) {
  const list = [...TIME_ZONES];
  for (const z of [current, deviceTimeZone()]) {
    if (z && !list.some((t) => t.tz === z)) list.push({ tz: z, label: z.replace(/_/g, ' ') });
  }
  return list;
}

/** "Tue 20 Oct, 6:30 pm" in a time zone. */
export function formatWhen(iso: string, timeZone: string = DEFAULT_TIMEZONE): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

/** Short zone name at that moment, e.g. "IST", "GMT+1", "EDT". */
export function zoneAbbr(iso: string, timeZone: string): string {
  return (
    new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' })
      .formatToParts(new Date(iso))
      .find((p) => p.type === 'timeZoneName')?.value ?? ''
  ).replace('GMT+5:30', 'IST');
}
