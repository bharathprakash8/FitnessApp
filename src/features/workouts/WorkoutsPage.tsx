import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonContent,
  IonFooter,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
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
import { todayIn } from '../../lib/dates';
import { useAuth } from '../auth/useAuth';
import { useActivePlan, useWorkoutLogs } from './api';
import { nextDay } from './model';
import './workouts.css';

/** Client: assigned plan, next workout and all plan days. */
export function WorkoutsPage() {
  const { profile } = useAuth();
  const active = useActivePlan(profile?.id);
  const logs = useWorkoutLogs(profile?.id);
  const today = todayIn(profile?.timezone);

  const plan = active.data?.plan;
  const next = plan ? nextDay(plan.plan_days, logs.data ?? [], today) : null;

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="primary">
          <IonTitle>Workouts</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        <IonRefresher
          slot="fixed"
          onIonRefresh={(e) =>
            void Promise.all([active.refetch(), logs.refetch()]).finally(() => e.detail.complete())
          }
        >
          <IonRefresherContent />
        </IonRefresher>
        <div className="workout-page">
          {active.isPending || logs.isPending ? (
            <div className="ion-text-center">
              <IonSpinner name="crescent" />
            </div>
          ) : !plan ? (
            <IonText color="medium">
              <p className="ion-text-center">Your trainer hasn't given you a workout plan yet.</p>
            </IonText>
          ) : (
            <>
              <h2 style={{ marginTop: 0 }}>{plan.name}</h2>
              {plan.description && <p className="workout-muted">{plan.description}</p>}
              {next && (
                <IonCard className="workout-card">
                  <IonCardHeader>
                    <IonCardSubtitle>
                      {next.inProgress ? 'In progress today' : 'Next workout'}
                    </IonCardSubtitle>
                    <IonCardTitle>{next.day.title}</IonCardTitle>
                  </IonCardHeader>
                  <IonCardContent>
                    <p className="workout-muted">
                      {next.day.plan_exercises.map((pe) => pe.exercises.name).join(' · ') ||
                        'No exercises yet'}
                    </p>
                    <IonButton
                      expand="block"
                      style={{ marginTop: 12 }}
                      routerLink={`/workouts/day/${next.day.id}`}
                      disabled={next.day.plan_exercises.length === 0}
                    >
                      {next.inProgress ? 'Continue workout' : 'Start workout'}
                    </IonButton>
                  </IonCardContent>
                </IonCard>
              )}
              <IonList inset style={{ margin: '16px 0' }}>
                <IonListHeader>
                  <IonLabel>All days – pick any</IonLabel>
                </IonListHeader>
                {plan.plan_days.map((d) => (
                  <IonItem key={d.id} routerLink={`/workouts/day/${d.id}`} detail>
                    <IonLabel>
                      <h3>{d.title}</h3>
                      <p>
                        {d.plan_exercises.length} exercise
                        {d.plan_exercises.length === 1 ? '' : 's'}
                      </p>
                    </IonLabel>
                  </IonItem>
                ))}
              </IonList>
            </>
          )}
          <IonButton expand="block" fill="outline" routerLink="/workouts/history">
            History and personal bests
          </IonButton>
        </div>
      </IonContent>
      <IonFooter>
        <AppTabBar tabs={CLIENT_TABS} selected="workouts" />
      </IonFooter>
    </IonPage>
  );
}
