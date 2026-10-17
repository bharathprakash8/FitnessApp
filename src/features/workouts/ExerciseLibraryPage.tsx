import {
  IonBackButton,
  IonBadge,
  IonButton,
  IonButtons,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonPage,
  IonSearchbar,
  IonSegment,
  IonSegmentButton,
  IonSpinner,
  IonText,
  IonTitle,
  IonToolbar,
  useIonAlert,
  useIonToast,
} from '@ionic/react';
import { add } from 'ionicons/icons';
import { useState } from 'react';

import { useAuth } from '../auth/useAuth';
import { useArchiveExercise, useExercises, useSaveExercise } from './api';
import { ExerciseForm, type ExerciseInput } from './ExerciseForm';
import type { Exercise } from './model';
import './workouts.css';

type Filter = 'all' | 'mine' | 'shared';

/**
 * Exercise library. Trainers see shared + their own and edit only their own.
 * Admins see everything and edit the shared library.
 */
export function ExerciseLibraryPage() {
  const { profile } = useAuth();
  const exercises = useExercises();
  const save = useSaveExercise();
  const archive = useArchiveExercise();
  const [alert] = useIonAlert();
  const [toast] = useIonToast();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<Exercise | 'new' | null>(null);

  const isAdmin = profile?.role === 'admin';
  const canEdit = (ex: Exercise) =>
    isAdmin ? ex.trainer_id === null : ex.trainer_id === profile?.id;

  const term = search.trim().toLowerCase();
  const shown = (exercises.data ?? []).filter(
    (ex) =>
      (filter === 'all' ||
        (filter === 'shared' ? ex.trainer_id === null : ex.trainer_id === profile?.id)) &&
      (!term ||
        [ex.name, ex.muscle_group, ex.equipment].some((v) => v?.toLowerCase().includes(term))),
  );

  async function submit(input: ExerciseInput) {
    if (!profile) return;
    try {
      if (editing === 'new') {
        // Admins add to the shared library; trainers add their own.
        await save.mutateAsync({ ...input, trainer_id: isAdmin ? null : profile.id });
      } else if (editing) {
        await save.mutateAsync({ ...input, id: editing.id });
      }
      setEditing(null);
      void toast({ message: 'Exercise saved', duration: 1500, position: 'top' });
    } catch {
      void toast({ message: 'Could not save', duration: 2500, color: 'danger', position: 'top' });
    }
  }

  function remove(ex: Exercise) {
    void alert({
      header: 'Remove exercise?',
      message: `${ex.name} will be hidden from the library. Plans and logs that already use it keep it.`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Remove',
          role: 'destructive',
          handler: () => {
            archive.mutate(ex.id, {
              onSuccess: () => setEditing(null),
            });
          },
        },
      ],
    });
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="primary">
          <IonButtons slot="start">
            <IonBackButton defaultHref={isAdmin ? '/admin' : '/trainer/plans'} />
          </IonButtons>
          <IonTitle>Exercise library</IonTitle>
        </IonToolbar>
        <IonToolbar>
          <IonSearchbar
            value={search}
            onIonInput={(e) => setSearch(String(e.detail.value ?? ''))}
            placeholder="Search exercises"
            debounce={150}
          />
        </IonToolbar>
        {!isAdmin && (
          <IonToolbar>
            <IonSegment value={filter} onIonChange={(e) => setFilter(e.detail.value as Filter)}>
              <IonSegmentButton value="all">
                <IonLabel>All</IonLabel>
              </IonSegmentButton>
              <IonSegmentButton value="mine">
                <IonLabel>Mine</IonLabel>
              </IonSegmentButton>
              <IonSegmentButton value="shared">
                <IonLabel>Shared</IonLabel>
              </IonSegmentButton>
            </IonSegment>
          </IonToolbar>
        )}
      </IonHeader>
      <IonContent>
        {exercises.isPending ? (
          <div className="ion-padding ion-text-center">
            <IonSpinner name="crescent" />
          </div>
        ) : shown.length === 0 ? (
          <IonText color="medium">
            <p className="ion-padding ion-text-center">No exercises match.</p>
          </IonText>
        ) : (
          <IonList>
            {shown.map((ex) => (
              <IonItem key={ex.id} button detail onClick={() => setEditing(ex)}>
                <IonLabel>
                  <h2>{ex.name}</h2>
                  <p>{[ex.muscle_group, ex.equipment].filter(Boolean).join(' · ')}</p>
                </IonLabel>
                {ex.trainer_id !== null && (
                  <IonBadge slot="end" color={ex.trainer_id === profile?.id ? 'primary' : 'medium'}>
                    {ex.trainer_id === profile?.id ? 'Mine' : 'Trainer'}
                  </IonBadge>
                )}
              </IonItem>
            ))}
          </IonList>
        )}
        <IonFab slot="fixed" vertical="bottom" horizontal="end">
          <IonFabButton onClick={() => setEditing('new')} aria-label="Add exercise">
            <IonIcon icon={add} />
          </IonFabButton>
        </IonFab>

        <IonModal isOpen={editing !== null} onDidDismiss={() => setEditing(null)}>
          <IonHeader>
            <IonToolbar>
              <IonTitle>
                {editing === 'new' ? 'New exercise' : editing ? editing.name : ''}
              </IonTitle>
              <IonButtons slot="end">
                <IonButton onClick={() => setEditing(null)}>Close</IonButton>
              </IonButtons>
            </IonToolbar>
          </IonHeader>
          <IonContent className="ion-padding">
            {editing === 'new' || (editing && canEdit(editing)) ? (
              <>
                <ExerciseForm
                  key={editing === 'new' ? 'new' : editing.id}
                  exercise={editing === 'new' ? undefined : editing}
                  busy={save.isPending}
                  onSubmit={(input) => void submit(input)}
                />
                {editing !== 'new' && (
                  <IonButton
                    expand="block"
                    fill="clear"
                    color="danger"
                    style={{ marginTop: 12 }}
                    onClick={() => remove(editing)}
                  >
                    Remove from library
                  </IonButton>
                )}
              </>
            ) : editing ? (
              <ExerciseDetails exercise={editing} />
            ) : null}
          </IonContent>
        </IonModal>
      </IonContent>
    </IonPage>
  );
}

/** Read-only view (shared exercises for trainers). */
export function ExerciseDetails({ exercise }: { exercise: Exercise }) {
  return (
    <div className="workout-page">
      <p className="workout-muted">
        {[exercise.muscle_group, exercise.equipment].filter(Boolean).join(' · ')}
      </p>
      {exercise.cues && <p className="workout-cues">{exercise.cues}</p>}
      {exercise.demo_url && (
        <IonButton fill="outline" href={exercise.demo_url} target="_blank" rel="noopener">
          Watch demo
        </IonButton>
      )}
      {exercise.trainer_id === null && (
        <p className="workout-muted">Shared library exercise – the admin can edit it.</p>
      )}
    </div>
  );
}
