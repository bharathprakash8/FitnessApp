import { IonButton, IonIcon, IonSpinner } from '@ionic/react';
import { rocketOutline } from 'ionicons/icons';
import { useState } from 'react';
import { matchPath, useLocation } from 'react-router-dom';

import { ANDROID_APP_URL } from '../../config';
import { useT } from '../../i18n/i18n';
import { applyWebUpdate, snoozeUpdate, useUpdateOffer, type UpdateOffer } from './update';
import './update.css';

// Only where it can't interrupt someone halfway through logging a meal or a set.
// /me and /trainer/me too, because that is where "Check for updates" is.
const SHOW_ON = ['/', '/login', '/today', '/trainer', '/admin', '/me', '/trainer/me'];

function WebBody({ offer }: { offer: UpdateOffer }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  return (
    <>
      <h2 id="update-title">{t('A new version of FitCoach is ready')}</h2>
      <p>{t('It takes a few seconds. Everything you have saved stays safe.')}</p>
      <IonButton
        expand="block"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void applyWebUpdate();
        }}
      >
        {busy ? <IonSpinner name="crescent" /> : t('Update now')}
      </IonButton>
      {!busy && (
        <IonButton expand="block" fill="clear" onClick={() => snoozeUpdate(offer)}>
          {t('Later')}
        </IonButton>
      )}
    </>
  );
}

function AndroidBody({ offer }: { offer: Extract<UpdateOffer, { kind: 'android' }> }) {
  const t = useT();
  const [started, setStarted] = useState(false);

  if (started) {
    return (
      <>
        <h2 id="update-title">{t('Almost done')}</h2>
        <ol className="update-steps">
          <li>{t('Wait for FitCoach.apk to finish downloading.')}</li>
          <li>{t('Tap Open, or tap the file in your notifications.')}</li>
          <li>{t('Tap Update. If Android asks, allow installs from this source.')}</li>
        </ol>
        <p className="update-small">{t('Your data stays safe. You won’t need to log in again.')}</p>
        <IonButton expand="block" fill="outline" href={ANDROID_APP_URL} target="_blank">
          {t('Download again')}
        </IonButton>
        {!offer.required && (
          <IonButton expand="block" fill="clear" onClick={() => snoozeUpdate(offer)}>
            {t('Close')}
          </IonButton>
        )}
      </>
    );
  }

  return (
    <>
      <h2 id="update-title">{t('A new version of FitCoach is ready')}</h2>
      <p>{offer.notes ?? t('Update to get the latest improvements and fixes.')}</p>
      <p className="update-small">{t('Your data stays safe. You won’t need to log in again.')}</p>
      <IonButton
        expand="block"
        href={ANDROID_APP_URL}
        target="_blank"
        onClick={() => setStarted(true)}
      >
        {t('Update now')}
      </IonButton>
      {!offer.required && (
        <IonButton expand="block" fill="clear" onClick={() => snoozeUpdate(offer)}>
          {t('Later')}
        </IonButton>
      )}
    </>
  );
}

/** The update popup on the home screens, for iPhone/web and Android. */
export function UpdatePrompt() {
  const offer = useUpdateOffer();
  const { pathname } = useLocation();
  if (!offer || !SHOW_ON.some((p) => matchPath(p, pathname))) return null;
  return (
    <div className="update-backdrop">
      <div className="update-sheet" role="dialog" aria-modal="true" aria-labelledby="update-title">
        <div className="update-icon">
          <IonIcon icon={rocketOutline} aria-hidden="true" />
        </div>
        {offer.kind === 'android' ? <AndroidBody offer={offer} /> : <WebBody offer={offer} />}
      </div>
    </div>
  );
}
