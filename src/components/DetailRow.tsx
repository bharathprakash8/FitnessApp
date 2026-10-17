import { IonItem, IonLabel, IonNote } from '@ionic/react';

/** A label/value line in a details list; shows "—" when empty. */
export function DetailRow({ label, value }: { label: string; value: string | number | null }) {
  const empty = value === null || value === '';
  return (
    <IonItem lines="inset">
      <IonLabel color="medium">{label}</IonLabel>
      <IonNote slot="end" color={empty ? 'medium' : 'dark'} style={{ textAlign: 'right' }}>
        {empty ? '—' : value}
      </IonNote>
    </IonItem>
  );
}
