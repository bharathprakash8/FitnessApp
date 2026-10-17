import { IonButton, IonCard, IonCardContent, IonIcon, IonSpinner } from '@ionic/react';
import { chevronBack, chevronForward } from 'ionicons/icons';
import { useState } from 'react';

import { formatDate, todayIn } from '../../lib/dates';
import type { Profile } from '../auth/roles';
import { useMealsOn } from '../food/api';
import { DayProgress } from '../food/DayProgress';
import { MealList } from '../food/MealList';
import { mealTotals, shiftDate } from '../food/model';
import { currentTarget, useTargets } from '../targets/api';
import '../food/food.css';

/** Trainer → client detail → Food: one day's meals (with photos while they exist). */
export function ClientFoodTab({ client }: { client: Profile }) {
  const tz = client.timezone;
  const today = todayIn(tz);
  const [day, setDay] = useState(today);
  const meals = useMealsOn(client.id, day);
  const targets = useTargets(client.id);

  return (
    <>
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
      {meals.isPending ? (
        <div className="ion-text-center">
          <IonSpinner name="crescent" />
        </div>
      ) : (
        <MealList meals={meals.data ?? []} timeZone={tz} emptyText="No meals logged this day." />
      )}
    </>
  );
}
