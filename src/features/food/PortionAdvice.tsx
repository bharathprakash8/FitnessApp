import { IonButton } from '@ionic/react';

import { useT } from '../../i18n/i18n';
import type { PortionAdvice as Advice } from './api';
import './food.css';

/** "How much should I eat?": a suggested portion of the plate in the photo. Always an estimate. */
export function PortionAdvice({
  advice,
  onLogSuggested,
  onLogPlate,
}: {
  advice: Advice;
  onLogSuggested: () => void;
  onLogPlate: () => void;
}) {
  const t = useT();
  const foods = advice.add_protein_foods.join(', ');
  return (
    <div className="portion">
      <span className="food-estimated">{t('Estimated')}</span>
      <h2>{advice.eat_all ? t('You can eat all of this') : t('Suggested portion')}</h2>
      <ul className="portion-items">
        {advice.items.map((i, n) => (
          <li key={`${i.name}-${n}`} className={i.reduced ? 'portion-reduced' : undefined}>
            <strong>{i.name}</strong>
            <span>{i.portion}</span>
          </li>
        ))}
      </ul>
      <p className="portion-total">
        {t('About {kcal} kcal, {protein} g protein', {
          kcal: advice.suggested_kcal,
          protein: advice.suggested_protein_g,
        })}
      </p>
      {!advice.eat_all && (
        <p className="food-muted">
          {t('Your full plate is about {kcal} kcal.', { kcal: advice.plate_kcal })}
        </p>
      )}
      <p className="food-muted">
        {t('This leaves about {kcal} kcal for the rest of today.', {
          kcal: advice.left_after_kcal,
        })}
      </p>
      {foods && (
        <p className="portion-tip">
          {t('This meal is light on protein. Add some {foods} if you can.', { foods })}
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
      {advice.caution && (
        <p className="food-muted">
          {t('This is a general guide. Please follow what your doctor has told you about food.')}
        </p>
      )}
      <IonButton expand="block" size="large" onClick={onLogSuggested}>
        {advice.eat_all ? t('Log this meal') : t('Log this portion')}
      </IonButton>
      {!advice.eat_all && (
        <IonButton expand="block" fill="outline" onClick={onLogPlate}>
          {t('I ate the full plate')}
        </IonButton>
      )}
      <p className="food-muted ion-text-center">{t('You can change the amounts before saving.')}</p>
    </div>
  );
}
