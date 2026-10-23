import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonIcon,
  IonInput,
  useIonToast,
} from '@ionic/react';
import { checkmarkCircle, closeCircleOutline } from 'ionicons/icons';
import { useState } from 'react';

import { formatDate } from '../../lib/dates';
import { useAuth } from '../auth/useAuth';
import { useDeleteLog, useLogSet } from './api';
import {
  formatSet,
  prescription,
  type ExerciseSlot,
  type LogTarget,
  type LogType,
  type LogWithExercise,
} from './model';
import './workouts.css';
import { useT } from '../../i18n/i18n';

/**
 * One exercise in a workout: what to do, last time's numbers as a guide, today's sets and a
 * set logger. Used for plan days, self workouts and quick logs – by the client, or by their
 * trainer for them (clientId + startedAt).
 */
export function ExerciseLogCard({
  slot: pe,
  target,
  today,
  logs,
  onLogged,
  clientId,
  startedAt,
}: {
  slot: ExerciseSlot;
  target: LogTarget;
  /** The day the sets belong to (the client's local date). */
  today: string;
  /** Whose workout this is (default: the signed-in person). */
  clientId?: string;
  /** When the workout was done, if not now (trainer logging afterwards). */
  startedAt?: Date;
  /** All of this person's logs for this exercise. */
  logs: LogWithExercise[];
  onLogged: () => void;
}) {
  const t = useT();
  // Today's sets count only for this workout; "last time" uses every log of the exercise.
  const mine = (l: LogWithExercise) =>
    target.source === 'self'
      ? l.source === 'self' && l.self_workout_id === target.selfWorkoutId
      : l.source === target.source;
  const { profile } = useAuth();
  const owner = clientId ?? profile?.id;
  const logSet = useLogSet(owner);
  const deleteLog = useDeleteLog(owner);
  // Each person can remove only the sets they logged (sets waiting offline have no logger yet).
  const canDelete = (l: LogWithExercise) =>
    'offline' in l || (l.logged_by ?? l.client_id) === profile?.id;
  const [toast] = useIonToast();
  const [showCues, setShowCues] = useState(false);
  const type = pe.exercises.log_type as LogType;

  const todaySets = logs
    .filter((l) => l.performed_on === today && mine(l))
    .sort((a, b) => a.set_number - b.set_number);
  const lastDate = logs.find((l) => l.performed_on < today)?.performed_on;
  const lastSets = lastDate
    ? logs.filter((l) => l.performed_on === lastDate).sort((a, b) => a.set_number - b.set_number)
    : [];
  const nextSetNumber = (todaySets[todaySets.length - 1]?.set_number ?? 0) + 1;
  const done = todaySets.length >= pe.sets;

  // Suggest the previous set today, or the same set last time.
  const guide = todaySets[todaySets.length - 1] ?? lastSets[nextSetNumber - 1] ?? lastSets[0];
  const [kg, setKg] = useState('');
  const [reps, setReps] = useState('');
  const [mins, setMins] = useState('');
  const [machineKcal, setMachineKcal] = useState('');
  const kgValue = kg || (guide?.weight_kg?.toString() ?? '');
  const repsValue = reps || (guide?.reps?.toString() ?? '');
  const minsValue = mins || (guide?.duration_min?.toString() ?? '');

  async function log() {
    const n = (v: string) => (v.trim() === '' ? NaN : Number(v.replace(',', '.')));
    const minutes = type === 'timed' ? n(minsValue) : 0;
    // Saved as the time the set ended – used to check whether a watch was worn then.
    const performedAt = startedAt
      ? new Date(startedAt.getTime() + (Number.isFinite(minutes) ? minutes : 0) * 60000)
      : new Date();
    const kcal = machineKcal.trim() === '' ? null : Math.round(n(machineKcal));
    const row = {
      performed_on: today,
      performed_at: performedAt.toISOString(),
      machine_kcal: type === 'timed' ? kcal : null,
      ...(target.source === 'plan'
        ? { source: 'plan' as const, plan_day_id: target.planDayId }
        : target.source === 'self'
          ? { source: 'self' as const, self_workout_id: target.selfWorkoutId }
          : { source: 'trainer' as const }),
      exercise_id: pe.exercise_id,
      set_number: nextSetNumber,
      reps: type === 'timed' ? null : Math.round(n(repsValue)),
      weight_kg: type === 'weights' ? n(kgValue) : null,
      duration_min: type === 'timed' ? n(minsValue) : null,
    };
    const bad =
      (type !== 'timed' && !(row.reps! >= 0 && row.reps! <= 500)) ||
      (type === 'weights' && !(row.weight_kg! >= 0 && row.weight_kg! <= 1000)) ||
      (type === 'timed' && !(row.duration_min! > 0 && row.duration_min! <= 600)) ||
      (row.machine_kcal !== null && !(row.machine_kcal >= 0 && row.machine_kcal <= 3000));
    if (bad) {
      void toast({
        message:
          type === 'timed'
            ? 'Enter the minutes (and machine kcal 0–3,000 if you add it)'
            : 'Enter the reps' + (type === 'weights' ? ' and kg' : ''),
        duration: 2000,
        color: 'warning',
        position: 'top',
      });
      return;
    }
    try {
      const result = await logSet.mutateAsync({ row, exercise: pe.exercises });
      if (result === 'offline') {
        void toast({
          message: t('Saved offline – will sync when you’re back online'),
          duration: 2500,
          position: 'top',
        });
      }
      setKg('');
      setReps('');
      setMins('');
      setMachineKcal('');
      onLogged();
    } catch {
      void toast({
        message: t("Couldn't save the set – check your internet and try again."),
        duration: 3000,
        color: 'danger',
        position: 'top',
      });
    }
  }

  return (
    <IonCard className="workout-card">
      <IonCardHeader>
        <IonCardTitle>
          {pe.exercises.name}{' '}
          {done && <IonIcon icon={checkmarkCircle} color="success" aria-label={t('Done')} />}
        </IonCardTitle>
        <IonCardSubtitle>{prescription(pe)}</IonCardSubtitle>
      </IonCardHeader>
      <IonCardContent>
        {pe.notes && <p style={{ marginTop: 0 }}>{pe.notes}</p>}
        {(pe.exercises.cues || pe.exercises.demo_url) && (
          <div>
            {pe.exercises.cues && (
              <IonButton size="small" fill="clear" onClick={() => setShowCues((s) => !s)}>
                {showCues ? t('Hide tips') : t('How to do it')}
              </IonButton>
            )}
            {pe.exercises.demo_url && (
              <IonButton
                size="small"
                fill="clear"
                href={pe.exercises.demo_url}
                target="_blank"
                rel="noopener"
              >
                {t('Watch demo')}
              </IonButton>
            )}
            {showCues && <p className="workout-cues">{pe.exercises.cues}</p>}
          </div>
        )}
        {lastDate && (
          <p className="workout-muted">
            {t('Last time (')}
            {formatDate(lastDate)}): {lastSets.map((s) => formatSet(s, type)).join(' · ')}
          </p>
        )}

        {todaySets.length > 0 && (
          <ul className="workout-sets">
            {todaySets.map((s) => (
              <li key={s.id}>
                <span>
                  {t('Set')} {s.set_number}: <strong>{formatSet(s, type)}</strong>
                  {s.logged_by && s.logged_by !== s.client_id && owner === profile?.id && (
                    <span className="workout-muted"> {t('· by trainer')}</span>
                  )}
                  {'offline' in s && <span className="offline-badge"> {t('waiting to sync')}</span>}
                </span>
                {canDelete(s) && (
                  <IonButton
                    fill="clear"
                    size="small"
                    color="medium"
                    aria-label={`Delete set ${s.set_number}`}
                    onClick={() => deleteLog.mutate(s.id)}
                  >
                    <IonIcon icon={closeCircleOutline} />
                  </IonButton>
                )}
              </li>
            ))}
          </ul>
        )}
        {done && (
          <p className="workout-done">
            {t('All')} {pe.sets} {t('sets done – extra sets are fine too.')}
          </p>
        )}

        <div className="workout-log-row">
          {type === 'weights' && (
            <IonInput
              fill="outline"
              label={t('kg')}
              labelPlacement="stacked"
              type="number"
              inputmode="decimal"
              value={kgValue}
              onIonInput={(e) => setKg(String(e.detail.value ?? ''))}
            />
          )}
          {type !== 'timed' ? (
            <IonInput
              fill="outline"
              label={t('Reps')}
              labelPlacement="stacked"
              type="number"
              inputmode="numeric"
              value={repsValue}
              onIonInput={(e) => setReps(String(e.detail.value ?? ''))}
            />
          ) : (
            <IonInput
              fill="outline"
              label={t('Minutes')}
              labelPlacement="stacked"
              type="number"
              inputmode="decimal"
              value={minsValue}
              onIonInput={(e) => setMins(String(e.detail.value ?? ''))}
            />
          )}
          <IonButton disabled={logSet.isPending} onClick={() => void log()}>
            {t('Log set')} {nextSetNumber}
          </IonButton>
        </div>
        {type === 'timed' && (
          <IonInput
            className="workout-machine-kcal"
            fill="outline"
            label={t('Machine kcal (optional)')}
            labelPlacement="stacked"
            type="number"
            inputmode="numeric"
            placeholder={t('From the machine or app')}
            value={machineKcal}
            onIonInput={(e) => setMachineKcal(String(e.detail.value ?? ''))}
          />
        )}
      </IonCardContent>
    </IonCard>
  );
}
