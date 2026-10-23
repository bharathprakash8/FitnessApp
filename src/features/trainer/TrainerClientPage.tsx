import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonLabel,
  IonList,
  IonPage,
  IonSegment,
  IonSegmentButton,
  IonSpinner,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/react';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router-dom';

import { RefreshButton, SyncStatusBar } from '../../components/RefreshButton';
import { DetailRow } from '../../components/DetailRow';
import { ageFrom, formatDate } from '../../lib/dates';
import type { Profile } from '../auth/roles';
import { useAuth } from '../auth/useAuth';
import { useLatestWeight, useProfileById } from '../profile/api';
import { DIET_LABELS, SEX_LABELS, goalText, label } from '../profile/options';
import { currentTarget, upcomingTarget, useTargets } from '../targets/api';
import { TargetsCard } from '../targets/TargetsCard';
import { cachedClient } from './api';
import { ClientFoodTab } from './ClientFoodTab';
import { ClientRemindersTab } from './ClientRemindersTab';
import { ProgressView } from '../progress/ProgressView';
import { ClientSummaryTab } from './ClientSummaryTab';
import { ClientWorkoutsTab } from './ClientWorkoutsTab';
import { ClientMealIdeasTab } from '../mealIdeas/ClientMealIdeasTab';
import { StatsView } from '../stats/StatsView';
import { LastSync } from '../activity/LastSync';
import { TargetsTab } from './TargetsTab';
import './trainer.css';
import { useT } from '../../i18n/i18n';

type Tab =
  | 'overview'
  | 'stats'
  | 'progress'
  | 'summary'
  | 'targets'
  | 'food'
  | 'ideas'
  | 'workouts'
  | 'reminders';

export function TrainerClientPage() {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const { profile: me } = useAuth();
  const qc = useQueryClient();
  const client = useProfileById(id, cachedClient(qc, me?.id, id));
  // Start the Overview's other requests now, in parallel, instead of after the profile.
  useLatestWeight(id);
  useTargets(id);
  const [tab, setTab] = useState<Tab>('overview');
  const name = client.data?.full_name || client.data?.email || 'Client';

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="primary">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/trainer" />
          </IonButtons>
          <IonTitle>{name}</IonTitle>
          <IonButtons slot="end">
            <RefreshButton />
          </IonButtons>
        </IonToolbar>
        <IonToolbar>
          <IonSegment scrollable value={tab} onIonChange={(e) => setTab(e.detail.value as Tab)}>
            <IonSegmentButton value="overview">
              <IonLabel>{t('Overview')}</IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="stats">
              <IonLabel>{t('Stats')}</IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="progress">
              <IonLabel>{t('Progress')}</IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="summary">
              <IonLabel>{t('Summary')}</IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="targets">
              <IonLabel>{t('Targets')}</IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="food">
              <IonLabel>{t('Food')}</IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="ideas">
              <IonLabel>{t('Meal ideas')}</IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="workouts">
              <IonLabel>{t('Workouts')}</IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="reminders">
              <IonLabel>{t('Reminders')}</IonLabel>
            </IonSegmentButton>
          </IonSegment>
        </IonToolbar>
        <SyncStatusBar />
      </IonHeader>
      <IonContent className="ion-padding">
        <div className="trainer-page">
          {client.isPending ? (
            <div className="ion-text-center">
              <IonSpinner name="crescent" />
            </div>
          ) : !client.data ? (
            <IonText color="medium">
              <p className="ion-text-center">{t("This client isn't assigned to you.")}</p>
            </IonText>
          ) : tab === 'overview' ? (
            <Overview client={client.data} />
          ) : tab === 'stats' ? (
            <StatsView person={client.data} />
          ) : tab === 'ideas' ? (
            <ClientMealIdeasTab client={client.data} />
          ) : tab === 'progress' ? (
            <ProgressView person={client.data} editable={false} />
          ) : tab === 'summary' ? (
            <ClientSummaryTab client={client.data} />
          ) : tab === 'targets' ? (
            <TargetsTab client={client.data} />
          ) : tab === 'food' ? (
            <ClientFoodTab client={client.data} />
          ) : tab === 'workouts' ? (
            <ClientWorkoutsTab client={client.data} />
          ) : (
            <ClientRemindersTab client={client.data} />
          )}
        </div>
      </IonContent>
    </IonPage>
  );
}

function Overview({ client }: { client: Profile }) {
  const t = useT();
  const weight = useLatestWeight(client.id);
  const targets = useTargets(client.id);
  const age = ageFrom(client.date_of_birth, client.timezone);

  return (
    <>
      {!client.onboarded_at && (
        <IonText color="warning">
          <p className="trainer-note">
            {client.full_name || t('This client')}{' '}
            {t("hasn't finished onboarding yet, so some details are missing.")}
          </p>
        </IonText>
      )}
      <LastSync clientId={client.id} className="trainer-note" />
      <TargetsCard
        target={currentTarget(targets.data, client.timezone)}
        upcoming={upcomingTarget(targets.data, client.timezone)}
        emptyText={t('No targets yet – set them in the Targets tab.')}
      />
      <IonList inset style={{ margin: '16px 0' }}>
        <DetailRow label={t('Age')} value={age !== null ? `${age}` : ''} />
        <DetailRow label={t('Sex')} value={label(SEX_LABELS, client.sex)} />
        <DetailRow label={t('Height')} value={client.height_cm ? `${client.height_cm} cm` : ''} />
        <DetailRow
          label={t('Weight')}
          value={
            weight.data?.weight_kg
              ? `${weight.data.weight_kg} kg (${formatDate(weight.data.measured_on)})`
              : ''
          }
        />
        <DetailRow label={t('Goal')} value={goalText(client.goal, client.goal_other)} />
        <DetailRow label={t('Diet')} value={label(DIET_LABELS, client.diet_preference)} />
        <DetailRow label={t('Injuries')} value={client.injuries ?? ''} />
        <DetailRow label={t('Phone')} value={client.phone ?? ''} />
        <DetailRow label={t('Email')} value={client.email} />
        <DetailRow label={t('Consent given')} value={formatDate(client.consent_at)} />
        <DetailRow label={t('Joined')} value={formatDate(client.created_at)} />
      </IonList>
    </>
  );
}
