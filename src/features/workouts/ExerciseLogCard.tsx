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

/**
 * One exercise in a workout: what to do, last time's numbers as a guide, today's sets and a
 * set logger. Used for plan days, self workouts and quick logs.
 */
export function ExerciseLogCard({
  slot: pe,
  target,
  today,
  logs,
  onLogged,
}: {
  slot: ExerciseSlot;
  target: LogTarget;
  today: string;
  /** All of this person's logs for this exercise. */
  logs: LogWithExercise[];
  onLogged: () => void;
}) {
  // Today's sets count only for this workout; "last time" uses every log of the exercise.
  const mine = (l: LogWithExercise) =>
    target.source === 'plan'
      ? l.source === 'plan'
      : l.source === 'self' && l.self_workout_id === target.selfWorkoutId;
  const { profile } = useAuth();
  const logSet = useLogSet(profile?.id);
  const deleteLog = useDeleteLog(profile?.id);
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
  const kgValue = kg || (guide?.weight_kg?.toString() ?? '');
  const repsValue = reps || (guide?.reps?.toString() ?? '');
  const minsValue = mins || (guide?.duration_min?.toString() ?? '');

  async function log() {
    const n = (v: string) => (v.trim() === '' ? NaN : Number(v.replace(',', '.')));
    const row = {
      performed_on: today,
      ...(target.source === 'plan'
        ? { source: 'plan' as const, plan_day_id: target.planDayId }
        : { source: 'self' as const, self_workout_id: target.selfWorkoutId }),
      exercise_id: pe.exercise_id,
      set_number: nextSetNumber,
      reps: type === 'timed' ? null : Math.round(n(repsValue)),
      weight_kg: type === 'weights' ? n(kgValue) : null,
      duration_min: type === 'timed' ? n(minsValue) : null,
    };
    const bad =
      (type !== 'timed' && !(row.reps! >= 0 && row.reps! <= 500)) ||
      (type === 'weights' && !(row.weight_kg! >= 0 && row.weight_kg! <= 1000)) ||
      (type === 'timed' && !(row.duration_min! > 0 && row.duration_min! <= 600));
    if (bad) {
      void toast({
        message:
          type === 'timed'
            ? 'Enter the minutes'
            : 'Enter the reps' + (type === 'weights' ? ' and kg' : ''),
        duration: 2000,
        color: 'warning',
        position: 'top',
      });
      return;
    }
    try {
      await logSet.mutateAsync(row);
      setKg('');
      setReps('');
      setMins('');
      onLogged();
    } catch {
      void toast({
        message: "Couldn't save the set – check your internet and try again.",
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
          {done && <IonIcon icon={checkmarkCircle} color="success" aria-label="Done" />}
        </IonCardTitle>
        <IonCardSubtitle>{prescription(pe)}</IonCardSubtitle>
      </IonCardHeader>
      <IonCardContent>
        {pe.notes && <p style={{ marginTop: 0 }}>{pe.notes}</p>}
        {(pe.exercises.cues || pe.exercises.demo_url) && (
          <div>
            {pe.exercises.cues && (
              <IonButton size="small" fill="clear" onClick={() => setShowCues((s) => !s)}>
                {showCues ? 'Hide tips' : 'How to do it'}
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
                Watch demo
              </IonButton>
            )}
            {showCues && <p className="workout-cues">{pe.exercises.cues}</p>}
          </div>
        )}
        {lastDate && (
          <p className="workout-muted">
            Last time ({formatDate(lastDate)}):{' '}
            {lastSets.map((s) => formatSet(s, type)).join(' · ')}
          </p>
        )}

        {todaySets.length > 0 && (
          <ul className="workout-sets">
            {todaySets.map((s) => (
              <li key={s.id}>
                <span>
                  Set {s.set_number}: <strong>{formatSet(s, type)}</strong>
                </span>
                <IonButton
                  fill="clear"
                  size="small"
                  color="medium"
                  aria-label={`Delete set ${s.set_number}`}
                  onClick={() => deleteLog.mutate(s.id)}
                >
                  <IonIcon icon={closeCircleOutline} />
                </IonButton>
              </li>
            ))}
          </ul>
        )}
        {done && <p className="workout-done">All {pe.sets} sets done – extra sets are fine too.</p>}

        <div className="workout-log-row">
          {type === 'weights' && (
            <IonInput
              fill="outline"
              label="kg"
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
              label="Reps"
              labelPlacement="stacked"
              type="number"
              inputmode="numeric"
              value={repsValue}
              onIonInput={(e) => setReps(String(e.detail.value ?? ''))}
            />
          ) : (
            <IonInput
              fill="outline"
              label="Minutes"
              labelPlacement="stacked"
              type="number"
              inputmode="decimal"
              value={minsValue}
              onIonInput={(e) => setMins(String(e.detail.value ?? ''))}
            />
          )}
          <IonButton disabled={logSet.isPending} onClick={() => void log()}>
            Log set {nextSetNumber}
          </IonButton>
        </div>
      </IonCardContent>
    </IonCard>
  );
}
