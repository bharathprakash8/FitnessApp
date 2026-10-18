import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonPage,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/react';
import { documentTextOutline } from 'ionicons/icons';

import { EmptyState } from '../../components/EmptyState';
import { RefreshButton, SyncStatusBar } from '../../components/RefreshButton';
import type { Profile } from '../auth/roles';
import { useAuth } from '../auth/useAuth';
import { StatsLine } from '../trainer/ClientSummaryTab';
import { periodLabel, useSummaries, type SummaryStats } from './api';

/** Client → Me → Weekly summaries: what the trainer shared. */
export function MySummariesPage() {
  const { profile } = useAuth();
  const summaries = useSummaries(profile?.id);
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="primary">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/me" />
          </IonButtons>
          <IonTitle>Weekly summaries</IonTitle>
          <IonButtons slot="end">
            <RefreshButton />
          </IonButtons>
        </IonToolbar>
        <SyncStatusBar />
      </IonHeader>
      <IonContent className="ion-padding">
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          {summaries.isPending ? (
            <div className="ion-text-center">
              <IonSpinner name="crescent" />
            </div>
          ) : (summaries.data ?? []).length === 0 ? (
            <EmptyState
              icon={documentTextOutline}
              title="No weekly summary yet"
              text="Your trainer shares a short review of your week – usually on Mondays."
            />
          ) : (
            summaries.data!.map((s) => (
              <IonCard key={s.id} style={{ marginInline: 0 }}>
                <IonCardHeader>
                  <IonCardSubtitle>Week of</IonCardSubtitle>
                  <IonCardTitle>{periodLabel(s)}</IonCardTitle>
                </IonCardHeader>
                <IonCardContent>
                  <StatsLine stats={s.stats as SummaryStats} />
                  <p style={{ whiteSpace: 'pre-wrap' }}>{s.summary_text}</p>
                </IonCardContent>
              </IonCard>
            ))
          )}
        </div>
      </IonContent>
    </IonPage>
  );
}

/** Today (client): the latest shared summary, for 8 days after it was shared. */
export function LatestSummaryCard({ profile }: { profile: Profile }) {
  const summaries = useSummaries(profile.id);
  const latest = summaries.data?.[0];
  if (!latest?.shared_at || !isRecent(latest.shared_at)) return null;
  return (
    <IonCard style={{ marginInline: 0 }}>
      <IonCardHeader>
        <IonCardSubtitle>Your week in review · {periodLabel(latest)}</IonCardSubtitle>
      </IonCardHeader>
      <IonCardContent>
        <p style={{ whiteSpace: 'pre-wrap' }}>
          {latest.summary_text.length > 220
            ? `${latest.summary_text.slice(0, 220).trimEnd()}…`
            : latest.summary_text}
        </p>
        <IonButton fill="clear" size="small" routerLink="/me/summaries">
          Read all summaries
        </IonButton>
      </IonCardContent>
    </IonCard>
  );
}

const isRecent = (iso: string) => Date.now() - Date.parse(iso) < 8 * 86_400_000;
