/**
 * Small SVG charts (no chart library, to keep the app light). They scale to the card width.
 */
import './progress.css';
import { dateLocale, useT } from '../../i18n/i18n';

const W = 320;
const H = 140;
const PAD = { top: 12, right: 8, bottom: 22, left: 34 };
const innerW = W - PAD.left - PAD.right;
const innerH = H - PAD.top - PAD.bottom;

const shortDate = (date: string) =>
  new Intl.DateTimeFormat(dateLocale(), { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  );

function niceRange(values: number[], extra: (number | null | undefined)[] = []) {
  const all = [...values, ...extra.filter((v): v is number => typeof v === 'number')];
  let min = Math.min(...all);
  let max = Math.max(...all);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const pad = (max - min) * 0.1;
  return { min: min - pad, max: max + pad };
}

/** Line chart for values over (irregular) dates, e.g. weight. */
export function LineChart({
  points,
  unit,
  label,
}: {
  points: { date: string; value: number }[];
  unit: string;
  label: string;
}) {
  const t = useT();
  if (points.length === 0) return <p className="progress-empty">{t('No entries yet.')}</p>;
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const t0 = Date.parse(sorted[0]!.date);
  const t1 = Date.parse(sorted.at(-1)!.date);
  const span = Math.max(1, t1 - t0);
  const { min, max } = niceRange(sorted.map((p) => p.value));
  const x = (d: string) =>
    PAD.left + (sorted.length === 1 ? innerW / 2 : ((Date.parse(d) - t0) / span) * innerW);
  const y = (v: number) => PAD.top + (1 - (v - min) / (max - min)) * innerH;
  const path = sorted
    .map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`)
    .join(' ');
  const first = sorted[0]!;
  const last = sorted.at(-1)!;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="progress-chart" role="img" aria-label={label}>
      <Axis min={min} max={max} y={y} digits={1} />
      <path d={path} className="chart-line" />
      {sorted.map((p) => (
        <circle key={p.date + p.value} cx={x(p.date)} cy={y(p.value)} r={3} className="chart-dot" />
      ))}
      <text x={PAD.left} y={H - 6} className="chart-label">
        {shortDate(first.date)}
      </text>
      {sorted.length > 1 && (
        <text x={W - PAD.right} y={H - 6} textAnchor="end" className="chart-label">
          {shortDate(last.date)} · {last.value} {unit}
        </text>
      )}
    </svg>
  );
}

/** Bars per day (e.g. calories), with an optional target line. Empty days show no bar. */
export function BarChart({
  points,
  target,
  label,
  color = 'primary',
}: {
  points: { date: string; value: number | null }[];
  target?: number | null;
  label: string;
  color?: 'primary' | 'secondary';
}) {
  const t = useT();
  const values = points.map((p) => p.value).filter((v): v is number => v !== null);
  if (values.length === 0)
    return <p className="progress-empty">{t('Nothing recorded in this period.')}</p>;
  const max = Math.max(...values, target ?? 0, 1) * 1.1;
  const y = (v: number) => PAD.top + (1 - v / max) * innerH;
  const slot = innerW / points.length;
  const barW = Math.max(2, slot * 0.7);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="progress-chart" role="img" aria-label={label}>
      <Axis min={0} max={max} y={y} digits={0} />
      {points.map((p, i) =>
        p.value === null ? null : (
          <rect
            key={p.date}
            x={PAD.left + i * slot + (slot - barW) / 2}
            y={y(p.value)}
            width={barW}
            height={Math.max(0, PAD.top + innerH - y(p.value))}
            rx={1.5}
            className={`chart-bar ${color}`}
          >
            <title>
              {shortDate(p.date)}: {Math.round(p.value)}
            </title>
          </rect>
        ),
      )}
      {target ? (
        <>
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(target)}
            y2={y(target)}
            className="chart-target"
          />
          <text x={W - PAD.right} y={y(target) - 3} textAnchor="end" className="chart-label">
            {t('target')} {target}
          </text>
        </>
      ) : null}
      <text x={PAD.left} y={H - 6} className="chart-label">
        {shortDate(points[0]!.date)}
      </text>
      <text x={W - PAD.right} y={H - 6} textAnchor="end" className="chart-label">
        {shortDate(points.at(-1)!.date)}
      </text>
    </svg>
  );
}

function Axis({
  min,
  max,
  y,
  digits,
}: {
  min: number;
  max: number;
  y: (v: number) => number;
  digits: number;
}) {
  const ticks = [min + (max - min) * 0.1, (min + max) / 2, max - (max - min) * 0.1];
  return (
    <>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="chart-grid" />
          <text x={PAD.left - 4} y={y(t) + 3} textAnchor="end" className="chart-label">
            {t >= 1000 ? `${(t / 1000).toFixed(1)}k` : t.toFixed(digits)}
          </text>
        </g>
      ))}
    </>
  );
}
