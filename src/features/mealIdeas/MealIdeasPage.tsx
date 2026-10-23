import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonPage,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/react';
import { restaurantOutline } from 'ionicons/icons';

import { EmptyState } from '../../components/EmptyState';
import { RefreshButton, SyncStatusBar } from '../../components/RefreshButton';
import { useAuth } from '../auth/useAuth';
import { useMealPlans } from './api';
import { PlanDays } from './PlanDays';
import './mealIdeas.css';
import { useT } from '../../i18n/i18n';

/** Client: the 7-day food ideas their trainer shared (read-only). */
export function MealIdeasPage() {
  const t = useT();
  const { profile } = useAuth();
  const plans = useMealPlans(profile?.id);
  const plan = plans.data?.find((p) => p.status === 'shared');
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="primary">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/food" />
          </IonButtons>
          <IonTitle>{t('Food ideas')}</IonTitle>
          <IonButtons slot="end">
            <RefreshButton />
          </IonButtons>
        </IonToolbar>
        <SyncStatusBar />
      </IonHeader>
      <IonContent className="ion-padding">
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          {plans.isPending ? (
            <div className="ion-text-center">
              <IonSpinner name="crescent" />
            </div>
          ) : !plan ? (
            <EmptyState
              icon={restaurantOutline}
              title={t('No food ideas yet')}
              text={t('Your trainer can share meal ideas for the week here.')}
            />
          ) : (
            <>
              <p className="ideas-muted">
                {t(
                  'Ideas from your trainer for 7 days, fitted to your targets. Calories and protein are estimates – swap dishes as you like and log what you actually eat.',
                )}
              </p>
              {plan.note && (
                <p className="ideas-note">
                  {t('From your trainer:')} {plan.note}
                </p>
              )}
              <PlanDays plan={plan} />
            </>
          )}
        </div>
      </IonContent>
    </IonPage>
  );
}
