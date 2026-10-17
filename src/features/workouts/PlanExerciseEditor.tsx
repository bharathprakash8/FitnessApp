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

import type { PlanExerciseFull } from './model';

export interface PlanExerciseFields {
  sets: number;
  reps: string | null;
  rest_seconds: number;
  notes: string | null;
}

/** Edit sets / reps / rest / notes for one exercise in a plan day. */
export function PlanExerciseEditor({
  item,
  busy,
  onSave,
  onRemove,
  onClose,
}: {
  item: PlanExerciseFull | null;
  busy: boolean;
  onSave: (fields: PlanExerciseFields) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  return (
    <IonModal isOpen={item !== null} onDidDismiss={onClose}>
      <IonHeader>
        <IonToolbar>
          <IonTitle>{item?.exercises.name}</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={onClose}>Close</IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        {item && (
          <Fields key={item.id} item={item} busy={busy} onSave={onSave} onRemove={onRemove} />
        )}
      </IonContent>
    </IonModal>
  );
}

function Fields({
  item,
  busy,
  onSave,
  onRemove,
}: {
  item: PlanExerciseFull;
  busy: boolean;
  onSave: (fields: PlanExerciseFields) => void;
  onRemove: () => void;
}) {
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
          label="Sets"
          labelPlacement="floating"
          type="number"
          inputmode="numeric"
          value={sets}
          onIonInput={(e) => setSets(String(e.detail.value ?? ''))}
        />
        <IonInput
          fill="outline"
          label={timed ? 'Time per set' : 'Reps'}
          labelPlacement="floating"
          placeholder={timed ? 'e.g. 30 s' : 'e.g. 8-10'}
          maxlength={20}
          value={reps}
          onIonInput={(e) => setReps(String(e.detail.value ?? ''))}
        />
        <IonInput
          fill="outline"
          label="Rest (s)"
          labelPlacement="floating"
          type="number"
          inputmode="numeric"
          value={rest}
          onIonInput={(e) => setRest(String(e.detail.value ?? ''))}
        />
      </div>
      <IonTextarea
        fill="outline"
        label="Notes for the client (optional)"
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
        {busy ? 'Saving…' : 'Save'}
      </IonButton>
      <IonButton expand="block" fill="clear" color="danger" disabled={busy} onClick={onRemove}>
        Remove from this day
      </IonButton>
    </div>
  );
}
