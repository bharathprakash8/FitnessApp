import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonPage,
  IonSpinner,
  IonText,
  IonTitle,
  IonToolbar,
  useIonAlert,
  useIonRouter,
  useIonToast,
} from '@ionic/react';
import { add, arrowDown, arrowUp } from 'ionicons/icons';
import { useState } from 'react';
import { useParams } from 'react-router-dom';

import { RefreshButton, SyncStatusBar } from '../../components/RefreshButton';
import { useAuth } from '../auth/useAuth';
import { selfWorkoutApi, useSelfWorkoutMutation, useSelfWorkouts } from './api';
import { ExercisePicker } from './ExercisePicker';
import { prescription, type SelfWorkoutExerciseFull, type SelfWorkoutFull } from './model';
import { PlanExerciseEditor, type PlanExerciseFields } from './PlanExerciseEditor';
import './workouts.css';

/** Build or change one of your own saved workouts. */
export function MyWorkoutEditorPage() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const workouts = useSelfWorkouts(profile?.id);
  const workout = workouts.data?.find((w) => w.id === id);

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="primary">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/workouts" />
          </IonButtons>
          <IonTitle>{workout?.name ?? 'My workout'}</IonTitle>
          <IonButtons slot="end">
            <RefreshButton />
          </IonButtons>
        </IonToolbar>
        <SyncStatusBar />
      </IonHeader>
      <IonContent className="ion-padding">
        <div className="workout-page">
          {workouts.isPending ? (
            <div className="ion-text-center">
              <IonSpinner name="crescent" />
            </div>
          ) : !workout ? (
            <IonText color="medium">
              <p className="ion-text-center">This workout no longer exists.</p>
            </IonText>
          ) : (
            <Editor workout={workout} />
          )}
        </div>
      </IonContent>
    </IonPage>
  );
}

function Editor({ workout }: { workout: SelfWorkoutFull }) {
  const { profile } = useAuth();
  const router = useIonRouter();
  const [alert] = useIonAlert();
  const [toast] = useIonToast();
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState<SelfWorkoutExerciseFull | null>(null);

  const mutate = useSelfWorkoutMutation(profile?.id, (fn: () => Promise<void>) => fn());
  const run = (fn: () => Promise<void>, after?: () => void) =>
    mutate.mutate(fn, {
      onSuccess: after,
      onError: () =>
        void toast({ message: 'Could not save. Try again.', duration: 2500, color: 'danger' }),
    });

  const list = workout.self_workout_exercises;

  function rename() {
    void alert({
      header: 'Rename workout',
      inputs: [{ name: 'v', value: workout.name, attributes: { maxlength: 60 } }],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Save',
          handler: (data: { v?: string }) => {
            const v = (data.v ?? '').trim();
            if (!v) return false;
            run(() => selfWorkoutApi.rename(workout.id, v));
            return true;
          },
        },
      ],
    });
  }

  function remove() {
    void alert({
      header: 'Delete this workout?',
      message: 'Sets you already logged stay in your history.',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Delete',
          role: 'destructive',
          handler: () =>
            run(
              () => selfWorkoutApi.remove(workout.id),
              () => router.push('/workouts', 'back'),
            ),
        },
      ],
    });
  }

  function move(i: number, dir: -1 | 1) {
    const a = list[i];
    if (!a || !list[i + dir]) return;
    const order = list.map((x) => x.id);
    order.splice(i, 1);
    order.splice(i + dir, 0, a.id);
    run(async () => {
      for (const [idx, rowId] of order.entries()) {
        await selfWorkoutApi.updateExercise(rowId, { sort_order: idx });
      }
    });
  }

  return (
    <>
      <IonButton
        expand="block"
        routerLink={`/workouts/self/${workout.id}`}
        disabled={list.length === 0}
      >
        Start this workout
      </IonButton>

      <IonList inset style={{ margin: '16px 0' }}>
        {list.length === 0 && (
          <IonItem lines="none">
            <IonLabel color="medium">No exercises yet – add a few below.</IonLabel>
          </IonItem>
        )}
        {list.map((row, i) => (
          <IonItem key={row.id}>
            <IonLabel
              onClick={() => setEditing(row)}
              style={{ cursor: 'pointer' }}
              aria-label={`Edit ${row.exercises.name}`}
            >
              <h3>{row.exercises.name}</h3>
              <p>{prescription(row)}</p>
            </IonLabel>
            <IonButtons slot="end">
              <IonButton
                aria-label="Move up"
                disabled={i === 0 || mutate.isPending}
                onClick={() => move(i, -1)}
              >
                <IonIcon icon={arrowUp} />
              </IonButton>
              <IonButton
                aria-label="Move down"
                disabled={i === list.length - 1 || mutate.isPending}
                onClick={() => move(i, 1)}
              >
                <IonIcon icon={arrowDown} />
              </IonButton>
            </IonButtons>
          </IonItem>
        ))}
      </IonList>
      <p className="workout-muted">Tap an exercise to change sets, reps or rest.</p>

      <IonButton expand="block" fill="outline" onClick={() => setPicking(true)}>
        <IonIcon slot="start" icon={add} />
        Add exercise
      </IonButton>
      <IonButton expand="block" fill="clear" onClick={rename}>
        Rename
      </IonButton>
      <IonButton expand="block" fill="clear" color="danger" onClick={remove}>
        Delete workout
      </IonButton>

      <ExercisePicker
        isOpen={picking}
        trainerId={profile?.role === 'trainer' ? profile.id : undefined}
        onClose={() => setPicking(false)}
        onPick={(ex) =>
          run(
            () =>
              selfWorkoutApi.addExercise({
                self_workout_id: workout.id,
                exercise_id: ex.id,
                sort_order: list.length,
                sets: 3,
                reps: ex.log_type === 'timed' ? null : '10',
                rest_seconds: 60,
              }),
            () => setPicking(false),
          )
        }
      />
      <PlanExerciseEditor
        item={editing}
        forSelf
        busy={mutate.isPending}
        onClose={() => setEditing(null)}
        onSave={(fields: PlanExerciseFields) => {
          const row = editing;
          if (row)
            run(
              () => selfWorkoutApi.updateExercise(row.id, fields),
              () => setEditing(null),
            );
        }}
        onRemove={() => {
          const row = editing;
          if (row)
            run(
              () => selfWorkoutApi.removeExercise(row.id),
              () => setEditing(null),
            );
        }}
      />
    </>
  );
}
