import { IonButton, IonContent, IonPage, IonSpinner, IonText } from '@ionic/react';
import { useState } from 'react';
import { Navigate } from 'react-router-dom';

import { ANDROID_APP_URL } from '../../config';
import { useT } from '../../i18n/i18n';
import { isAndroidApp, isIOSWeb } from '../../lib/platform';
import { homePathFor } from './roles';
import { formatSetupCode, loginWithSetupCode, setupCodeComplete } from './setupLogin';
import { useAuth } from './useAuth';
import './LoginPage.css';

const standalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

/**
 * The page the admin's WhatsApp setup link opens: /setup#KX7P-M3QD. The code is in the
 * fragment, so it never reaches a server log. On an iPhone in Safari it first explains
 * "Add to Home Screen" (the home-screen app keeps its own login), on an Android browser it
 * offers the app; anywhere else one tap logs in.
 */
export function SetupPage() {
  const t = useT();
  const { status, profile, signOut } = useAuth();
  const [code] = useState(() => formatSetupCode(decodeURIComponent(window.location.hash.slice(1))));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done && status === 'ready' && profile) {
    return <Navigate to={homePathFor(profile)} replace />;
  }

  async function logIn() {
    setBusy(true);
    setError(null);
    try {
      if (status === 'ready') await signOut();
      await loginWithSetupCode(code);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not log in.');
    } finally {
      setBusy(false);
    }
  }

  const valid = setupCodeComplete(code);
  const iphoneSafari = isIOSWeb && !standalone();
  const androidBrowser = !isAndroidApp && /Android/i.test(navigator.userAgent);
  const loginButton = (label: string, quiet: boolean) => (
    <IonButton
      expand="block"
      size={quiet ? undefined : 'large'}
      fill={quiet ? 'clear' : 'solid'}
      disabled={busy}
      onClick={() => void logIn()}
    >
      {busy ? <IonSpinner name="dots" /> : label}
    </IonButton>
  );

  return (
    <IonPage>
      <IonContent className="ion-padding login-content">
        <div className="login-box">
          <img src="/icon.svg" alt="" className="login-logo" />
          <h1 className="login-title">{t('FitCoach')}</h1>

          {!valid ? (
            <>
              <p className="login-hint">
                {t("This link doesn't have a complete setup code. Ask the admin to send it again.")}
              </p>
              <IonButton expand="block" routerLink="/login" routerDirection="root">
                {t('Go to login')}
              </IonButton>
            </>
          ) : (
            <>
              <p className="login-hint setup-label">{t('Your setup code')}</p>
              <p className="setup-code">{code}</p>

              {status === 'ready' && profile && !done && (
                <IonText color="medium">
                  <p className="login-hint">
                    {t(
                      'You are logged in as {name}. Using this code logs you in as the person it was made for.',
                      { name: profile.full_name || profile.email },
                    )}
                  </p>
                </IonText>
              )}

              {iphoneSafari ? (
                <>
                  <p className="login-hint">
                    <strong>{t('On iPhone, first add FitCoach to your Home Screen:')}</strong>
                  </p>
                  <ol className="setup-steps">
                    <li>
                      {t(
                        'If this opened inside WhatsApp, tap the compass or ··· button and choose Open in Safari.',
                      )}
                    </li>
                    <li>
                      {t('Tap the')} <strong>{t('Share')}</strong>{' '}
                      {t('button (square with an arrow) at the bottom of Safari.')}
                    </li>
                    <li>
                      {t('Scroll down and tap')} <strong>{t('Add to Home Screen')}</strong> →{' '}
                      <strong>{t('Add')}</strong>.
                    </li>
                    <li>
                      {t(
                        'Open FitCoach from the new icon, tap “I have a setup code” and type the code above.',
                      )}
                    </li>
                  </ol>
                  {loginButton(t('Log in here in Safari instead'), true)}
                </>
              ) : androidBrowser ? (
                <>
                  <p className="login-hint">
                    {t(
                      'Best on Android: install the FitCoach app, open it, tap “I have a setup code” and type the code above.',
                    )}
                  </p>
                  <IonButton expand="block" size="large" href={ANDROID_APP_URL} target="_blank">
                    {t('Install the Android app')}
                  </IonButton>
                  {loginButton(t('Use FitCoach in this browser instead'), true)}
                </>
              ) : (
                loginButton(t('Log in'), false)
              )}
              <IonText color="medium">
                <p className="login-small">
                  {t(
                    'The code works once, for 7 days. On a new phone, log in with your email instead.',
                  )}
                </p>
              </IonText>
            </>
          )}

          {error && (
            <IonText color="danger" role="alert">
              <p className="login-error">{error}</p>
            </IonText>
          )}
        </div>
      </IonContent>
    </IonPage>
  );
}
