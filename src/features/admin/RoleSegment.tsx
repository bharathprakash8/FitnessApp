import { IonLabel, IonSegment, IonSegmentButton } from '@ionic/react';

import type { Role } from '../auth/roles';
import { ROLE_LABELS } from './api';

const ROLES: Role[] = ['client', 'trainer', 'admin'];

export function RoleSegment({
  value,
  onChange,
  disabled,
}: {
  value: Role;
  onChange: (role: Role) => void;
  disabled?: boolean;
}) {
  return (
    <IonSegment
      value={value}
      disabled={disabled}
      onIonChange={(e) => onChange(e.detail.value as Role)}
    >
      {ROLES.map((r) => (
        <IonSegmentButton key={r} value={r}>
          <IonLabel>{ROLE_LABELS[r]}</IonLabel>
        </IonSegmentButton>
      ))}
    </IonSegment>
  );
}
