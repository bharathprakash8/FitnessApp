import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonInput,
  IonModal,
  IonText,
  IonTextarea,
  IonTitle,
  IonToolbar,
} from '@ionic/react';
import { useState } from 'react';

import type { ExerciseSlot } from './model';
import { useT } from '../../i18n/i18n';

export interface PlanExerciseFields {
  sets: number;
  reps: string | null;
  rest_seconds: number;
  notes: string | null;
}

/** Edit sets / reps / rest / notes for one exercise in a plan day (or a self workout). */
export function PlanExerciseEditor({
  item,
  busy,
  onSave,
  onRemove,
  onClose,
  forSelf = false,
}: {
  item: ExerciseSlot | null;
  /** Wording for a person's own workout instead of a trainer's plan. */
  forSelf?: boolean;
  busy: boolean;
  onSave: (fields: PlanExerciseFields) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <IonModal isOpen={item !== null} onDidDismiss={onClose}>
      <IonHeader>
        <IonToolbar>
          <IonTitle>{item?.exercises.name}</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={onClose}>{t('Close')}</IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        {item && (
          <Fields
            key={item.id}
            item={item}
            busy={busy}
            forSelf={forSelf}
            onSave={onSave}
            onRemove={onRemove}
          />
        )}
      </IonContent>
    </IonModal>
  );
}

function Fields({
  item,
  busy,
  forSelf,
  onSave,
  onRemove,
}: {
  item: ExerciseSlot;
  busy: boolean;
  forSelf: boolean;
  onSave: (fields: PlanExerciseFields) => void;
  onRemove: () => void;
}) {
  const t = useT();
  const timed = item.exercises.log_type === 'timed';
  const [sets, setSets] = useState(String(item.sets));
  const [reps, setReps] = useState(item.reps ?? '');
  const [rest, setRest] = useState(String(item.rest_seconds));
  const [notes, setNotes] = useState(item.notes ?? '');
  const [error, setError] = useState<string | null>(null);

  function save() {
    const s = Number(sets);
    const r = Number(rest);
    if (!Number.isInteger(s) || s < 1 || s > 20) return setError('Sets must be 1–20.');
    if (!Number.isInteger(r) || r < 0 || r > 600) return setError('Rest must be 0–600 seconds.');
    setError(null);
    onSave({ sets: s, reps: reps.trim() || null, rest_seconds: r, notes: notes.trim() || null });
  }

  return (
    <div className="workout-form">
      <div className="workout-row">
        <IonInput
          fill="outline"
          label={t('Sets')}
          labelPlacement="floating"
          type="number"
          inputmode="numeric"
          value={sets}
          onIonInput={(e) => setSets(String(e.detail.value ?? ''))}
        />
        <IonInput
          fill="outline"
          label={timed ? t('Time per set') : t('Reps')}
          labelPlacement="floating"
          placeholder={timed ? 'e.g. 30 s' : 'e.g. 8-10'}
          maxlength={20}
          value={reps}
          onIonInput={(e) => setReps(String(e.detail.value ?? ''))}
        />
        <IonInput
          fill="outline"
          label={t('Rest (s)')}
          labelPlacement="floating"
          type="number"
          inputmode="numeric"
          value={rest}
          onIonInput={(e) => setRest(String(e.detail.value ?? ''))}
        />
      </div>
      <IonTextarea
        fill="outline"
        label={forSelf ? t('Notes (optional)') : t('Notes for the client (optional)')}
        labelPlacement="floating"
        autoGrow
        maxlength={500}
        value={notes}
        onIonInput={(e) => setNotes(String(e.detail.value ?? ''))}
      />
      {error && (
        <IonText color="danger" role="alert">
          <p className="workout-note">{error}</p>
        </IonText>
      )}
      <IonButton expand="block" disabled={busy} onClick={save}>
        {busy ? t('Saving…') : t('Save')}
      </IonButton>
      <IonButton expand="block" fill="clear" color="danger" disabled={busy} onClick={onRemove}>
        {forSelf ? t('Remove from this workout') : t('Remove from this day')}
      </IonButton>
    </div>
  );
}
