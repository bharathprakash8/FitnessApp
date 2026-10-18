import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonPage,
  IonSpinner,
  IonText,
  IonTitle,
  IonToolbar,
  useIonRouter,
} from '@ionic/react';
import { add } from 'ionicons/icons';
import { useState } from 'react';
import { useParams } from 'react-router-dom';

import { RefreshButton, SyncStatusBar } from '../../components/RefreshButton';
import { formatDate, todayIn } from '../../lib/dates';
import { useAuth } from '../auth/useAuth';
import { useExercises, useSelfWorkouts, useWorkoutLogs } from './api';
import { ExerciseLogCard } from './ExerciseLogCard';
import { ExercisePicker } from './ExercisePicker';
import type { Exercise, ExerciseSlot } from './model';
import { RestTimer } from './RestTimer';
import './workouts.css';

/** A quick-logged exercise has no saved prescription: suggest 3 sets with 60 s rest. */
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
 * Do one of your own saved workouts (/workouts/self/<id>), or log any library exercise
 * without a saved workout (/workouts/self/quick). Everything here is logged as "Self".
 */
export function SelfWorkoutPage() {
  const { id } = useParams<{ id: string }>();
  const quick = id === 'quick';
  const { profile } = useAuth();
  const workouts = useSelfWorkouts(profile?.id);
  const logs = useWorkoutLogs(profile?.id);
  const exercises = useExercises();
  const router = useIonRouter();
  const [rest, setRest] = useState<{ seconds: number; at: number } | null>(null);
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const today = todayIn(profile?.timezone);

  const workout = quick ? null : workouts.data?.find((w) => w.id === id);

  let slots: ExerciseSlot[] = [];
  if (workout) {
    slots = workout.self_workout_exercises;
  } else if (quick) {
    // Exercises quick-logged today, then the ones picked on this visit.
    const ids = [
      ...new Set([
        ...(logs.data ?? [])
          .filter((l) => l.performed_on === today && l.source === 'self' && !l.self_workout_id)
          .reverse()
          .map((l) => l.exercise_id),
        ...picked,
      ]),
    ];
    const byId = new Map((exercises.data ?? []).map((ex) => [ex.id, ex]));
    slots = ids.flatMap((exId) => {
      const ex = byId.get(exId);
      return ex ? [quickSlot(ex)] : [];
    });
  }

  const loading = workouts.isPending || logs.isPending || (quick && exercises.isPending);

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="primary">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/workouts" />
          </IonButtons>
          <IonTitle>{quick ? 'Quick log' : (workout?.name ?? 'My workout')}</IonTitle>
          <IonButtons slot="end">
            <RefreshButton />
            {workout && <IonButton routerLink={`/workouts/mine/${workout.id}`}>Edit</IonButton>}
          </IonButtons>
        </IonToolbar>
        <SyncStatusBar />
      </IonHeader>
      <IonContent className="ion-padding">
        <div className="workout-page">
          {loading ? (
            <div className="ion-text-center">
              <IonSpinner name="crescent" />
            </div>
          ) : !quick && !workout ? (
            <IonText color="medium">
              <p className="ion-text-center">This workout no longer exists.</p>
            </IonText>
          ) : (
            <>
              <p className="workout-muted" style={{ marginTop: 0 }}>
                {formatDate(today)} · logged as <span className="workout-self-tag">Self</span> ·
                sets are saved as you log them
              </p>
              {quick && slots.length === 0 && (
                <IonText color="medium">
                  <p>Pick an exercise from the library and log your sets.</p>
                </IonText>
              )}
              {slots.map((slot) => (
                <ExerciseLogCard
                  key={slot.id}
                  slot={slot}
                  target={{ source: 'self', selfWorkoutId: workout?.id ?? null }}
                  today={today}
                  logs={(logs.data ?? []).filter((l) => l.exercise_id === slot.exercise_id)}
                  onLogged={() =>
                    slot.rest_seconds && setRest({ seconds: slot.rest_seconds, at: Date.now() })
                  }
                />
              ))}
              {quick && (
                <IonButton expand="block" fill="outline" onClick={() => setPicking(true)}>
                  <IonIcon slot="start" icon={add} />
                  Add exercise
                </IonButton>
              )}
              <IonButton expand="block" onClick={() => router.push('/workouts', 'back')}>
                Finish workout
              </IonButton>
            </>
          )}
        </div>
        {quick && (
          <ExercisePicker
            isOpen={picking}
            trainerId={profile?.role === 'trainer' ? profile.id : undefined}
            onClose={() => setPicking(false)}
            onPick={(ex) => {
              setPicked((p) => (p.includes(ex.id) ? p : [...p, ex.id]));
              setPicking(false);
            }}
          />
        )}
      </IonContent>
      {rest && (
        <IonFooter>
          <RestTimer seconds={rest.seconds} startedAt={rest.at} onClose={() => setRest(null)} />
        </IonFooter>
      )}
    </IonPage>
  );
}
