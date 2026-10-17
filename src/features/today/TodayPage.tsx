import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonPage,
  IonRefresher,
  IonRefresherContent,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/react';
import { camera } from 'ionicons/icons';

import { AppTabBar } from '../../components/AppTabBar';
import { CLIENT_TABS } from '../../components/tabs';
import { DEFAULT_TIMEZONE, todayIn } from '../../lib/dates';
import { BurnCard } from '../activity/BurnCard';
import { useAuth } from '../auth/useAuth';
import { useMealsOn } from '../food/api';
import { DayProgress } from '../food/DayProgress';
import { mealTotals } from '../food/model';
import { useMyTrainer } from '../profile/api';
import { currentTarget, upcomingTarget, useTargets } from '../targets/api';
import { TargetsCard } from '../targets/TargetsCard';
import { TodayWorkoutCard } from '../workouts/TodayWorkoutCard';

function greeting(timeZone = DEFAULT_TIMEZONE): string {
  const h = Number(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(
      new Date(),
    ),
  );
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/** Client home: food vs targets, calories burnt and net balance, today's workout. */
export function TodayPage() {
  const { profile } = useAuth();
  const tz = profile?.timezone ?? DEFAULT_TIMEZONE;
  const targets = useTargets(profile?.id);
  const meals = useMealsOn(profile?.id, todayIn(tz));
  const trainer = useMyTrainer(profile?.id);
  const firstName = (profile?.full_name || '').split(' ')[0];
  const trainerName = trainer.data?.full_name || 'Your trainer';
  const target = currentTarget(targets.data, tz);

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
          onIonRefresh={(e) =>
            void Promise.all([targets.refetch(), meals.refetch()]).finally(() =>
              e.detail.complete(),
            )
          }
        >
          <IonRefresherContent />
        </IonRefresher>
        <div style={{ maxWidth: 520, margin: '0 auto' }}>
          <h2 style={{ marginTop: 4 }}>
            {greeting(tz)}
            {firstName ? `, ${firstName}` : ''}!
          </h2>
          {targets.isPending || meals.isPending ? (
            <div className="ion-text-center">
              <IonSpinner name="crescent" />
            </div>
          ) : (
            <>
              <IonCard style={{ marginInline: 0 }}>
                <IonCardHeader>
                  <IonCardSubtitle>Food today</IonCardSubtitle>
                </IonCardHeader>
                <IonCardContent>
                  <DayProgress totals={mealTotals(meals.data ?? [])} target={target} />
                  <IonButton expand="block" style={{ marginTop: 12 }} routerLink="/food/new/photo">
                    <IonIcon slot="start" icon={camera} />
                    Log a meal
                  </IonButton>
                </IonCardContent>
              </IonCard>
              {profile && (
                <BurnCard
                  client={profile}
                  day={todayIn(tz)}
                  eatenKcal={mealTotals(meals.data ?? []).calories}
                  editable
                />
              )}
              {!target && (
                <TargetsCard
                  target={null}
                  upcoming={upcomingTarget(targets.data, tz)}
                  emptyText={`${trainerName} hasn't set your targets yet.`}
                />
              )}
            </>
          )}
          {profile && <TodayWorkoutCard profile={profile} />}
        </div>
      </IonContent>
      <IonFooter>
        <AppTabBar tabs={CLIENT_TABS} selected="today" />
      </IonFooter>
    </IonPage>
  );
}
