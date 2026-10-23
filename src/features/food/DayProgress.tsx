import type { Target } from '../targets/api';
import type { Totals } from './model';
import './food.css';
import { useT } from '../../i18n/i18n';

/** Calories-in ring plus protein / carbs / fat bars against the day's targets. */
export function DayProgress({ totals, target }: { totals: Totals; target: Target | null }) {
  const t = useT();
  const goal = target?.calories ?? 0;
  const pct = goal ? Math.min(1, totals.calories / goal) : 0;
  const over = goal > 0 && totals.calories > goal;
  const r = 44;
  const c = 2 * Math.PI * r;
  const left = goal - totals.calories;

  return (
    <div className="ring-wrap">
      <svg
        width="112"
        height="112"
        viewBox="0 0 112 112"
        role="img"
        aria-label={goal ? `${totals.calories} of ${goal} kcal` : `${totals.calories} kcal`}
      >
        <circle
          cx="56"
          cy="56"
          r={r}
          fill="none"
          stroke="var(--ion-color-light)"
          strokeWidth="10"
        />
        {/* no progress arc at 0 – a round line cap would draw a dot */}
        <circle
          cx="56"
          cy="56"
          r={r}
          fill="none"
          visibility={pct > 0 ? 'visible' : 'hidden'}
          stroke={over ? 'var(--ion-color-warning)' : 'var(--ion-color-primary)'}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`}
          transform="rotate(-90 56 56)"
        />
        <text x="56" y="54" textAnchor="middle" className="ring-center" fontSize="20">
          {totals.calories.toLocaleString('en-IN')}
        </text>
        <text x="56" y="72" textAnchor="middle" className="ring-sub">
          {goal
            ? left >= 0
              ? t('{n} left', { n: left.toLocaleString('en-IN') })
              : t('{n} over', { n: (-left).toLocaleString('en-IN') })
            : t('kcal eaten')}
        </text>
      </svg>
      <div className="macro-bars">
        <Bar label={t('Protein')} value={totals.protein_g} goal={target?.protein_g} />
        <Bar label={t('Carbs')} value={totals.carbs_g} goal={target?.carbs_g} />
        <Bar label={t('Fat')} value={totals.fat_g} goal={target?.fat_g} />
      </div>
    </div>
  );
}

function Bar({ label, value, goal }: { label: string; value: number; goal?: number }) {
  const pct = goal ? Math.min(100, (value / goal) * 100) : 0;
  return (
    <div>
      <div className="macro-bar-label">
        <span>{label}</span>
        <span>
          {Math.round(value)}
          {goal ? ` / ${goal}` : ''} g
        </span>
      </div>
      <div className="macro-bar">
        <div className={goal && value > goal * 1.1 ? 'over' : ''} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
