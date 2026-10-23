import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonIcon,
  IonSpinner,
  IonText,
  IonTextarea,
  useIonToast,
} from '@ionic/react';
import { sparkles } from 'ionicons/icons';
import { useState } from 'react';

import type { Profile } from '../auth/roles';
import {
  periodLabel,
  useGenerateSummary,
  useSaveSummaryText,
  useShareSummary,
  useSummaries,
  type SummaryStats,
  type WeeklySummary,
} from '../summaries/api';
import './trainer.css';
import { useT } from '../../i18n/i18n';

/** Trainer → client → Summary: weekly AI summaries to edit and share. */
export function ClientSummaryTab({ client }: { client: Profile }) {
  const t = useT();
  const summaries = useSummaries(client.id);
  const generate = useGenerateSummary(client.id);
  const [toast] = useIonToast();

  return (
    <>
      <p className="trainer-note" style={{ marginBottom: 12 }}>
        {t(
          'Every Monday morning FitCoach drafts a summary of last week. Read it, edit if you like, then share it with',
        )}{' '}
        {client.full_name?.split(' ')[0] || t('your client')}.
      </p>
      <IonButton
        expand="block"
        fill="outline"
        disabled={generate.isPending}
        onClick={() =>
          generate.mutate(undefined, {
            onError: (err) =>
              void toast({
                message: err instanceof Error ? err.message : 'Could not create it.',
                duration: 3500,
                color: 'danger',
                position: 'top',
              }),
          })
        }
      >
        <IonIcon slot="start" icon={sparkles} />
        {generate.isPending
          ? t('Writing the summary…')
          : t('Create summary of the last 7 days now')}
      </IonButton>

      {summaries.isPending ? (
        <div className="ion-text-center">
          <IonSpinner name="crescent" />
        </div>
      ) : (summaries.data ?? []).length === 0 ? (
        <IonText color="medium">
          <p className="ion-text-center">{t('No summaries yet.')}</p>
        </IonText>
      ) : (
        summaries.data!.map((s) => (
          <SummaryCard key={`${s.id}:${s.updated_at}`} s={s} clientId={client.id} />
        ))
      )}
    </>
  );
}

function SummaryCard({ s, clientId }: { s: WeeklySummary; clientId: string }) {
  const t = useT();
  const save = useSaveSummaryText(clientId);
  const share = useShareSummary(clientId);
  const [toast] = useIonToast();
  const [text, setText] = useState(s.summary_text);
  const dirty = text.trim() !== s.summary_text.trim();
  const shared = s.status === 'shared';
  const stats = s.stats as SummaryStats;

  const fail = (err: unknown) =>
    void toast({
      message: err instanceof Error ? err.message : 'Could not save.',
      duration: 3000,
      color: 'danger',
      position: 'top',
    });

  async function doShare(on: boolean) {
    try {
      if (on && dirty) await save.mutateAsync({ id: s.id, text: text.trim() });
      await share.mutateAsync({ id: s.id, share: on });
      void toast({
        message: on ? 'Shared – your client was notified' : 'Taken back',
        duration: 2000,
        position: 'top',
      });
    } catch (err) {
      fail(err);
    }
  }

  return (
    <IonCard className="trainer-card">
      <IonCardHeader>
        <IonCardSubtitle>
          {shared ? t('Shared with client') : t('Draft – only you can see it')}
          {s.edited ? t(' · edited') : ''}
        </IonCardSubtitle>
        <IonCardTitle>{periodLabel(s)}</IonCardTitle>
      </IonCardHeader>
      <IonCardContent>
        <StatsLine stats={stats} />
        <IonTextarea
          fill="outline"
          autoGrow
          maxlength={2000}
          value={text}
          readonly={shared}
          aria-label={t('Summary text')}
          onIonInput={(e) => setText(String(e.detail.value ?? ''))}
        />
        <div className="trainer-row" style={{ marginTop: 8 }}>
          {!shared && dirty && (
            <IonButton
              fill="outline"
              disabled={save.isPending}
              onClick={() =>
                save.mutate(
                  { id: s.id, text: text.trim() },
                  {
                    onSuccess: () =>
                      void toast({ message: t('Saved'), duration: 1200, position: 'top' }),
                    onError: fail,
                  },
                )
              }
            >
              {t('Save')}
            </IonButton>
          )}
          <IonButton
            color={shared ? 'medium' : 'primary'}
            fill={shared ? 'clear' : 'solid'}
            disabled={share.isPending || save.isPending}
            onClick={() => void doShare(!shared)}
          >
            {shared ? t('Take back') : t('Share with client')}
          </IonButton>
        </div>
      </IonCardContent>
    </IonCard>
  );
}

/** The key numbers the summary was written from. */
export function StatsLine({ stats }: { stats: SummaryStats }) {
  const bits = [
    stats.food &&
      `Food logged ${stats.food.days_logged}/7 days` +
        (stats.food.pct_of_target !== null ? ` · ${stats.food.pct_of_target}% of target` : ''),
    stats.workouts && `Workouts ${stats.workouts.days_with_workouts} days`,
    stats.activity?.avg_steps != null &&
      `${stats.activity.avg_steps.toLocaleString('en-IN')} steps/day`,
    stats.weight?.change_kg != null &&
      `Weight ${stats.weight.change_kg > 0 ? '+' : ''}${stats.weight.change_kg} kg`,
    stats.sessions &&
      stats.sessions.attended + stats.sessions.missed > 0 &&
      `Sessions ${stats.sessions.attended} attended, ${stats.sessions.missed} missed`,
  ].filter(Boolean);
  if (bits.length === 0) return null;
  return (
    <p className="trainer-note" style={{ marginBottom: 8 }}>
      {bits.join(' · ')}
    </p>
  );
}
