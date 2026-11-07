import { IonButton } from '@ionic/react';
import { useState } from 'react';

import { useT } from '../../i18n/i18n';
import type { PortionAdvice as Advice, PortionPlan } from './api';
import './food.css';

const LABELS = { kcal: 'Calories', protein: 'Protein', carbs: 'Carbs', fat: 'Fat' } as const;
const UNITS = { kcal: 'kcal', protein: 'g', carbs: 'g', fat: 'g' } as const;

/** "How much should I eat?": portions of this food, planned across the day. Always an estimate. */
export function PortionAdvice({
  advice,
  onLog,
  onLogPlate,
}: {
  advice: Advice;
  onLog: (plan: PortionPlan) => void;
  onLogPlate: () => void;
}) {
  const t = useT();
  const [adding, setAdding] = useState(false);
  const plan: PortionPlan = adding && advice.boost ? advice.boost : advice.plan;
  const adds = advice.boost?.items.filter((i) => i.added) ?? [];
  const last = advice.is_last_meal;
  const heading = plan.on_track
    ? last
      ? t('This finishes your day on target')
      : t('Your portion for this meal')
    : t('The closest portion with this food');

  return (
    <div className="portion">
      <span className="food-estimated">{t('Estimated')}</span>
      <h2>{heading}</h2>
      <ul className="portion-items">
        {plan.items.map((i) => (
          <li
            key={i.name}
            className={
              i.added ? 'portion-added' : i.reduced || i.increased ? 'portion-changed' : undefined
            }
          >
            <strong>
              {i.added ? `${t('Add')}: ` : ''}
              {i.name}
            </strong>
            <span>{i.portion}</span>
          </li>
        ))}
      </ul>

      <p className="portion-total">
        {last ? t('Today’s total after this meal') : t('Today so far, after this meal')}
      </p>
      <div className="portion-checks">
        {plan.checks.map((c) => (
          <div key={c.key} className={`portion-check portion-${c.status}`}>
            <span>{t(LABELS[c.key])}</span>
            <span>
              {t('{after} of {target} {unit}', {
                after: c.after,
                target: c.target,
                unit: UNITS[c.key],
              })}
            </span>
            <span className="portion-note">
              {c.status === 'high'
                ? t('Above range')
                : c.status === 'low'
                  ? last
                    ? t('Below range')
                    : t('Low for this meal')
                  : t('On track')}
            </span>
          </div>
        ))}
      </div>

      {advice.boost && !adding && (
        <div className="portion-tip">
          <p>
            {t('This food alone won’t get you there. It helps to add:')}{' '}
            <strong>{adds.map((a) => `${a.name} (${a.portion})`).join(', ')}</strong>
          </p>
          <IonButton size="small" fill="outline" onClick={() => setAdding(true)}>
            {t('I can add these')}
          </IonButton>
        </div>
      )}
      {advice.boost && adding && (
        <IonButton size="small" fill="clear" onClick={() => setAdding(false)}>
          {t('I can’t add these')}
        </IonButton>
      )}
      {!plan.on_track && last && (
        <p className="portion-tip">
          {t(
            'Today can’t fully reach your targets with this food. Log what you eat, and tell your trainer if this keeps happening.',
          )}
        </p>
      )}

      <p className="food-muted">
        {advice.meals_logged_today > 0
          ? t(
              'Based on {kcal} kcal logged so far today. Log your other meals to keep this right.',
              {
                kcal: advice.eaten_today_kcal,
              },
            )
          : t(
              'No meals logged today yet. If you have already eaten, log that first to keep this right.',
            )}
      </p>
      {advice.targets_filled_in && (
        <p className="food-muted">
          {t('Your trainer hasn’t set all your targets, so a typical split is used for the rest.')}
        </p>
      )}
      {!advice.targets_add_up && (
        <p className="food-muted">
          {t(
            'Your calorie and protein, carbs and fat targets don’t add up, so they can’t all be reached. Please ask your trainer to check them.',
          )}
        </p>
      )}
      {advice.caution && (
        <p className="food-muted">
          {t('This is a general guide. Please follow what your doctor has told you about food.')}
        </p>
      )}
      <p className="food-muted">{t('Home recipes vary, so these numbers are close, not exact.')}</p>

      <IonButton expand="block" size="large" onClick={() => onLog(plan)}>
        {t('Log this portion')}
      </IonButton>
      <IonButton expand="block" fill="outline" onClick={onLogPlate}>
        {t('I ate what is in the photo')}
      </IonButton>
      <p className="food-muted ion-text-center">{t('You can change the amounts before saving.')}</p>
    </div>
  );
}
