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

type Step = 'welcome' | 'consent' | 'details';
const STEPS: Step[] = ['welcome', 'consent', 'details'];

/** First login for a client: welcome → consent (required) → profile quiz. */
export function OnboardingPage() {
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
          <IonTitle>Welcome to FitCoach</IonTitle>
          <IonButtons slot="end">
            <RefreshButton />
            {isTrainer ? (
              <IonButton routerLink="/trainer" routerDirection="root">
                Not now
              </IonButton>
            ) : (
              <IonButton onClick={() => void signOut()}>Log out</IonButton>
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
              <h1>Hi{firstName ? ` ${firstName}` : ''}! 👋</h1>
              <p>
                {isTrainer
                  ? 'Set up My fitness to log your own meals, workouts and activity, just like your clients do.'
                  : `${trainerName === 'your trainer' ? 'Your trainer' : trainerName} will plan your workouts and food targets here, and you'll log your meals, workouts and activity.`}
              </p>
              <p>It takes about 2 minutes to get started.</p>
              <IonButton expand="block" size="large" onClick={() => setStep('consent')}>
                Let's start
              </IonButton>
            </>
          )}

          {step === 'consent' && (
            <>
              <h2>Your privacy and health</h2>
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
                I have read this and I agree
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
                {acceptConsent.isPending ? 'Saving…' : 'I agree – continue'}
              </IonButton>
              <IonText color="medium">
                <p className="onboarding-small">
                  If you don't agree, you can't use the app yet. Talk to {trainerName} or the admin
                  if you have questions.
                </p>
              </IonText>
            </>
          )}

          {step === 'details' && (
            <>
              <h2>About you</h2>
              <p>
                {isTrainer
                  ? 'This is used to estimate your calories and calories burnt.'
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
