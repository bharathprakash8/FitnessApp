import {
  IonBadge,
  IonCard,
  IonCardContent,
  IonIcon,
  IonItem,
  IonLabel,
  IonToggle,
  useIonToast,
} from '@ionic/react';
import { chevronForward, sparkles } from 'ionicons/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '../../lib/supabase';
import { useCoachAdmin } from '../admin/coachAdminApi';
import type { Profile } from '../auth/roles';
import { useT } from '../../i18n/i18n';

/** Is the AI assistant on for this client? (trainer reads their own links) */
function useAssist(clientId: string) {
  return useQuery({
    queryKey: ['ai-assist', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trainer_clients')
        .select('ai_assist')
        .eq('client_id', clientId)
        .maybeSingle();
      if (error) throw error;
      return Boolean(data?.ai_assist);
    },
  });
}

/** Client page → Overview: switch the AI assistant on or off for this client. */
export function AiAssistToggle({ client }: { client: Profile }) {
  const t = useT();
  const assist = useAssist(client.id);
  const admin = useCoachAdmin();
  const qc = useQueryClient();
  const [toast] = useIonToast();
  const on = Boolean(assist.data);
  return (
    <IonCard className="ai-assist-card">
      <IonCardContent>
        <IonToggle
          checked={on}
          disabled={assist.isPending || admin.isPending}
          onIonChange={(e) =>
            void admin
              .mutateAsync({ action: 'set_assist', client_id: client.id, on: e.detail.checked })
              .then(() => qc.invalidateQueries({ queryKey: ['ai-assist', client.id] }))
              .catch((err: Error) =>
                toast({ message: err.message, duration: 3000, color: 'danger', position: 'top' }),
              )
          }
        >
          <IonIcon icon={sparkles} color="tertiary" /> {t('AI assistant')}
        </IonToggle>
        <p className="ai-assist-help">
          {on
            ? client.coach_consent_at
              ? t(
                  'Every morning the AI checks their meals and photos and plans their day. You approve its suggestions in AI assistant; they can chat with it on Today.',
                )
              : t('Waiting for them to agree in the app (a card on their Today page).')
            : t(
                'Switch on to let the AI check their meals and photos every morning, suggest today’s plan and answer their questions – you approve everything.',
              )}
        </p>
      </IonCardContent>
    </IonCard>
  );
}

/** Clients list: "AI assistant – N waiting for you". Hidden when no client has it on. */
export function AiAssistantBanner({ trainerId }: { trainerId: string }) {
  const t = useT();
  const q = useQuery({
    queryKey: ['ai-assist-banner', trainerId],
    queryFn: async () => {
      const [{ count: clients }, { count: waiting }, { count: questions }] = await Promise.all([
        supabase
          .from('trainer_clients')
          .select('client_id', { count: 'exact', head: true })
          .eq('trainer_id', trainerId)
          .eq('ai_assist', true),
        supabase
          .from('coach_actions')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'proposed')
          .neq('kind', 'check_meal'),
        supabase
          .from('coach_queries')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'escalated'),
      ]);
      return { clients: clients ?? 0, todo: (waiting ?? 0) + (questions ?? 0) };
    },
  });
  if (!q.data?.clients) return null;
  return (
    <IonItem
      button
      detail={false}
      routerLink="/trainer/assistant"
      lines="full"
      className="ai-assist-banner"
    >
      <IonIcon slot="start" icon={sparkles} color="tertiary" />
      <IonLabel>
        <h2>{t('AI assistant')}</h2>
        <p>
          {q.data.todo
            ? t('{n} waiting for you', { n: q.data.todo })
            : t('All done – nothing waiting')}
        </p>
      </IonLabel>
      {q.data.todo > 0 && <IonBadge color="danger">{q.data.todo}</IonBadge>}
      <IonIcon slot="end" icon={chevronForward} color="medium" />
    </IonItem>
  );
}
