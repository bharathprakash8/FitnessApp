import {
  IonButton,
  IonButtons,
  IonCheckbox,
  IonContent,
  IonHeader,
  IonIcon,
  IonPage,
  IonProgressBar,
  IonSpinner,
  IonText,
  IonTitle,
  IonToolbar,
  useIonToast,
} from '@ionic/react';
import { cameraOutline, createOutline } from 'ionicons/icons';
import { useState } from 'react';

import { RefreshButton, SyncStatusBar } from '../../components/RefreshButton';
import { useT } from '../../i18n/i18n';
import { HealthSyncSetup } from '../activity/HealthSyncPage';
import { useAuth } from '../auth/useAuth';
import { useCoachLink } from '../coach/api';
import { CoachTerms } from '../coach/CoachCard';
import { DeviceCard } from '../notifications/NotificationsPage';
import {
  useAcceptConsent,
  useFinishOnboarding,
  useMyTrainer,
  useSaveClientDetails,
} from '../profile/api';
import { ClientDetailsForm } from '../profile/ClientDetailsForm';
import { useStartingTarget } from '../targets/api';
import { setAfterOnboarding } from './afterOnboarding';
import { CONSENT_VERSION, consentSections } from './consent';
import './onboarding.css';

type Step = 'welcome' | 'consent' | 'details' | 'target' | 'reminders' | 'activity' | 'first_meal';
const CLIENT_STEPS: Step[] = [
  'welcome',
  'consent',
  'details',
  'target',
  'reminders',
  'activity',
  'first_meal',
];
// Trainers set their own target in My fitness, so no target step.
const TRAINER_STEPS: Step[] = CLIENT_STEPS.filter((s) => s !== 'target');

/**
 * First login (owner, 8 Nov 2026): welcome → privacy (+ AI coach consent) → about you →
 * starting target → reminders → phone activity → log your first meal. Everything after
 * "About you" can be skipped; onboarding counts as finished only at the last step, so a
 * person who closes the app comes back to where they left off.
 */
export function OnboardingPage() {
  const t = useT();
  const { profile, signOut } = useAuth();
  const trainer = useMyTrainer(profile?.id);
  const { coached, assistantOf } = useCoachLink(profile);
  const acceptConsent = useAcceptConsent(profile, CONSENT_VERSION);
  const saveDetails = useSaveClientDetails(profile);
  const finish = useFinishOnboarding(profile);
  const [toast] = useIonToast();

  const isTrainer = profile?.role === 'trainer';
  const steps = isTrainer ? TRAINER_STEPS : CLIENT_STEPS;
  const hasConsent = Boolean(profile?.consent_at) && profile?.consent_version === CONSENT_VERSION;
  const detailsDone = Boolean(profile?.date_of_birth && profile?.height_cm);
  const [step, setStep] = useState<Step>(
    !hasConsent ? 'welcome' : !detailsDone ? 'details' : isTrainer ? 'reminders' : 'target',
  );
  const [agreed, setAgreed] = useState(false);
  const aiOnly = coached && !assistantOf;
  const starting = useStartingTarget(profile?.id, step === 'target' && aiOnly);

  if (!profile) return null;
  const firstName = (profile.full_name || '').split(' ')[0];
  const trainerName = trainer.data?.full_name?.split(' ')[0] || null;
  const next = () => setStep(steps[steps.indexOf(step) + 1] ?? step);

  const fail = (message: string) =>
    void toast({ message: t(message), duration: 3000, color: 'danger', position: 'top' });

  function done(path: string) {
    setAfterOnboarding(path);
    // The profile reloads with onboarded_at set and the route guard opens `path`.
    finish.mutateAsync().catch(() => fail('Could not save. Check your connection and try again.'));
  }

  const skipRow = (
    <div className="onboarding-next">
      <IonButton expand="block" size="large" onClick={next}>
        {t('Next')}
      </IonButton>
      <IonButton expand="block" fill="clear" color="medium" onClick={next}>
        {t('Skip for now')}
      </IonButton>
    </div>
  );

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
        <IonProgressBar value={(steps.indexOf(step) + 1) / steps.length} />
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
                  : aiOnly
                    ? t(
                        'Your AI coach will set your food targets and workouts here, and you’ll log your meals, workouts and activity.',
                      )
                    : trainerName
                      ? t(
                          '{name} will plan your workouts and food targets here, and you’ll log your meals, workouts and activity.',
                          { name: trainerName },
                        )
                      : t(
                          'Your trainer will plan your workouts and food targets here, and you’ll log your meals, workouts and activity.',
                        )}
              </p>
              <p>{t('It takes about 3 minutes to get started.')}</p>
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
                  <h3>{t(s.title)}</h3>
                  <ul>
                    {s.points.map((p) => (
                      <li key={p}>{t(p)}</li>
                    ))}
                  </ul>
                </section>
              ))}
              {coached && (
                <section>
                  <h3>
                    {assistantOf
                      ? t("{name}'s AI assistant", { name: assistantOf })
                      : t('Your AI coach')}
                  </h3>
                  <CoachTerms assistantOf={assistantOf} />
                </section>
              )}
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
                    .mutateAsync(coached)
                    .then(() =>
                      setStep(
                        detailsDone
                          ? (steps[steps.indexOf('details') + 1] ?? 'details')
                          : 'details',
                      ),
                    )
                    .catch(() => fail('Could not save. Check your connection and try again.'))
                }
              >
                {acceptConsent.isPending ? t('Saving…') : t('I agree – continue')}
              </IonButton>
              <IonText color="medium">
                <p className="onboarding-small">
                  {t(
                    "If you don't agree, you can't use the app yet. Talk to the admin if you have questions.",
                  )}
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
                  : aiOnly
                    ? t('This helps your AI coach set the right targets for you.')
                    : t('This helps your trainer plan the right targets for you.')}
              </p>
              <ClientDetailsForm
                profile={profile}
                weightKg={null}
                submitLabel="Next"
                busy={saveDetails.isPending}
                onSubmit={(details) =>
                  saveDetails
                    .mutateAsync({ details, previousWeight: null })
                    .then(next)
                    .catch(() => fail('Could not save. Check your connection and try again.'))
                }
              />
            </>
          )}

          {step === 'target' && (
            <>
              <h2>{t('Your daily target')}</h2>
              {aiOnly && starting.isPending ? (
                <p className="onboarding-center">
                  <IonSpinner name="dots" />
                </p>
              ) : aiOnly && starting.data ? (
                <>
                  <p>{t('Your starting target, worked out from your details:')}</p>
                  <div className="onboarding-target">
                    <span className="onboarding-target-tag">{t('Estimated')}</span>
                    <strong className="onboarding-target-kcal">
                      {t('{n} kcal a day', { n: starting.data.calories.toLocaleString('en-IN') })}
                    </strong>
                    <span>
                      {t('Protein {p} g · Carbs {c} g · Fat {f} g', {
                        p: starting.data.protein_g,
                        c: starting.data.carbs_g,
                        f: starting.data.fat_g,
                      })}
                    </span>
                  </div>
                  <p>
                    {t(
                      'Your AI coach will adjust it as it learns from your meals and weight. “How much should I eat?” uses it to suggest portions.',
                    )}
                  </p>
                </>
              ) : aiOnly ? (
                <p>
                  {starting.isError
                    ? t(
                        "We couldn't set your starting target just now. Your coach will set it soon.",
                      )
                    : t(
                        'Your coach and the admin will set your daily target soon. You can start logging meals already.',
                      )}
                </p>
              ) : (
                <p>
                  {trainerName
                    ? t(
                        '{name} will set your daily calories and protein soon. You can start logging meals already.',
                        { name: trainerName },
                      )
                    : t(
                        'Your trainer will set your daily calories and protein soon. You can start logging meals already.',
                      )}
                </p>
              )}
              <IonButton expand="block" size="large" onClick={next}>
                {t('Next')}
              </IonButton>
            </>
          )}

          {step === 'reminders' && (
            <>
              <h2>{t('Reminders')}</h2>
              <p>
                {t(
                  'FitCoach can remind you to log breakfast, lunch and dinner – only when you haven’t logged that meal yet. You can change the times in Me → Notifications.',
                )}
              </p>
              <DeviceCard />
              {skipRow}
            </>
          )}

          {step === 'activity' && (
            <>
              <h2>{t('Calories burnt from your phone')}</h2>
              <p>
                {t(
                  'Connect your phone or watch so FitCoach counts the calories you burn and your steps. You can do this later in Me → Health sync.',
                )}
              </p>
              <HealthSyncSetup />
              {skipRow}
            </>
          )}

          {step === 'first_meal' && (
            <>
              <h2>{t('Log your first meal')}</h2>
              <p>
                {t(
                  'Take a photo of your next meal. FitCoach estimates the calories, and “How much should I eat?” tells you how much of it fits your day.',
                )}
              </p>
              <IonButton
                expand="block"
                size="large"
                disabled={finish.isPending}
                onClick={() => done('/food/new/photo')}
              >
                <IonIcon slot="start" icon={cameraOutline} />
                {t('Take a photo of my next meal')}
              </IonButton>
              <IonButton
                expand="block"
                fill="outline"
                disabled={finish.isPending}
                onClick={() => done('/food/new/text')}
              >
                <IonIcon slot="start" icon={createOutline} />
                {t('Type what I ate')}
              </IonButton>
              <IonButton
                expand="block"
                fill="clear"
                color="medium"
                disabled={finish.isPending}
                onClick={() => done('/today')}
              >
                {finish.isPending ? t('Saving…') : t('Later – go to Today')}
              </IonButton>
            </>
          )}
        </div>
      </IonContent>
    </IonPage>
  );
}
