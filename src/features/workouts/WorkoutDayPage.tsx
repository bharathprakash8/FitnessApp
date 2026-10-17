import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonInput,
  IonPage,
  IonSpinner,
  IonText,
  IonTitle,
  IonToolbar,
  useIonRouter,
  useIonToast,
} from '@ionic/react';
import { checkmarkCircle, closeCircleOutline } from 'ionicons/icons';
import { useState } from 'react';
import { useParams } from 'react-router-dom';

import { formatDate, todayIn } from '../../lib/dates';
import { useAuth } from '../auth/useAuth';
import { useActivePlan, useDeleteLog, useLogSet, useWorkoutLogs } from './api';
import {
  formatSet,
  prescription,
  type LogType,
  type LogWithExercise,
  type PlanExerciseFull,
} from './model';
import { RestTimer } from './RestTimer';
import './workouts.css';

/** Client: do one plan day – log each set, with last time's numbers as a guide. */
export function WorkoutDayPage() {
  const { dayId } = useParams<{ dayId: string }>();
  const { profile } = useAuth();
  const active = useActivePlan(profile?.id);
  const logs = useWorkoutLogs(profile?.id);
  const router = useIonRouter();
  const [rest, setRest] = useState<{ seconds: number; at: number } | null>(null);

  const day = active.data?.plan.plan_days.find((d) => d.id === dayId);
  const today = todayIn(profile?.timezone);

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="primary">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/workouts" />
          </IonButtons>
          <IonTitle>{day?.title ?? 'Workout'}</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        <div className="workout-page">
          {active.isPending || logs.isPending ? (
            <div className="ion-text-center">
              <IonSpinner name="crescent" />
            </div>
          ) : !day ? (
            <IonText color="medium">
              <p className="ion-text-center">This workout isn't in your current plan.</p>
            </IonText>
          ) : (
            <>
              <p className="workout-muted" style={{ marginTop: 0 }}>
                {formatDate(today)} · sets are saved as you log them
              </p>
              {day.plan_exercises.map((pe) => (
                <ExerciseCard
                  key={pe.id}
                  pe={pe}
                  dayId={day.id}
                  today={today}
                  logs={(logs.data ?? []).filter((l) => l.exercise_id === pe.exercise_id)}
                  onLogged={() =>
                    pe.rest_seconds && setRest({ seconds: pe.rest_seconds, at: Date.now() })
                  }
                />
              ))}
              <IonButton expand="block" onClick={() => router.push('/workouts', 'back')}>
                Finish workout
              </IonButton>
            </>
          )}
        </div>
      </IonContent>
      {rest && (
        <IonFooter>
          <RestTimer seconds={rest.seconds} startedAt={rest.at} onClose={() => setRest(null)} />
        </IonFooter>
      )}
    </IonPage>
  );
}

function ExerciseCard({
  pe,
  dayId,
  today,
  logs,
  onLogged,
}: {
  pe: PlanExerciseFull;
  dayId: string;
  today: string;
  logs: LogWithExercise[];
  onLogged: () => void;
}) {
  const { profile } = useAuth();
  const logSet = useLogSet(profile?.id);
  const deleteLog = useDeleteLog(profile?.id);
  const [toast] = useIonToast();
  const [showCues, setShowCues] = useState(false);
  const type = pe.exercises.log_type as LogType;

  const todaySets = logs
    .filter((l) => l.performed_on === today)
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
      plan_day_id: dayId,
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
