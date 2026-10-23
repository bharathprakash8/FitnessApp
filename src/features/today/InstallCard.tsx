import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle } from '@ionic/react';
import { useState } from 'react';

import { isIOSWeb } from '../../lib/platform';
import { IosInstallSteps } from '../notifications/IosInstallSteps';
import '../notifications/notifications.css';
import { useT } from '../../i18n/i18n';

const DISMISS_KEY = 'fitcoach-install-card-dismissed';

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

function wasDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

/** iPhone in Safari: suggest "Add to Home Screen" once (needed for reminders and offline). */
export function InstallCard() {
  const [hidden, setHidden] = useState(() => !isIOSWeb || isStandalone() || wasDismissed());
  const t = useT();
  if (hidden) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* private mode: it just shows again next time */
    }
    setHidden(true);
  }

  return (
    <IonCard style={{ marginInline: 0 }}>
      <IonCardHeader>
        <IonCardTitle>{t('Add FitCoach to your Home Screen')}</IonCardTitle>
      </IonCardHeader>
      <IonCardContent>
        <IosInstallSteps />
        <p className="notif-muted">
          {t('It then opens like an app, works with a weak signal and can send you reminders.')}
        </p>
        <IonButton fill="clear" size="small" onClick={dismiss}>
          {t('Not now')}
        </IonButton>
      </IonCardContent>
    </IonCard>
  );
}
