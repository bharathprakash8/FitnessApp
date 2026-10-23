import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonSearchbar,
  IonTitle,
  IonToolbar,
} from '@ionic/react';
import { useState } from 'react';

import { useExercises } from './api';
import type { Exercise } from './model';
import { useT } from '../../i18n/i18n';

/** Modal list of exercises to add to a plan day. */
export function ExercisePicker({
  isOpen,
  trainerId,
  onPick,
  onClose,
}: {
  isOpen: boolean;
  /**
   * Only shared exercises and this trainer's own can go into their plans. Leave it out for
   * a client: they only see the shared library and their trainer's exercises anyway.
   */
  trainerId?: string;
  onPick: (exercise: Exercise) => void;
  onClose: () => void;
}) {
  const t = useT();
  const exercises = useExercises();
  const [search, setSearch] = useState('');
  const term = search.trim().toLowerCase();
  const shown = (exercises.data ?? []).filter(
    (ex) =>
      (!trainerId || ex.trainer_id === null || ex.trainer_id === trainerId) &&
      (!term ||
        [ex.name, ex.muscle_group, ex.equipment].some((v) => v?.toLowerCase().includes(term))),
  );

  return (
    <IonModal isOpen={isOpen} onDidDismiss={onClose}>
      <IonHeader>
        <IonToolbar>
          <IonTitle>{t('Add exercise')}</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={onClose}>{t('Close')}</IonButton>
          </IonButtons>
        </IonToolbar>
        <IonToolbar>
          <IonSearchbar
            value={search}
            onIonInput={(e) => setSearch(String(e.detail.value ?? ''))}
            placeholder={t('Search exercises')}
            debounce={100}
          />
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <IonList>
          {shown.map((ex) => (
            <IonItem key={ex.id} button onClick={() => onPick(ex)}>
              <IonLabel>
                <h2>{ex.name}</h2>
                <p>{[ex.muscle_group, ex.equipment].filter(Boolean).join(' · ')}</p>
              </IonLabel>
            </IonItem>
          ))}
        </IonList>
      </IonContent>
    </IonModal>
  );
}
