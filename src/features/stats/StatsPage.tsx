import {
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonPage,
  IonRefresher,
  IonRefresherContent,
  IonTitle,
  IonToolbar,
} from '@ionic/react';
import { useQueryClient } from '@tanstack/react-query';

import { AppTabBar } from '../../components/AppTabBar';
import { RefreshButton, SyncStatusBar } from '../../components/RefreshButton';
import { CLIENT_TABS } from '../../components/tabs';
import { useAuth } from '../auth/useAuth';
import { StatsView } from './StatsView';
import { useT } from '../../i18n/i18n';

/** Stats tab: the signed-in person's own stats (clients, and trainers for themselves). */
export function StatsPage() {
  const t = useT();
  const { profile } = useAuth();
  const qc = useQueryClient();
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="primary">
          <IonTitle>{t('Stats')}</IonTitle>
          <IonButtons slot="end">
            <RefreshButton />
          </IonButtons>
        </IonToolbar>
        <SyncStatusBar />
      </IonHeader>
      <IonContent className="ion-padding">
        <IonRefresher
          slot="fixed"
          onIonRefresh={(e) =>
            void qc.invalidateQueries({ queryKey: ['stats'] }).finally(() => e.detail.complete())
          }
        >
          <IonRefresherContent />
        </IonRefresher>
        {profile && <StatsView person={profile} />}
      </IonContent>
      <IonFooter>
        <AppTabBar tabs={CLIENT_TABS} selected="stats" />
      </IonFooter>
    </IonPage>
  );
}
