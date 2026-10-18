import {
  IonButtons,
  IonButton,
  IonCard,
  IonCardContent,
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
import { camera, chevronBack, chevronForward, create, text } from 'ionicons/icons';
import { useState } from 'react';

import { RefreshButton, SyncStatusBar } from '../../components/RefreshButton';
import { AppTabBar } from '../../components/AppTabBar';
import { CLIENT_TABS } from '../../components/tabs';
import { DEFAULT_TIMEZONE, formatDate, todayIn } from '../../lib/dates';
import { useAuth } from '../auth/useAuth';
import { currentTarget, useTargets } from '../targets/api';
import { useMealsOn } from './api';
import { DayProgress } from './DayProgress';
import { MealList } from './MealList';
import { mealTotals, shiftDate } from './model';
import './food.css';

/** Client: a day's meals, totals vs target, and the three ways to log food. */
export function FoodPage() {
  const { profile } = useAuth();
  const tz = profile?.timezone ?? DEFAULT_TIMEZONE;
  const today = todayIn(tz);
  const [day, setDay] = useState(today);
  const meals = useMealsOn(profile?.id, day);
  const targets = useTargets(profile?.id);

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="primary">
          <IonTitle>Food</IonTitle>
          <IonButtons slot="end">
            <RefreshButton />
          </IonButtons>
        </IonToolbar>
        <SyncStatusBar />
      </IonHeader>
      <IonContent className="ion-padding">
        <IonRefresher
          slot="fixed"
          onIonRefresh={(e) => void meals.refetch().finally(() => e.detail.complete())}
        >
          <IonRefresherContent />
        </IonRefresher>
        <div className="food-page">
          <div className="food-day-switch">
            <IonButton
              fill="clear"
              aria-label="Previous day"
              onClick={() => setDay(shiftDate(day, -1))}
            >
              <IonIcon icon={chevronBack} />
            </IonButton>
            <strong>{day === today ? 'Today' : formatDate(day)}</strong>
            <IonButton
              fill="clear"
              aria-label="Next day"
              disabled={day >= today}
              onClick={() => setDay(shiftDate(day, 1))}
            >
              <IonIcon icon={chevronForward} />
            </IonButton>
          </div>

          <IonCard style={{ margin: '0 0 8px' }}>
            <IonCardContent>
              <DayProgress
                totals={mealTotals(meals.data ?? [])}
                target={currentTarget(targets.data, tz)}
              />
            </IonCardContent>
          </IonCard>

          <div className="food-add">
            <IonButton routerLink={`/food/new/photo?day=${day}`}>
              <IonIcon slot="start" icon={camera} />
              Photo
            </IonButton>
            <IonButton fill="outline" routerLink={`/food/new/text?day=${day}`}>
              <IonIcon slot="start" icon={text} />
              Type
            </IonButton>
            <IonButton fill="outline" routerLink={`/food/new/manual?day=${day}`}>
              <IonIcon slot="start" icon={create} />
              Manual
            </IonButton>
          </div>

          {meals.isPending ? (
            <div className="ion-text-center">
              <IonSpinner name="crescent" />
            </div>
          ) : (
            <MealList
              meals={meals.data ?? []}
              timeZone={tz}
              linkTo={(m) => `/food/meal/${m.id}`}
              emptyText="Nothing logged for this day yet."
            />
          )}
        </div>
      </IonContent>
      <IonFooter>
        <AppTabBar tabs={CLIENT_TABS} selected="food" />
      </IonFooter>
    </IonPage>
  );
}
