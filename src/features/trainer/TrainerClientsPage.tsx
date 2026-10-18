import {
  IonButtons,
  IonBadge,
  IonContent,
  IonFooter,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonPage,
  IonRefresher,
  IonRefresherContent,
  IonSearchbar,
  IonSpinner,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/react';
import { useState } from 'react';

import { RefreshButton, SyncStatusBar } from '../../components/RefreshButton';
import { AppTabBar } from '../../components/AppTabBar';
import { TRAINER_TABS } from '../../components/tabs';
import { useAuth } from '../auth/useAuth';
import { goalText } from '../profile/options';
import { useMyClients, type TrainerClient } from './api';

export function TrainerClientsPage() {
  const { profile } = useAuth();
  const clients = useMyClients(profile?.id);
  const [search, setSearch] = useState('');

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="primary">
          <IonTitle>My clients</IonTitle>
          <IonButtons slot="end">
            <RefreshButton />
          </IonButtons>
        </IonToolbar>
        <IonToolbar>
          <IonSearchbar
            value={search}
            onIonInput={(e) => setSearch(String(e.detail.value ?? ''))}
            placeholder="Search clients"
            debounce={150}
          />
        </IonToolbar>
        <SyncStatusBar />
      </IonHeader>
      <IonContent>
        <IonRefresher
          slot="fixed"
          onIonRefresh={(e) => void clients.refetch().finally(() => e.detail.complete())}
        >
          <IonRefresherContent />
        </IonRefresher>
        {clients.isPending ? (
          <div className="ion-padding ion-text-center">
            <IonSpinner name="crescent" />
          </div>
        ) : clients.isError ? (
          <IonText color="danger">
            <p className="ion-padding ion-text-center">
              Couldn't load your clients. Pull down to try again.
            </p>
          </IonText>
        ) : (
          <ClientList clients={clients.data} search={search} />
        )}
      </IonContent>
      <IonFooter>
        <AppTabBar tabs={TRAINER_TABS} selected="clients" />
      </IonFooter>
    </IonPage>
  );
}

function ClientList({ clients, search }: { clients: TrainerClient[]; search: string }) {
  const term = search.trim().toLowerCase();
  const shown = clients.filter(
    (c) =>
      !term || [c.profile.full_name, c.profile.email].some((v) => v?.toLowerCase().includes(term)),
  );

  if (clients.length === 0) {
    return (
      <IonText color="medium">
        <p className="ion-padding ion-text-center">
          You don't have any clients yet. The admin assigns clients to you.
        </p>
      </IonText>
    );
  }
  if (shown.length === 0) {
    return (
      <IonText color="medium">
        <p className="ion-padding ion-text-center">No clients match.</p>
      </IonText>
    );
  }

  return (
    <IonList>
      {shown.map(({ profile: p, hasTarget }) => (
        <IonItem key={p.id} routerLink={`/trainer/clients/${p.id}`} detail>
          <IonLabel>
            <h2>{p.full_name || p.email}</h2>
            <p>{goalText(p.goal, p.goal_other) || p.email}</p>
            <p className="trainer-flags">
              {!p.is_active && <IonBadge color="medium">Deactivated</IonBadge>}
              {p.is_active && !p.onboarded_at && (
                <IonBadge color="warning">Onboarding not finished</IonBadge>
              )}
              {p.is_active && p.onboarded_at && !hasTarget && (
                <IonBadge color="danger">No targets yet</IonBadge>
              )}
            </p>
          </IonLabel>
        </IonItem>
      ))}
    </IonList>
  );
}
