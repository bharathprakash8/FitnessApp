import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, useIonAlert } from '@ionic/react';

import type { MealPlan, PlanDay, PlanMeal } from './api';
import './mealIdeas.css';

const MEAL_NAMES: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  snack: 'Snack',
  dinner: 'Dinner',
};

function dayTitle(startsOn: string, day: number) {
  const d = new Date(`${startsOn}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + day - 1);
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(d);
}

/** Flags a day for the trainer: protein below 90% of target, calories outside ±10%. */
function dayFlags(d: PlanDay, plan: MealPlan) {
  const flags: string[] = [];
  if (plan.target_protein_g && d.total_protein_g < plan.target_protein_g * 0.9)
    flags.push(`protein ${d.total_protein_g} g (target ${plan.target_protein_g})`);
  if (plan.target_kcal && Math.abs(d.total_kcal - plan.target_kcal) > plan.target_kcal * 0.1)
    flags.push(`${d.total_kcal} kcal (target ${plan.target_kcal})`);
  return flags;
}

/**
 * The 7 days of a plan. With `onEditMeal` (trainer), tapping a meal opens a small form to change
 * the dish, portion, kcal or protein.
 */
export function PlanDays({
  plan,
  onEditMeal,
}: {
  plan: MealPlan;
  onEditMeal?: (dayIndex: number, mealIndex: number, meal: PlanMeal) => void;
}) {
  const [alert] = useIonAlert();

  function edit(di: number, mi: number, m: PlanMeal) {
    if (!onEditMeal) return;
    void alert({
      header: `${MEAL_NAMES[m.meal]} – ${dayTitle(plan.starts_on, di + 1)}`,
      message: 'Dish · portion · kcal · protein (g)',
      inputs: [
        {
          name: 'dish',
          value: m.dish,
          placeholder: 'Dish',
          attributes: { maxlength: 100, 'aria-label': 'Dish' },
        },
        {
          name: 'portion',
          value: m.portion,
          placeholder: 'Portion',
          attributes: { maxlength: 80, 'aria-label': 'Portion' },
        },
        {
          name: 'kcal',
          type: 'number',
          value: m.kcal,
          placeholder: 'kcal',
          attributes: { 'aria-label': 'kcal' },
        },
        {
          name: 'protein_g',
          type: 'number',
          value: m.protein_g,
          placeholder: 'Protein g',
          attributes: { 'aria-label': 'Protein in grams' },
        },
      ],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Save',
          handler: (v: Record<string, string>) => {
            const num = (x: string, max: number) =>
              Math.min(max, Math.max(0, Math.round(Number(x) || 0)));
            onEditMeal(di, mi, {
              meal: m.meal,
              dish: (v.dish ?? '').trim().slice(0, 100) || m.dish,
              portion: (v.portion ?? '').trim().slice(0, 80),
              kcal: num(v.kcal ?? '', 2500),
              protein_g: num(v.protein_g ?? '', 200),
            });
          },
        },
      ],
    });
  }

  return (
    <>
      {plan.days.map((d, di) => {
        const flags = onEditMeal ? dayFlags(d, plan) : [];
        return (
          <IonCard key={d.day} className="ideas-day">
            <IonCardHeader>
              <IonCardSubtitle>
                {dayTitle(plan.starts_on, d.day)} · ~{d.total_kcal} kcal · {d.total_protein_g} g
                protein
              </IonCardSubtitle>
            </IonCardHeader>
            <IonCardContent>
              {d.meals.map((m, mi) => (
                <button
                  key={m.meal}
                  type="button"
                  className={`ideas-meal ${onEditMeal ? 'editable' : ''}`}
                  disabled={!onEditMeal}
                  onClick={() => edit(di, mi, m)}
                >
                  <span className="ideas-meal-name">{MEAL_NAMES[m.meal]}</span>
                  <span className="ideas-dish">
                    {m.dish}
                    {m.portion ? <span className="ideas-portion"> · {m.portion}</span> : null}
                  </span>
                  <span className="ideas-nums">
                    {m.kcal} kcal · {m.protein_g} g
                  </span>
                </button>
              ))}
              {flags.length > 0 && <p className="ideas-flag">Check: {flags.join(', ')}</p>}
            </IonCardContent>
          </IonCard>
        );
      })}
    </>
  );
}
