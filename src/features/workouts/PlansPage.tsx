import {
  IonButton,
  IonButtons,
  IonContent,
  IonFab,
  IonFabButton,
  IonFooter,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonPage,
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
import { add, barbellOutline } from 'ionicons/icons';
import { useQueryClient } from '@tanstack/react-query';

import { AppTabBar } from '../../components/AppTabBar';
import { TRAINER_TABS } from '../../components/tabs';
import { formatDate } from '../../lib/dates';
import { useAuth } from '../auth/useAuth';
import { planApi, useMyPlans } from './api';
import './workouts.css';

export function PlansPage() {
  const { profile } = useAuth();
  const plans = useMyPlans(profile?.id);
  const router = useIonRouter();
  const qc = useQueryClient();
  const [alert] = useIonAlert();
  const [toast] = useIonToast();

  function newPlan() {
    void alert({
      header: 'New plan',
      inputs: [
        { name: 'name', placeholder: 'e.g. 3-day full body', attributes: { maxlength: 80 } },
      ],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Create',
          handler: (data: { name?: string }) => {
            const name = (data.name ?? '').trim();
            if (!name || !profile) return false;
            planApi
              .create(profile.id, name)
              .then((id) => {
                void qc.invalidateQueries({ queryKey: ['plans'] });
                router.push(`/trainer/plans/${id}`);
              })
              .catch(() =>
                toast({ message: 'Could not create the plan', duration: 2500, color: 'danger' }),
              );
            return true;
          },
        },
      ],
    });
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="primary">
          <IonTitle>Workout plans</IonTitle>
          <IonButtons slot="end">
            <IonButton routerLink="/trainer/exercises">
              <IonIcon slot="start" icon={barbellOutline} />
              Exercises
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <IonRefresher
          slot="fixed"
          onIonRefresh={(e) => void plans.refetch().finally(() => e.detail.complete())}
        >
          <IonRefresherContent />
        </IonRefresher>
        {plans.isPending ? (
          <div className="ion-padding ion-text-center">
            <IonSpinner name="crescent" />
          </div>
        ) : (plans.data ?? []).length === 0 ? (
          <IonText color="medium">
            <p className="ion-padding ion-text-center">
              No plans yet. Tap + to build your first plan.
            </p>
          </IonText>
        ) : (
          <IonList>
            {plans.data!.map((p) => (
              <IonItem key={p.id} routerLink={`/trainer/plans/${p.id}`} detail>
                <IonLabel>
                  <h2>{p.name}</h2>
                  <p>
                    {p.dayCount} day{p.dayCount === 1 ? '' : 's'} · {p.activeClients} client
                    {p.activeClients === 1 ? '' : 's'} · updated {formatDate(p.updated_at)}
                  </p>
                </IonLabel>
              </IonItem>
            ))}
          </IonList>
        )}
        <IonFab slot="fixed" vertical="bottom" horizontal="end">
          <IonFabButton onClick={newPlan} aria-label="New plan">
            <IonIcon icon={add} />
          </IonFabButton>
        </IonFab>
      </IonContent>
      <IonFooter>
        <AppTabBar tabs={TRAINER_TABS} selected="plans" />
      </IonFooter>
    </IonPage>
  );
}
