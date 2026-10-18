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
import { useState } from 'react';
import { useParams } from 'react-router-dom';

import { DetailRow } from '../../components/DetailRow';
import { ageFrom, formatDate } from '../../lib/dates';
import type { Profile } from '../auth/roles';
import { useLatestWeight, useProfileById } from '../profile/api';
import { DIET_LABELS, SEX_LABELS, goalText, label } from '../profile/options';
import { currentTarget, upcomingTarget, useTargets } from '../targets/api';
import { TargetsCard } from '../targets/TargetsCard';
import { ClientFoodTab } from './ClientFoodTab';
import { ClientRemindersTab } from './ClientRemindersTab';
import { ClientWorkoutsTab } from './ClientWorkoutsTab';
import { TargetsTab } from './TargetsTab';
import './trainer.css';

type Tab = 'overview' | 'targets' | 'food' | 'workouts' | 'reminders';

export function TrainerClientPage() {
  const { id } = useParams<{ id: string }>();
  const client = useProfileById(id);
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
        </IonToolbar>
        <IonToolbar>
          <IonSegment scrollable value={tab} onIonChange={(e) => setTab(e.detail.value as Tab)}>
            <IonSegmentButton value="overview">
              <IonLabel>Overview</IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="targets">
              <IonLabel>Targets</IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="food">
              <IonLabel>Food</IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="workouts">
              <IonLabel>Workouts</IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="reminders">
              <IonLabel>Reminders</IonLabel>
            </IonSegmentButton>
          </IonSegment>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        <div className="trainer-page">
          {client.isPending ? (
            <div className="ion-text-center">
              <IonSpinner name="crescent" />
            </div>
          ) : !client.data ? (
            <IonText color="medium">
              <p className="ion-text-center">This client isn't assigned to you.</p>
            </IonText>
          ) : tab === 'overview' ? (
            <Overview client={client.data} />
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
  const weight = useLatestWeight(client.id);
  const targets = useTargets(client.id);
  const age = ageFrom(client.date_of_birth, client.timezone);

  return (
    <>
      {!client.onboarded_at && (
        <IonText color="warning">
          <p className="trainer-note">
            {client.full_name || 'This client'} hasn't finished onboarding yet, so some details are
            missing.
          </p>
        </IonText>
      )}
      <TargetsCard
        target={currentTarget(targets.data, client.timezone)}
        upcoming={upcomingTarget(targets.data, client.timezone)}
        emptyText="No targets yet – set them in the Targets tab."
      />
      <IonList inset style={{ margin: '16px 0' }}>
        <DetailRow label="Age" value={age !== null ? `${age}` : ''} />
        <DetailRow label="Sex" value={label(SEX_LABELS, client.sex)} />
        <DetailRow label="Height" value={client.height_cm ? `${client.height_cm} cm` : ''} />
        <DetailRow
          label="Weight"
          value={
            weight.data?.weight_kg
              ? `${weight.data.weight_kg} kg (${formatDate(weight.data.measured_on)})`
              : ''
          }
        />
        <DetailRow label="Goal" value={goalText(client.goal, client.goal_other)} />
        <DetailRow label="Diet" value={label(DIET_LABELS, client.diet_preference)} />
        <DetailRow label="Injuries" value={client.injuries ?? ''} />
        <DetailRow label="Phone" value={client.phone ?? ''} />
        <DetailRow label="Email" value={client.email} />
        <DetailRow label="Consent given" value={formatDate(client.consent_at)} />
        <DetailRow label="Joined" value={formatDate(client.created_at)} />
      </IonList>
    </>
  );
}
