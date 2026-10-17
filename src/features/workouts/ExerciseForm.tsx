import {
  IonButton,
  IonInput,
  IonLabel,
  IonSegment,
  IonSegmentButton,
  IonText,
  IonTextarea,
} from '@ionic/react';
import { useState, type FormEvent } from 'react';

import type { Exercise, LogType } from './model';

export interface ExerciseInput {
  name: string;
  muscle_group: string | null;
  equipment: string | null;
  log_type: LogType;
  demo_url: string | null;
  cues: string | null;
}

/** Add or edit an exercise. */
export function ExerciseForm({
  exercise,
  busy,
  onSubmit,
}: {
  exercise?: Exercise;
  busy: boolean;
  onSubmit: (input: ExerciseInput) => void;
}) {
  const [name, setName] = useState(exercise?.name ?? '');
  const [muscle, setMuscle] = useState(exercise?.muscle_group ?? '');
  const [equipment, setEquipment] = useState(exercise?.equipment ?? '');
  const [logType, setLogType] = useState<LogType>((exercise?.log_type as LogType) ?? 'weights');
  const [demo, setDemo] = useState(exercise?.demo_url ?? '');
  const [cues, setCues] = useState(exercise?.cues ?? '');
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const url = demo.trim();
    if (!name.trim()) return setError('Please enter a name.');
    if (url && !/^https:\/\/\S+$/.test(url)) {
      return setError('The demo link must start with https:// (e.g. a YouTube link).');
    }
    setError(null);
    onSubmit({
      name: name.trim(),
      muscle_group: muscle.trim() || null,
      equipment: equipment.trim() || null,
      log_type: logType,
      demo_url: url || null,
      cues: cues.trim() || null,
    });
  }

  return (
    <form className="workout-form" onSubmit={submit} noValidate>
      <IonInput
        fill="outline"
        label="Name"
        labelPlacement="floating"
        maxlength={80}
        value={name}
        onIonInput={(e) => setName(String(e.detail.value ?? ''))}
      />
      <div className="workout-row">
        <IonInput
          fill="outline"
          label="Muscle group"
          labelPlacement="floating"
          maxlength={40}
          value={muscle}
          onIonInput={(e) => setMuscle(String(e.detail.value ?? ''))}
        />
        <IonInput
          fill="outline"
          label="Equipment"
          labelPlacement="floating"
          maxlength={40}
          value={equipment}
          onIonInput={(e) => setEquipment(String(e.detail.value ?? ''))}
        />
      </div>
      <div>
        <IonText color="medium">
          <p className="workout-label">What the client logs</p>
        </IonText>
        <IonSegment value={logType} onIonChange={(e) => setLogType(e.detail.value as LogType)}>
          <IonSegmentButton value="weights">
            <IonLabel>kg × reps</IonLabel>
          </IonSegmentButton>
          <IonSegmentButton value="bodyweight">
            <IonLabel>Reps</IonLabel>
          </IonSegmentButton>
          <IonSegmentButton value="timed">
            <IonLabel>Minutes</IonLabel>
          </IonSegmentButton>
        </IonSegment>
      </div>
      <IonInput
        fill="outline"
        label="Demo video link (optional)"
        labelPlacement="floating"
        type="url"
        inputmode="url"
        placeholder="https://"
        value={demo}
        onIonInput={(e) => setDemo(String(e.detail.value ?? ''))}
      />
      <IonTextarea
        fill="outline"
        label="Form cues"
        labelPlacement="floating"
        autoGrow
        maxlength={1000}
        value={cues}
        onIonInput={(e) => setCues(String(e.detail.value ?? ''))}
      />
      {error && (
        <IonText color="danger" role="alert">
          <p className="workout-note">{error}</p>
        </IonText>
      )}
      <IonButton type="submit" expand="block" disabled={busy}>
        {busy ? 'Saving…' : 'Save exercise'}
      </IonButton>
    </form>
  );
}
