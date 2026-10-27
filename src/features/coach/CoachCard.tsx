import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonIcon,
  useIonToast,
} from '@ionic/react';
import { chatbubblesOutline, sparkles } from 'ionicons/icons';

import { todayIn } from '../../lib/dates';
import type { Profile } from '../auth/roles';
import { useAcceptCoachConsent, useCoachDay, useCoachLink } from './api';
import './coach.css';
import { useT } from '../../i18n/i18n';

/**
 * Today: the AI coach's note and plan for today, and "Ask coach". For clients on the AI coach,
 * either AI-only or as their trainer's AI assistant (then labelled with the trainer's name).
 */
export function CoachCard({ profile }: { profile: Profile }) {
  const t = useT();
  const { coached, assistantOf } = useCoachLink(profile);
  const label = assistantOf
    ? t("{name}'s AI assistant", { name: assistantOf })
    : t('Your AI coach');
  const consented = Boolean(profile.coach_consent_at);
  const day = useCoachDay(profile.id, todayIn(profile.timezone), coached && consented);
  if (!coached) return null;
  if (!consented)
    return <CoachConsentCard profile={profile} label={label} assistantOf={assistantOf} />;

  const notes = day.data?.notes ?? [];
  const morning = notes.find((n) => n.kind === 'head') ?? notes.find((n) => n.kind === 'morning');
  const evening = notes.find((n) => n.kind === 'evening');
  const plan = day.data?.plan;

  return (
    <IonCard className="coach-card">
      <IonCardHeader>
        <IonCardSubtitle>
          <IonIcon icon={sparkles} /> {label}
        </IonCardSubtitle>
        <IonCardTitle>{t("Today's plan")}</IonCardTitle>
      </IonCardHeader>
      <IonCardContent>
        {plan && (
          <p className="coach-plan">
            <strong>
              {plan.kind === 'rest'
                ? t('Rest day 🌿')
                : plan.kind === 'light'
                  ? t('Light day 🚶')
                  : t('Workout day 💪')}
            </strong>
            {plan.note ? ` – ${plan.note}` : ''}
            {plan.kcal_adjust !== 0 && (
              <span className="coach-adjust">
                {plan.kcal_adjust > 0
                  ? t('+{n} kcal today', { n: plan.kcal_adjust })
                  : t('{n} kcal today', { n: plan.kcal_adjust })}
              </span>
            )}
          </p>
        )}
        {morning && <p className="coach-note">{morning.body}</p>}
        {evening && <p className="coach-note coach-note-evening">🌙 {evening.body}</p>}
        {!plan && !morning && !evening && (
          <p className="coach-muted">{t('Your coach will send today’s note in the morning.')}</p>
        )}
        <IonButton expand="block" fill="outline" routerLink="/coach" style={{ marginTop: 10 }}>
          <IonIcon slot="start" icon={chatbubblesOutline} />
          {t('Ask coach')}
        </IonButton>
      </IonCardContent>
    </IonCard>
  );
}

function CoachConsentCard({
  profile,
  label,
  assistantOf,
}: {
  profile: Profile;
  label: string;
  assistantOf: string | null;
}) {
  const t = useT();
  const accept = useAcceptCoachConsent(profile);
  const [toast] = useIonToast();
  return (
    <IonCard className="coach-card">
      <IonCardHeader>
        <IonCardSubtitle>
          <IonIcon icon={sparkles} /> {label}
        </IonCardSubtitle>
        <IonCardTitle>
          {assistantOf
            ? t('{name} added an AI assistant', { name: assistantOf })
            : t('Meet your AI coach')}
        </IonCardTitle>
      </IonCardHeader>
      <IonCardContent>
        <ul className="coach-terms">
          <li>
            {assistantOf
              ? t(
                  'The assistant is an AI. {name} checks and approves its suggestions and can undo every change.',
                  { name: assistantOf },
                )
              : t(
                  'Your coach is an AI, supervised by the admin, who can see and undo every change.',
                )}
          </li>
          <li>
            {t(
              'Each morning Claude AI (Anthropic) reviews your meals and meal photos, workouts and activity, may correct calorie estimates, picks today’s workout and writes you a note.',
            )}
          </li>
          <li>
            {t(
              'Quick answers and notes during the day come from Groq and Google Gemini AI. Your profile, health conditions and logs are shared with them for this.',
            )}
          </li>
          <li>
            {t(
              'The coach is not a doctor and never gives medical advice. For health problems talk to your doctor; in an emergency call 108.',
            )}
          </li>
        </ul>
        <IonButton
          expand="block"
          disabled={accept.isPending}
          onClick={() =>
            accept.mutateAsync().catch(() =>
              toast({
                message: t('Could not save'),
                duration: 2500,
                color: 'danger',
                position: 'top',
              }),
            )
          }
        >
          {accept.isPending ? t('Saving…') : t('I agree – start my AI coach')}
        </IonButton>
      </IonCardContent>
    </IonCard>
  );
}
