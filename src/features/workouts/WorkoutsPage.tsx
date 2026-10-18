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
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonPage,
  IonSelect,
  IonSelectOption,
  IonRefresher,
  IonRefresherContent,
  IonSpinner,
  IonText,
  IonTitle,
  IonToolbar,
  useIonAlert,
  useIonRouter,
  useIonToast,
} from '@ionic/react';
import { add, flash } from 'ionicons/icons';

import { AppTabBar } from '../../components/AppTabBar';
import { CLIENT_TABS } from '../../components/tabs';
import { todayIn } from '../../lib/dates';
import { useAuth } from '../auth/useAuth';
import {
  selfWorkoutApi,
  useActivePlan,
  useMyPlans,
  useSetPlanClients,
  useSelfWorkoutMutation,
  useSelfWorkouts,
  useWorkoutLogs,
} from './api';
import { nextDay } from './model';
import './workouts.css';

/** Client: assigned plan, next workout and all plan days. */
export function WorkoutsPage() {
  const { profile } = useAuth();
  const active = useActivePlan(profile?.id);
  const logs = useWorkoutLogs(profile?.id);
  const mine = useSelfWorkouts(profile?.id);
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
            void Promise.all([active.refetch(), logs.refetch(), mine.refetch()]).finally(() =>
              e.detail.complete(),
            )
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
            profile?.role === 'trainer' ? (
              <MyPlanPicker />
            ) : (
              <IonText color="medium">
                <p className="ion-text-center">Your trainer hasn't given you a workout plan yet.</p>
              </IonText>
            )
          ) : (
            <>
              <h2 style={{ marginTop: 0 }}>{plan.name}</h2>
              {profile?.role === 'trainer' && <MyPlanPicker current={plan.id} />}
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
          <MyWorkouts />
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

/** Workouts the person saved for themselves, plus a quick log. Logged as "Self". */
function MyWorkouts() {
  const { profile } = useAuth();
  const workouts = useSelfWorkouts(profile?.id);
  const router = useIonRouter();
  const [alert] = useIonAlert();
  const [toast] = useIonToast();
  const create = useSelfWorkoutMutation(profile?.id, (name: string) =>
    selfWorkoutApi.create(name).then((id) => router.push(`/workouts/mine/${id}`)),
  );

  function newWorkout() {
    void alert({
      header: 'New workout',
      message: 'Give it a name, then add exercises from the library.',
      inputs: [{ name: 'v', placeholder: 'e.g. Home legs', attributes: { maxlength: 60 } }],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Create',
          handler: (data: { v?: string }) => {
            const v = (data.v ?? '').trim();
            if (!v) return false;
            create.mutate(v, {
              onError: (err) =>
                void toast({
                  message:
                    err instanceof Error && err.message.includes('up to 10')
                      ? err.message
                      : 'Could not create the workout. Try again.',
                  duration: 3000,
                  color: 'danger',
                }),
            });
            return true;
          },
        },
      ],
    });
  }

  return (
    <IonList inset style={{ margin: '16px 0' }}>
      <IonListHeader>
        <IonLabel>My workouts (logged as Self)</IonLabel>
      </IonListHeader>
      {(workouts.data ?? []).map((w) => (
        <IonItem
          key={w.id}
          // An empty workout opens the editor; otherwise go straight to logging it.
          routerLink={
            w.self_workout_exercises.length ? `/workouts/self/${w.id}` : `/workouts/mine/${w.id}`
          }
          detail
        >
          <IonLabel>
            <h3>{w.name}</h3>
            <p>
              {w.self_workout_exercises.length} exercise
              {w.self_workout_exercises.length === 1 ? '' : 's'}
            </p>
          </IonLabel>
        </IonItem>
      ))}
      <IonItem button detail={false} onClick={newWorkout} disabled={create.isPending}>
        <IonIcon slot="start" icon={add} />
        <IonLabel>Create a workout</IonLabel>
      </IonItem>
      <IonItem routerLink="/workouts/self/quick" detail={false} lines="none">
        <IonIcon slot="start" icon={flash} />
        <IonLabel>
          <h3>Quick log</h3>
          <p>Log any exercise without saving a workout</p>
        </IonLabel>
      </IonItem>
    </IonList>
  );
}

const NO_PLAN = 'none';

/** Trainer → My fitness: follow one of your own plans (or none). */
function MyPlanPicker({ current }: { current?: string }) {
  const { profile } = useAuth();
  const plans = useMyPlans(profile?.id);
  const [toast] = useIonToast();
  const value = current ?? NO_PLAN;
  const setPlan = useSetPlanClients(current ?? '');

  async function change(planId: string) {
    if (!profile || planId === value) return;
    try {
      // Following a plan ends the previous one automatically; "No plan" ends the current one.
      if (planId === NO_PLAN) await setPlan.mutateAsync({ add: [], remove: [profile.id] });
      else await setPlan.mutateAsync({ planId, add: [profile.id], remove: [] });
    } catch {
      void toast({ message: 'Could not change the plan', duration: 2500, color: 'danger' });
    }
  }

  if (plans.isPending) return null;
  if ((plans.data ?? []).length === 0) {
    return (
      <IonText color="medium">
        <p className="ion-text-center">
          Build a plan in the Plans tab, then follow it here – or use My workouts below.
        </p>
      </IonText>
    );
  }
  return (
    <IonSelect
      fill="outline"
      label={current ? 'Change my plan' : 'Follow one of my plans'}
      labelPlacement="stacked"
      interface="action-sheet"
      interfaceOptions={{ header: 'Choose a plan' }}
      value={value}
      onIonChange={(e) => void change(String(e.detail.value))}
      style={{ margin: '8px 0 16px' }}
    >
      <IonSelectOption value={NO_PLAN}>No plan</IonSelectOption>
      {(plans.data ?? []).map((p) => (
        <IonSelectOption key={p.id} value={p.id}>
          {p.name}
        </IonSelectOption>
      ))}
    </IonSelect>
  );
}
