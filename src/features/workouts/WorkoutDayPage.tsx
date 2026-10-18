import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonPage,
  IonSpinner,
  IonText,
  IonTitle,
  IonToolbar,
  useIonRouter,
} from '@ionic/react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';

import { RefreshButton, SyncStatusBar } from '../../components/RefreshButton';
import { formatDate, todayIn } from '../../lib/dates';
import { useAuth } from '../auth/useAuth';
import { useActivePlan, useWorkoutLogs } from './api';
import { ExerciseLogCard } from './ExerciseLogCard';
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
          <IonButtons slot="end">
            <RefreshButton />
          </IonButtons>
        </IonToolbar>
        <SyncStatusBar />
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
                <ExerciseLogCard
                  key={pe.id}
                  slot={pe}
                  target={{ source: 'plan', planDayId: day.id }}
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
