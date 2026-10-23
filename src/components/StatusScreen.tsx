import { IonButton, IonContent, IonPage, IonSpinner } from '@ionic/react';
import { useT } from '../i18n/i18n';

interface Action {
  label: string;
  onClick: () => void;
}

interface StatusScreenProps {
  /** Show a spinner instead of a message. */
  loading?: boolean;
  title?: string;
  message?: string;
  actions?: Action[];
}

/** Full-screen loading or message state (e.g. checking session, account inactive). */
export function StatusScreen({ loading, title, message, actions = [] }: StatusScreenProps) {
  const tx = useT();
  const t = useT();
  return (
    <IonPage>
      <IonContent className="ion-padding">
        <div
          style={{
            minHeight: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            gap: 12,
            maxWidth: 400,
            margin: '0 auto',
          }}
        >
          {loading ? (
            <IonSpinner name="crescent" color="primary" aria-label={tx('Loading')} />
          ) : (
            <>
              {title && <h2 style={{ margin: 0 }}>{t(title)}</h2>}
              {message && <p style={{ margin: 0, lineHeight: 1.4 }}>{t(message)}</p>}
              {actions.map((a) => (
                <IonButton key={a.label} expand="block" onClick={a.onClick}>
                  {t(a.label)}
                </IonButton>
              ))}
            </>
          )}
        </div>
      </IonContent>
    </IonPage>
  );
}
