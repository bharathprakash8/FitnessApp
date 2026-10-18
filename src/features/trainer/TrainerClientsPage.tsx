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
import { useDashboard, useMyClients, type ClientFlag, type TrainerClient } from './api';
import './trainer.css';

export function TrainerClientsPage() {
  const { profile } = useAuth();
  const clients = useMyClients(profile?.id);
  const dashboard = useDashboard(profile?.id);
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
          onIonRefresh={(e) =>
            void Promise.all([clients.refetch(), dashboard.refetch()]).finally(() =>
              e.detail.complete(),
            )
          }
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
          <ClientList clients={clients.data} flags={dashboard.data} search={search} />
        )}
      </IonContent>
      <IonFooter>
        <AppTabBar tabs={TRAINER_TABS} selected="clients" />
      </IonFooter>
    </IonPage>
  );
}

/** Flags that mean "look at this client" (a ready summary is good news, not a problem). */
const needsAttention = (f: ClientFlag[] | undefined) => (f ?? []).some((x) => x.key !== 'summary');

function ClientList({
  clients,
  flags,
  search,
}: {
  clients: TrainerClient[];
  flags: Map<string, ClientFlag[]> | undefined;
  search: string;
}) {
  const term = search.trim().toLowerCase();
  // Clients who need attention first, then by name (the list arrives sorted by name).
  const shown = clients
    .filter(
      (c) =>
        !term ||
        [c.profile.full_name, c.profile.email].some((v) => v?.toLowerCase().includes(term)),
    )
    .sort(
      (a, b) =>
        Number(needsAttention(flags?.get(b.profile.id))) -
        Number(needsAttention(flags?.get(a.profile.id))),
    );
  const attention = clients.filter((c) => needsAttention(flags?.get(c.profile.id))).length;

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
      {flags && (
        <p className="trainer-attention">
          {attention === 0
            ? 'All clients are on track 👍'
            : `${attention} client${attention === 1 ? ' needs' : 's need'} attention`}
        </p>
      )}
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
              {p.is_active &&
                p.onboarded_at &&
                flags?.get(p.id)?.map((f) => (
                  <IonBadge key={f.key} color={f.color}>
                    {f.label}
                  </IonBadge>
                ))}
            </p>
          </IonLabel>
        </IonItem>
      ))}
    </IonList>
  );
}
