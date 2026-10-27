import { IonButton, useIonToast } from '@ionic/react';

import type { MealLog } from '../food/model';
import { suggestionOf, useResolveSuggestion } from './api';
import './coach.css';
import { useT } from '../../i18n/i18n';

/** One line under a meal in the list: checked / adjusted / suggestion waiting. */
export function MealCoachLine({ meal }: { meal: MealLog }) {
  const t = useT();
  const original = meal.coach_original as { total_calories?: number } | null;
  if (suggestionOf(meal)) {
    return <p className="coach-meal-note">{t('💡 Your coach has a suggestion – tap to see')}</p>;
  }
  if (original?.total_calories !== undefined && original.total_calories !== meal.total_calories) {
    return (
      <p className="coach-meal-note">
        {t('✓ Coach adjusted: {a} → {b} kcal', {
          a: original.total_calories,
          b: meal.total_calories,
        })}
      </p>
    );
  }
  if (meal.coach_checked_at) return <p className="coach-meal-note">{t('✓ Checked by coach')}</p>;
  return null;
}

/** Edit meal: the coach's suggested numbers with Accept / Keep mine. */
export function MealSuggestionCard({ meal }: { meal: MealLog }) {
  const t = useT();
  const resolve = useResolveSuggestion();
  const [toast] = useIonToast();
  const s = suggestionOf(meal);
  const original = meal.coach_original as { total_calories?: number } | null;
  if (!s) {
    if (meal.coach_reason && original?.total_calories !== undefined) {
      return (
        <div className="coach-suggest">
          <p>
            {t('Your coach changed this meal from {a} to {b} kcal:', {
              a: original.total_calories,
              b: meal.total_calories,
            })}{' '}
            {meal.coach_reason}
          </p>
        </div>
      );
    }
    return null;
  }
  const act = (accept: boolean) =>
    resolve
      .mutateAsync({ meal, accept })
      .catch(() =>
        toast({ message: t('Could not save'), duration: 2500, color: 'danger', position: 'top' }),
      );
  return (
    <div className="coach-suggest">
      <p>
        <strong>
          {t('Your coach suggests {b} kcal instead of {a}', {
            a: meal.total_calories,
            b: Math.round(s.total_calories),
          })}
        </strong>
      </p>
      <p>{s.reason}</p>
      <p className="coach-muted">
        {s.items.map((i) => `${i.name} (${i.portion}) ${Math.round(i.calories)}`).join(' · ')}
      </p>
      <div className="coach-suggest-buttons">
        <IonButton size="small" disabled={resolve.isPending} onClick={() => void act(true)}>
          {t('Accept')}
        </IonButton>
        <IonButton
          size="small"
          fill="outline"
          disabled={resolve.isPending}
          onClick={() => void act(false)}
        >
          {t('Keep mine')}
        </IonButton>
      </div>
    </div>
  );
}
