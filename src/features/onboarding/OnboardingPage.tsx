import {
  IonButton,
  IonButtons,
  IonCheckbox,
  IonContent,
  IonHeader,
  IonPage,
  IonProgressBar,
  IonText,
  IonTitle,
  IonToolbar,
  useIonToast,
} from '@ionic/react';
import { useState } from 'react';

import { RefreshButton, SyncStatusBar } from '../../components/RefreshButton';
import { useAuth } from '../auth/useAuth';
import { useAcceptConsent, useMyTrainer, useSaveClientDetails } from '../profile/api';
import { ClientDetailsForm } from '../profile/ClientDetailsForm';
import { CONSENT_VERSION, consentSections } from './consent';
import './onboarding.css';
import { useT } from '../../i18n/i18n';

type Step = 'welcome' | 'consent' | 'details';
const STEPS: Step[] = ['welcome', 'consent', 'details'];

/** First login for a client: welcome → consent (required) → profile quiz. */
export function OnboardingPage() {
  const t = useT();
  const { profile, signOut } = useAuth();
  const trainer = useMyTrainer(profile?.id);
  const acceptConsent = useAcceptConsent(profile, CONSENT_VERSION);
  const saveDetails = useSaveClientDetails(profile);
  const [toast] = useIonToast();

  const hasConsent = Boolean(profile?.consent_at) && profile?.consent_version === CONSENT_VERSION;
  const [step, setStep] = useState<Step>(hasConsent ? 'details' : 'welcome');
  const [agreed, setAgreed] = useState(false);

  if (!profile) return null;
  const firstName = (profile.full_name || '').split(' ')[0];
  const isTrainer = profile.role === 'trainer';
  const trainerName = trainer.data?.full_name || 'your trainer';

  const fail = (message: string) =>
    void toast({ message, duration: 3000, color: 'danger', position: 'top' });

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="primary">
          <IonTitle>{t('Welcome to FitCoach')}</IonTitle>
          <IonButtons slot="end">
            <RefreshButton />
            {isTrainer ? (
              <IonButton routerLink="/trainer" routerDirection="root">
                {t('Not now')}
              </IonButton>
            ) : (
              <IonButton onClick={() => void signOut()}>{t('Log out')}</IonButton>
            )}
          </IonButtons>
        </IonToolbar>
        <IonProgressBar value={(STEPS.indexOf(step) + 1) / STEPS.length} />
        <SyncStatusBar />
      </IonHeader>
      <IonContent className="ion-padding">
        <div className="onboarding">
          {step === 'welcome' && (
            <>
              <img src="/icon.svg" alt="" className="onboarding-logo" />
              <h1>
                {t('Hi')}
                {firstName ? ` ${firstName}` : ''}! 👋
              </h1>
              <p>
                {isTrainer
                  ? t(
                      'Set up My fitness to log your own meals, workouts and activity, just like your clients do.',
                    )
                  : `${trainerName === 'your trainer' ? 'Your trainer' : trainerName} will plan your workouts and food targets here, and you'll log your meals, workouts and activity.`}
              </p>
              <p>{t('It takes about 2 minutes to get started.')}</p>
              <IonButton expand="block" size="large" onClick={() => setStep('consent')}>
                {t("Let's start")}
              </IonButton>
            </>
          )}

          {step === 'consent' && (
            <>
              <h2>{t('Your privacy and health')}</h2>
              {consentSections(profile.role).map((s) => (
                <section key={s.title}>
                  <h3>{s.title}</h3>
                  <ul>
                    {s.points.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </section>
              ))}
              <IonCheckbox
                labelPlacement="end"
                justify="start"
                checked={agreed}
                onIonChange={(e) => setAgreed(e.detail.checked)}
                className="onboarding-agree"
              >
                {t('I have read this and I agree')}
              </IonCheckbox>
              <IonButton
                expand="block"
                size="large"
                disabled={!agreed || acceptConsent.isPending}
                onClick={() =>
                  acceptConsent
                    .mutateAsync()
                    .then(() => setStep('details'))
                    .catch(() => fail('Could not save. Check your connection and try again.'))
                }
              >
                {acceptConsent.isPending ? t('Saving…') : t('I agree – continue')}
              </IonButton>
              <IonText color="medium">
                <p className="onboarding-small">
                  {t("If you don't agree, you can't use the app yet. Talk to")} {trainerName}{' '}
                  {t('or the admin if you have questions.')}
                </p>
              </IonText>
            </>
          )}

          {step === 'details' && (
            <>
              <h2>{t('About you')}</h2>
              <p>
                {isTrainer
                  ? t('This is used to estimate your calories and calories burnt.')
                  : `This helps ${trainerName} plan the right targets for you.`}
              </p>
              <ClientDetailsForm
                profile={profile}
                weightKg={null}
                submitLabel="Finish"
                busy={saveDetails.isPending}
                onSubmit={(details) =>
                  // On success the profile reloads with onboarded_at set and the guard sends
                  // the client to Today.
                  saveDetails
                    .mutateAsync({ details, previousWeight: null, finishOnboarding: true })
                    .catch(() => fail('Could not save. Check your connection and try again.'))
                }
              />
            </>
          )}
        </div>
      </IonContent>
    </IonPage>
  );
}
