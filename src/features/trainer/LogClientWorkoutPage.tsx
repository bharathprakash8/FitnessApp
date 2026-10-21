import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonLabel,
  IonPage,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonText,
  IonTitle,
  IonToolbar,
  useIonRouter,
} from '@ionic/react';
import { useQueryClient } from '@tanstack/react-query';
import { add } from 'ionicons/icons';
import { useState } from 'react';
import { useParams } from 'react-router-dom';

import { RefreshButton, SyncStatusBar } from '../../components/RefreshButton';
import { formatDate } from '../../lib/dates';
import { useAuth } from '../auth/useAuth';
import { useProfileById } from '../profile/api';
import { useActivePlan, useExercises, useWorkoutLogs } from '../workouts/api';
import { ExerciseLogCard } from '../workouts/ExerciseLogCard';
import { ExercisePicker } from '../workouts/ExercisePicker';
import type { Exercise, ExerciseSlot } from '../workouts/model';
import { cachedClient } from './api';
import './trainer.css';

const OTHER = 'other';

/** "2026-10-21T18:30" in the browser's own time, for <input type="datetime-local">. */
function localInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const isFuture = (d: Date) => d.getTime() > Date.now() + 5 * 60000;

const quickSlot = (ex: Exercise): ExerciseSlot => ({
  id: ex.id,
  exercise_id: ex.id,
  sets: 3,
  reps: null,
  rest_seconds: 60,
  notes: null,
  exercises: ex,
});

/**
 * Trainer → client → Workouts → "Log a workout": the trainer logs sets for the client
 * (e.g. an in-person session, or a client without a watch). Sets show as "Logged by trainer";
 * only the trainer can change or delete them. The time is used to avoid double counting
 * with the client's watch.
 */
export function LogClientWorkoutPage() {
  const { id } = useParams<{ id: string }>();
  const { profile: me } = useAuth();
  const qc = useQueryClient();
  const router = useIonRouter();
  const client = useProfileById(id, cachedClient(qc, me?.id, id));
  const active = useActivePlan(id);
  const logs = useWorkoutLogs(id);
  const exercises = useExercises();
  const [when, setWhen] = useState(() => localInputValue(new Date()));
  const [dayId, setDayId] = useState<string>();
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);

  const tz = client.data?.timezone ?? 'Asia/Kolkata';
  const startedAt = new Date(when);
  const validTime = !Number.isNaN(startedAt.getTime());
  const day = validTime ? new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(startedAt) : '';
  const planDays = active.data?.plan.plan_days ?? [];
  const choice = dayId ?? planDays[0]?.id ?? OTHER;
  const planDay = planDays.find((d) => d.id === choice);

  const slots = planDay ? planDay.plan_exercises : otherSlots();

  // Exercises the trainer logged outside the plan that day, then the ones picked now.
  function otherSlots(): ExerciseSlot[] {
    const ids = [
      ...new Set([
        ...(logs.data ?? [])
          .filter((l) => l.performed_on === day && l.source === 'trainer')
          .reverse()
          .map((l) => l.exercise_id),
        ...picked,
      ]),
    ];
    const byId = new Map((exercises.data ?? []).map((ex) => [ex.id, ex]));
    return ids.flatMap((exId) => {
      const ex = byId.get(exId);
      return ex ? [quickSlot(ex)] : [];
    });
  }

  const loading = client.isPending || active.isPending || logs.isPending || exercises.isPending;
  const name = client.data?.full_name || client.data?.email || 'client';
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="primary">
          <IonButtons slot="start">
            <IonBackButton defaultHref={`/trainer/clients/${id}`} />
          </IonButtons>
          <IonTitle>Log workout</IonTitle>
          <IonButtons slot="end">
            <RefreshButton />
          </IonButtons>
        </IonToolbar>
        <SyncStatusBar />
      </IonHeader>
      <IonContent className="ion-padding">
        {loading ? (
          <div className="ion-text-center">
            <IonSpinner name="crescent" />
          </div>
        ) : (
          <>
            <IonCard className="trainer-card">
              <IonCardContent>
                <p className="trainer-note" style={{ marginTop: 0 }}>
                  For <strong>{name}</strong>. Shown to them as “Logged by trainer”.
                </p>
                <IonInput
                  fill="outline"
                  type="datetime-local"
                  label="When did the workout start?"
                  labelPlacement="stacked"
                  value={when}
                  max={localInputValue(new Date())}
                  onIonInput={(e) => setWhen(String(e.detail.value ?? ''))}
                />
                {validTime && (
                  <p className="trainer-note">
                    Counts for {formatDate(day, tz)}
                    {browserTz !== tz ? ` (their time zone, ${tz})` : ''}. If they wore a watch
                    then, the watch’s calories are used and this isn’t counted twice.
                  </p>
                )}
                <IonSegment
                  value={choice === OTHER ? OTHER : 'plan'}
                  onIonChange={(e) => setDayId(e.detail.value === OTHER ? OTHER : planDays[0]?.id)}
                  style={{ marginTop: 8 }}
                >
                  <IonSegmentButton value="plan" disabled={planDays.length === 0}>
                    <IonLabel>Their plan</IonLabel>
                  </IonSegmentButton>
                  <IonSegmentButton value={OTHER}>
                    <IonLabel>Other</IonLabel>
                  </IonSegmentButton>
                </IonSegment>
                {planDay && (
                  <IonSelect
                    fill="outline"
                    label="Plan day"
                    labelPlacement="stacked"
                    interface="action-sheet"
                    value={choice}
                    onIonChange={(e) => setDayId(String(e.detail.value))}
                    style={{ marginTop: 12 }}
                  >
                    {planDays.map((d) => (
                      <IonSelectOption key={d.id} value={d.id}>
                        Day {d.day_index}: {d.title}
                      </IonSelectOption>
                    ))}
                  </IonSelect>
                )}
              </IonCardContent>
            </IonCard>

            {!validTime || isFuture(startedAt) ? (
              <IonText color="warning">
                <p>Pick a time that isn’t in the future.</p>
              </IonText>
            ) : (
              <>
                {!planDay && slots.length === 0 && (
                  <IonText color="medium">
                    <p>Add the exercises they did and log the sets.</p>
                  </IonText>
                )}
                {slots.map((slot) => (
                  <ExerciseLogCard
                    key={`${day}:${slot.id}`}
                    slot={slot}
                    target={
                      planDay ? { source: 'plan', planDayId: planDay.id } : { source: 'trainer' }
                    }
                    today={day}
                    clientId={id}
                    startedAt={startedAt}
                    logs={(logs.data ?? []).filter((l) => l.exercise_id === slot.exercise_id)}
                    onLogged={() => undefined}
                  />
                ))}
                {!planDay && (
                  <IonButton expand="block" fill="outline" onClick={() => setPicking(true)}>
                    <IonIcon slot="start" icon={add} />
                    Add exercise
                  </IonButton>
                )}
                <IonButton expand="block" onClick={() => router.goBack()}>
                  Done
                </IonButton>
              </>
            )}
          </>
        )}
        <ExercisePicker
          isOpen={picking}
          trainerId={me?.id}
          onClose={() => setPicking(false)}
          onPick={(ex) => {
            setPicked((p) => (p.includes(ex.id) ? p : [...p, ex.id]));
            setPicking(false);
          }}
        />
      </IonContent>
    </IonPage>
  );
}
