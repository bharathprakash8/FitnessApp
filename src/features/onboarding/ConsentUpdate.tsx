import { IonButton, IonCheckbox, IonText } from '@ionic/react';
import { useState } from 'react';

import { useT } from '../../i18n/i18n';
import { isImpersonating } from '../../lib/impersonation';
import { useAuth } from '../auth/useAuth';
import { useAcceptConsent } from '../profile/api';
import { CONSENT_VERSION, consentSections, needsConsentUpdate } from './consent';
import './onboarding.css';

/**
 * Shown once, over any screen, when the consent wording has changed. An overlay and not a
 * redirect, because swapping a route's page after navigating leaves Ionic with a blank screen.
 * Never while the admin is logged in as someone: only the person can agree for themselves.
 */
export function ConsentUpdate() {
  const t = useT();
  const { status, profile, signOut } = useAuth();
  const accept = useAcceptConsent(profile, CONSENT_VERSION);
  const [agreed, setAgreed] = useState(false);
  const [failed, setFailed] = useState(false);

  if (status !== 'ready' || !profile || !needsConsentUpdate(profile) || isImpersonating()) {
    return null;
  }

  return (
    <div className="consent-update" role="dialog" aria-modal="true" aria-labelledby="consent-title">
      <div className="onboarding">
        <h2 id="consent-title">{t('We’ve updated how we explain your data')}</h2>
        <p>{t('Please read this and agree to keep using FitCoach. It only takes a minute.')}</p>
        {consentSections(profile.role).map((s) => (
          <section key={s.title}>
            <h3>{t(s.title)}</h3>
            <ul>
              {s.points.map((p) => (
                <li key={p}>{t(p)}</li>
              ))}
            </ul>
          </section>
        ))}
        <p>
          <a href="/privacy.html" target="_blank" rel="noreferrer">
            {t('Read the full privacy policy')}
          </a>
        </p>
        <IonCheckbox
          labelPlacement="end"
          justify="start"
          checked={agreed}
          onIonChange={(e) => setAgreed(e.detail.checked)}
          className="onboarding-agree"
        >
          {t('I have read this and I agree')}
        </IonCheckbox>
        {failed && (
          <IonText color="danger">
            <p role="alert">{t('Could not save. Check your connection and try again.')}</p>
          </IonText>
        )}
        <IonButton
          expand="block"
          size="large"
          disabled={!agreed || accept.isPending}
          onClick={() => {
            setFailed(false);
            accept.mutateAsync().catch(() => setFailed(true));
          }}
        >
          {accept.isPending ? t('Saving…') : t('I agree – continue')}
        </IonButton>
        <IonText color="medium">
          <p className="onboarding-small">
            {t(
              'If you don’t agree, log out and talk to your trainer or the admin. You can ask them to delete your data.',
            )}
          </p>
        </IonText>
        <IonButton expand="block" fill="clear" onClick={() => void signOut()}>
          {t('Log out')}
        </IonButton>
      </div>
    </div>
  );
}
