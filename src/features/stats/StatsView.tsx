import {
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonLabel,
  IonSegment,
  IonSegmentButton,
  IonSkeletonText,
  IonSpinner,
  IonText,
} from '@ionic/react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';

import { ageFrom, DEFAULT_TIMEZONE, todayIn } from '../../lib/dates';
import type { Profile } from '../auth/roles';
import { BarChart } from '../progress/Charts';
import { DEFAULT_WATER_ML, useMeasurements } from '../progress/api';
import { currentTarget, useTargets } from '../targets/api';
import { useWorkoutLogs } from '../workouts/api';
import { requestInsights, useSavedInsights, useStatsData, type Insights } from './api';
import { computeStats, insightInput, type Stats } from './model';
import './stats.css';
import { tr, useT } from '../../i18n/i18n';

const PERIODS = [7, 30, 90] as const;
const MEAL_NAMES: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  snack: 'Snack',
  dinner: 'Dinner',
};
const n = (v: number) => v.toLocaleString('en-IN');

/**
 * Stats for one person: summary, eating patterns, targets, activity and AI insights.
 * Used by the client's Stats tab and by the trainer (client page → Stats).
 */
export function StatsView({ person }: { person: Profile }) {
  const t = useT();
  const tz = person.timezone ?? DEFAULT_TIMEZONE;
  const today = todayIn(tz);
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>(30);
  const data = useStatsData(person.id, today, 90);
  const logs = useWorkoutLogs(person.id);
  const measurements = useMeasurements(person.id);
  const targets = useTargets(person.id);

  const ready = data.data && logs.data && measurements.data && targets.data !== undefined;
  const { stats, stats30 } = useMemo(() => {
    if (!ready) return { stats: null, stats30: null };
    const weights = measurements.data!;
    const latest = [...weights]
      .filter((w) => w.weight_kg !== null)
      .sort((a, b) => b.measured_on.localeCompare(a.measured_on))[0];
    const base = {
      today,
      meals: data.data!.meals,
      activity: data.data!.activity,
      water: data.data!.water,
      logs: logs.data!,
      weights,
      target: currentTarget(targets.data, tz),
      profile: person,
      weightKg: latest ? Number(latest.weight_kg) : null,
      age: ageFrom(person.date_of_birth, tz),
      defaultWaterMl: DEFAULT_WATER_ML,
    };
    return {
      stats: computeStats({ ...base, days: period }),
      stats30: period === 30 ? null : computeStats({ ...base, days: 30 }),
    };
  }, [ready, data.data, logs.data, measurements.data, targets.data, person, period, today, tz]);

  if (data.isError) {
    return (
      <IonText color="danger">
        <p className="ion-text-center">
          {t("Couldn't load stats. Pull down or tap refresh to retry.")}
        </p>
      </IonText>
    );
  }
  if (!stats) {
    return (
      <div className="stats-page">
        {[0, 1, 2].map((i) => (
          <IonSkeletonText key={i} animated className="stats-skeleton" />
        ))}
      </div>
    );
  }

  return (
    <div className="stats-page">
      <IonSegment
        value={String(period)}
        onIonChange={(e) => setPeriod(Number(e.detail.value) as (typeof PERIODS)[number])}
      >
        {PERIODS.map((p) => (
          <IonSegmentButton key={p} value={String(p)}>
            <IonLabel>{t('{n} days', { n: p })}</IonLabel>
          </IonSegmentButton>
        ))}
      </IonSegment>
      <p className="stats-muted">
        {t('Up to yesterday · {n} day(s) with food logged', { n: stats.daysLogged })}
      </p>

      <SummaryTiles s={stats} />
      <InsightsCard person={person} today={today} stats30={stats30 ?? stats} />
      <PatternsCard s={stats} />
      <TargetsCard s={stats} />
      <ActivityCard s={stats} />
    </div>
  );
}

function Tile({ value, label, tone }: { value: string; label: string; tone?: 'good' | 'warn' }) {
  return (
    <div className={`stats-tile ${tone ?? ''}`}>
      <div className="stats-tile-value">{value}</div>
      <div className="stats-tile-label">{label}</div>
    </div>
  );
}

function SummaryTiles({ s }: { s: Stats }) {
  const t = useT();
  return (
    <div className="stats-tiles">
      <Tile
        value={s.avg ? `${n(s.avg.kcal)}${s.target ? ` / ${n(s.target.kcal)}` : ''}` : '–'}
        label={t('avg kcal eaten / target')}
      />
      <Tile
        value={s.daysOnTarget === null ? '–' : t('{a} of {b}', { a: s.daysOnTarget, b: s.days })}
        label={t('days on target (±10%)')}
        tone={s.daysOnTarget !== null && s.daysOnTarget >= s.days / 2 ? 'good' : undefined}
      />
      <Tile value={t('{n} day(s)', { n: s.streak })} label={t('logging streak')} />
      <Tile
        value={s.avgNet === null ? '–' : `${s.avgNet > 0 ? '+' : ''}${n(s.avgNet)}`}
        label={s.burnEstimated ? t('avg net kcal (estimated)') : t('avg net kcal')}
      />
      {s.weight && (
        <Tile
          value={`${s.weight.change > 0 ? '+' : ''}${s.weight.change} kg`}
          label={`weight ${s.weight.start} → ${s.weight.end}`}
        />
      )}
    </div>
  );
}

function InsightsCard({
  person,
  today,
  stats30,
}: {
  person: Profile;
  today: string;
  stats30: Stats;
}) {
  const tx = useT();
  const qc = useQueryClient();
  const saved = useSavedInsights(person.id, today);
  const [error, setError] = useState<string | null>(null);
  const asked = useRef(false);
  const enough = stats30.daysLogged >= 3;
  const fresh = saved.data?.made_on === today;

  // Once a day, when Stats is opened and there is enough data, ask for new insights.
  useEffect(() => {
    if (saved.isPending || fresh || !enough || asked.current) return;
    asked.current = true;
    requestInsights(person.id, insightInput(stats30))
      .then((ins) => qc.setQueryData<Insights>(['insights', person.id, today], ins))
      .catch((e: Error) => setError(e.message));
  }, [saved.isPending, fresh, enough, person.id, stats30, qc, today]);

  const ins = saved.data;
  return (
    <IonCard className="stats-card">
      <IonCardHeader>
        <IonCardSubtitle>{tx('Insights · AI, last 30 days')}</IonCardSubtitle>
      </IonCardHeader>
      <IonCardContent>
        {ins ? null : !enough ? (
          <p className="stats-muted">{tx('Log food on at least 3 days to get insights.')}</p>
        ) : !error ? (
          <p className="stats-muted">
            <IonSpinner name="dots" /> {tx('Reading the numbers…')}
          </p>
        ) : null}
        {ins && (
          <>
            <ul className="stats-insights">
              {ins.insights.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            {ins.focus && (
              <p className="stats-focus">
                <strong>{tx('Focus:')}</strong> {ins.focus}
              </p>
            )}
            <p className="stats-muted">
              {tx('Estimated by AI from the logs')}
              {ins.made_on !== today ? tx(' (from an earlier day)') : ''}
              {tx('. Not medical advice.')}
            </p>
          </>
        )}
        {error && !ins && <p className="stats-muted">{error}</p>}
      </IonCardContent>
    </IonCard>
  );
}

function Bar({ pct, tone }: { pct: number; tone?: 'over' | 'under' }) {
  return (
    <div className="stats-bar">
      <div
        className={`stats-bar-fill ${tone ?? ''}`}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  );
}

function PatternsCard({ s }: { s: Stats }) {
  const t = useT();
  if (!s.daysLogged) return null;
  const maxProtein = Math.max(1, ...s.proteinPerMeal.map((p) => p.grams ?? 0));
  return (
    <IonCard className="stats-card">
      <IonCardHeader>
        <IonCardSubtitle>{t('Eating patterns')}</IonCardSubtitle>
      </IonCardHeader>
      <IonCardContent>
        <h3 className="stats-h">{t('Usual meal times')}</h3>
        <div className="stats-rows">
          {s.mealTimes.map((m) => (
            <div key={m.meal} className="stats-row">
              <span>{tr(MEAL_NAMES[m.meal])}</span>
              <strong>{m.time ?? '–'}</strong>
            </div>
          ))}
        </div>
        <p className="stats-note">
          {t('{a} late dinner(s) (after 9:30 pm) · {b} day(s) without breakfast', {
            a: s.lateDinners,
            b: s.skippedBreakfasts,
          })}
        </p>

        <h3 className="stats-h">{t('Where the calories come from')}</h3>
        {s.kcalShare.map((m) => (
          <div key={m.meal} className="stats-barrow">
            <span>{tr(MEAL_NAMES[m.meal])}</span>
            <Bar pct={m.pct} />
            <strong>{m.pct}%</strong>
          </div>
        ))}

        <h3 className="stats-h">{t('Protein per meal (avg)')}</h3>
        {s.proteinPerMeal.map((m) => (
          <div key={m.meal} className="stats-barrow">
            <span>{tr(MEAL_NAMES[m.meal])}</span>
            <Bar pct={((m.grams ?? 0) / maxProtein) * 100} />
            <strong>{m.grams === null ? '–' : `${m.grams} g`}</strong>
          </div>
        ))}

        {(s.weekdayKcal !== null || s.weekendKcal !== null) && (
          <>
            <h3 className="stats-h">{t('Weekdays vs weekends')}</h3>
            <div className="stats-rows">
              <div className="stats-row">
                <span>{t('Mon–Fri average')}</span>
                <strong>{s.weekdayKcal === null ? '–' : `${n(s.weekdayKcal)} kcal`}</strong>
              </div>
              <div className="stats-row">
                <span>{t('Sat–Sun average')}</span>
                <strong>{s.weekendKcal === null ? '–' : `${n(s.weekendKcal)} kcal`}</strong>
              </div>
            </div>
          </>
        )}

        <h3 className="stats-h">{t('Most eaten')}</h3>
        <div className="stats-chips">
          {s.topFoods.map((f) => (
            <span key={f.name} className="stats-chip">
              {f.name} <small>×{f.times}</small>
            </span>
          ))}
        </div>
        <h3 className="stats-h">{t('Biggest calorie sources')}</h3>
        <div className="stats-rows">
          {s.topSources.map((f) => (
            <div key={f.name} className="stats-row">
              <span>{f.name}</span>
              <strong>
                {n(f.kcal)} {t('kcal')}
              </strong>
            </div>
          ))}
        </div>
      </IonCardContent>
    </IonCard>
  );
}

function TargetsCard({ s }: { s: Stats }) {
  const tx = useT();
  const t = s.target;
  const rows =
    t && s.avg
      ? [
          { label: tx('Calories'), avg: s.avg.kcal, target: t.kcal, unit: 'kcal' },
          { label: tx('Protein'), avg: s.avg.protein, target: t.protein, unit: 'g' },
          { label: tx('Carbs'), avg: s.avg.carbs, target: t.carbs, unit: 'g' },
          { label: tx('Fat'), avg: s.avg.fat, target: t.fat, unit: 'g' },
        ].filter((r) => r.target > 0)
      : [];
  const last30 = s.dayStatus.slice(-30);
  return (
    <IonCard className="stats-card">
      <IonCardHeader>
        <IonCardSubtitle>{tx('Targets and consistency')}</IonCardSubtitle>
      </IonCardHeader>
      <IonCardContent>
        {!t && <p className="stats-muted">{tx('No targets set yet.')}</p>}
        {rows.map((r) => {
          const pct = Math.round((r.avg / r.target) * 100);
          return (
            <div key={r.label} className="stats-barrow wide">
              <span>{r.label}</span>
              <Bar pct={pct} tone={pct > 110 ? 'over' : pct < 90 ? 'under' : undefined} />
              <strong>
                {n(r.avg)} / {n(r.target)} {r.unit}
              </strong>
            </div>
          );
        })}
        {s.proteinDays !== null && (
          <p className="stats-note">
            {tx('Protein target reached on {a} of {b} logged days', {
              a: s.proteinDays,
              b: s.daysLogged,
            })}
          </p>
        )}
        <h3 className="stats-h">{tx('Last {n} days', { n: last30.length })}</h3>
        <div
          className="stats-calendar"
          role="img"
          aria-label={tx('Days on, over and under target')}
        >
          {last30.map((d) => (
            <span key={d.date} className={`stats-day ${d.status}`} title={d.date} />
          ))}
        </div>
        <div className="stats-legend">
          <span className="stats-day on" /> {tx('on target')} <span className="stats-day over" />{' '}
          {tx('over')} <span className="stats-day under" /> {tx('under')}{' '}
          <span className="stats-day none" /> {tx('not logged')}
        </div>
        {s.water && (
          <p className="stats-note">
            {tx('Water: average {avg} L', { avg: (s.water.avg / 1000).toFixed(1) })}
            {t ? ' ' + tx('of {goal} L', { goal: (t.water / 1000).toFixed(1) }) : ''}{' '}
            {tx('· goal reached on {a} of {b} days', {
              a: s.water.daysReached,
              b: s.water.daysLogged,
            })}
          </p>
        )}
      </IonCardContent>
    </IonCard>
  );
}

function ActivityCard({ s }: { s: Stats }) {
  const t = useT();
  return (
    <IonCard className="stats-card">
      <IonCardHeader>
        <IonCardSubtitle>{t('Activity and workouts')}</IonCardSubtitle>
      </IonCardHeader>
      <IonCardContent>
        <h3 className="stats-h">{t('Calories eaten')}</h3>
        <BarChart
          points={s.eatenSeries}
          target={s.target?.kcal}
          label={t('Calories eaten per day')}
        />
        <h3 className="stats-h">
          {t('Calories burnt')}
          {s.burnEstimated ? t(' (partly estimated)') : ''}
        </h3>
        <BarChart points={s.burntSeries} label={t('Calories burnt per day')} color="secondary" />
        <div className="stats-rows">
          <div className="stats-row">
            <span>{t('Workout days')}</span>
            <strong>
              {s.workoutDays} ({s.workoutsPerWeek} {t('a week)')}
            </strong>
          </div>
          {s.avgSteps !== null && (
            <div className="stats-row">
              <span>{t('Average steps')}</span>
              <strong>{n(s.avgSteps)}</strong>
            </div>
          )}
          {s.watchDays > 0 && (
            <div className="stats-row">
              <span>{t('Days with watch data')}</span>
              <strong>{t('{a} of {b}', { a: s.watchDays, b: s.days })}</strong>
            </div>
          )}
        </div>
        {s.volumeSeries.some((v) => v.value) && (
          <>
            <h3 className="stats-h">{t('Weekly volume lifted (kg × reps)')}</h3>
            <BarChart points={s.volumeSeries} label={t('Weekly volume lifted')} />
          </>
        )}
      </IonCardContent>
    </IonCard>
  );
}
