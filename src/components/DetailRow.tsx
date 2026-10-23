import { IonItem, IonLabel, IonNote } from '@ionic/react';
import { useT } from '../i18n/i18n';

/** A label/value line in a details list; shows "—" when empty. */
export function DetailRow({ label, value }: { label: string; value: string | number | null }) {
  const empty = value === null || value === '';
  const t = useT();
  return (
    <IonItem lines="inset">
      <IonLabel color="medium">{t(label)}</IonLabel>
      <IonNote
        slot="end"
        color={empty ? 'medium' : 'dark'}
        style={{ textAlign: 'right', fontSize: '0.95rem', fontWeight: 500 }}
      >
        {empty ? '—' : value}
      </IonNote>
    </IonItem>
  );
}
