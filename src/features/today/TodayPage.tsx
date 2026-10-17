import {
  IonContent,
  IonFooter,
  IonHeader,
  IonPage,
  IonRefresher,
  IonRefresherContent,
  IonSpinner,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/react';

import { AppTabBar } from '../../components/AppTabBar';
import { CLIENT_TABS } from '../../components/tabs';
import { DEFAULT_TIMEZONE } from '../../lib/dates';
import { useAuth } from '../auth/useAuth';
import { useMyTrainer } from '../profile/api';
import { currentTarget, upcomingTarget, useTargets } from '../targets/api';
import { TargetsCard } from '../targets/TargetsCard';

function greeting(timeZone = DEFAULT_TIMEZONE): string {
  const h = Number(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(
      new Date(),
    ),
  );
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/** Client home. Food, burn and workout cards arrive in later milestones. */
export function TodayPage() {
  const { profile } = useAuth();
  const targets = useTargets(profile?.id);
  const trainer = useMyTrainer(profile?.id);
  const tz = profile?.timezone;
  const firstName = (profile?.full_name || '').split(' ')[0];
  const trainerName = trainer.data?.full_name || 'Your trainer';

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="primary">
          <IonTitle>Today</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        <IonRefresher
          slot="fixed"
          onIonRefresh={(e) => void targets.refetch().finally(() => e.detail.complete())}
        >
          <IonRefresherContent />
        </IonRefresher>
        <div style={{ maxWidth: 520, margin: '0 auto' }}>
          <h2 style={{ marginTop: 4 }}>
            {greeting(tz)}
            {firstName ? `, ${firstName}` : ''}!
          </h2>
          {targets.isPending ? (
            <div className="ion-text-center">
              <IonSpinner name="crescent" />
            </div>
          ) : (
            <TargetsCard
              target={currentTarget(targets.data, tz)}
              upcoming={upcomingTarget(targets.data, tz)}
              emptyText={`${trainerName} hasn't set your targets yet.`}
            />
          )}
          <IonText color="medium">
            <p style={{ fontSize: '0.9rem' }}>
              Food logging, workouts and calories burnt are coming soon.
            </p>
          </IonText>
        </div>
      </IonContent>
      <IonFooter>
        <AppTabBar tabs={CLIENT_TABS} selected="today" />
      </IonFooter>
    </IonPage>
  );
}
