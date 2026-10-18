/** A coloured circle with a person's initials (colour is stable per person). */
const COLOURS = [
  '#0e9f6e',
  '#2563eb',
  '#d97706',
  '#db2777',
  '#7c3aed',
  '#0891b2',
  '#65a30d',
  '#dc2626',
];

function initials(name: string | null | undefined, email?: string | null) {
  const words = (name || email || '?')
    .trim()
    .split(/[\s@._-]+/)
    .filter(Boolean);
  return (
    (words[0]?.[0] ?? '?') + (words.length > 1 ? (words.at(-1)?.[0] ?? '') : '')
  ).toUpperCase();
}

function colourFor(key: string) {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLOURS[h % COLOURS.length];
}

export function Avatar({
  name,
  email,
  id,
  size = 40,
  slot,
}: {
  name: string | null | undefined;
  email?: string | null;
  id: string;
  size?: number;
  slot?: string;
}) {
  return (
    <div
      slot={slot}
      aria-hidden="true"
      className="app-avatar"
      style={{ width: size, height: size, fontSize: size * 0.4, background: colourFor(id) }}
    >
      {initials(name, email)}
    </div>
  );
}
