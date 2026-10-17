import { IonSelect, IonSelectOption } from '@ionic/react';

import { displayName, type AdminUser } from './api';

/** Pick an active trainer (required for clients). */
export function TrainerSelect({
  users,
  value,
  onChange,
  disabled,
  excludeId,
}: {
  users: AdminUser[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  excludeId?: string;
}) {
  const trainers = users.filter((u) => u.role === 'trainer' && u.is_active && u.id !== excludeId);
  return (
    <IonSelect
      label="Trainer"
      labelPlacement="floating"
      fill="outline"
      interface="action-sheet"
      interfaceOptions={{ header: 'Pick a trainer' }}
      placeholder={trainers.length ? 'Pick a trainer' : 'Add a trainer first'}
      value={value || undefined}
      disabled={disabled || trainers.length === 0}
      onIonChange={(e) => onChange(String(e.detail.value ?? ''))}
    >
      {trainers.map((t) => (
        <IonSelectOption key={t.id} value={t.id}>
          {displayName(t)}
        </IonSelectOption>
      ))}
    </IonSelect>
  );
}
