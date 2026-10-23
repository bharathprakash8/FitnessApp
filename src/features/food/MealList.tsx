import { IonItem, IonItemDivider, IonLabel, IonList, IonNote } from '@ionic/react';
import { restaurantOutline } from 'ionicons/icons';

import { EmptyState } from '../../components/EmptyState';
import { usePhotoUrls } from './api';
import { MEAL_LABELS, MEAL_TYPES, itemsOf, timeIn, type MealLog } from './model';
import './food.css';
import { tr, useT } from '../../i18n/i18n';

/** A day's meals grouped by meal type. `linkTo` makes rows tappable (client edit). */
export function MealList({
  meals,
  timeZone,
  linkTo,
  emptyText,
}: {
  meals: MealLog[];
  timeZone: string;
  linkTo?: (meal: MealLog) => string;
  emptyText: string;
}) {
  const tx = useT();
  const photos = usePhotoUrls(meals.filter((m) => m.photo_path).map((m) => m.photo_path!));

  if (meals.length === 0) {
    return <EmptyState icon={restaurantOutline} title={emptyText} />;
  }

  return (
    <IonList>
      {MEAL_TYPES.filter((t) => meals.some((m) => m.meal_type === t)).map((type) => {
        const list = meals.filter((m) => m.meal_type === type);
        const kcal = list.reduce((s, m) => s + m.total_calories, 0);
        return (
          <div key={type}>
            <IonItemDivider>
              <IonLabel>{tr(MEAL_LABELS[type])}</IonLabel>
              <IonNote slot="end" style={{ paddingRight: 16 }}>
                {kcal} {tx('kcal')}
              </IonNote>
            </IonItemDivider>
            {list.map((m) => {
              const url = m.photo_path ? photos.data?.[m.photo_path] : undefined;
              const names =
                itemsOf(m)
                  .map((i) => i.name)
                  .join(', ') ||
                m.input_text ||
                'Meal';
              // Saved offline and not synced yet: can't be opened until it reaches the server.
              const waiting = 'offline' in m;
              const link = waiting ? undefined : linkTo?.(m);
              return (
                <IonItem key={m.id} routerLink={link} detail={Boolean(link)} lines="full">
                  {url ? <img slot="start" src={url} alt="" className="food-meal-thumb" /> : null}
                  <IonLabel>
                    <h3>{names}</h3>
                    <p>
                      {timeIn(m.eaten_at, timeZone)} · {m.total_calories} {tx('kcal · P')}{' '}
                      {Math.round(Number(m.protein_g))} · C {Math.round(Number(m.carbs_g))} · F{' '}
                      {Math.round(Number(m.fat_g))}
                    </p>
                    <p className="food-muted">
                      {m.source === 'manual'
                        ? tx('Entered manually')
                        : m.edited
                          ? tx('Estimated, adjusted')
                          : tx('Estimated')}
                      {m.photo_deleted ? tx(' · photo deleted after 7 days') : ''}
                    </p>
                    {waiting && <p className="offline-badge">{tx('Saved offline – will sync')}</p>}
                  </IonLabel>
                </IonItem>
              );
            })}
          </div>
        );
      })}
    </IonList>
  );
}
