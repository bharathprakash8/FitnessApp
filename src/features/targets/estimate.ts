import type { Goal, Sex } from '../profile/options';

export type Activity = 'sedentary' | 'light' | 'moderate' | 'very';

export const ACTIVITY_LABELS: Record<Activity, string> = {
  sedentary: 'Mostly sitting',
  light: 'Light exercise 1–3 days/week',
  moderate: 'Exercise 3–5 days/week',
  very: 'Hard exercise 6–7 days/week',
};

const ACTIVITY_FACTOR: Record<Activity, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very: 1.725,
};

export interface Macros {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

const round = (n: number, step: number) => Math.round(n / step) * step;

/**
 * A starting point for the trainer (Mifflin-St Jeor + activity factor + goal),
 * always shown as "Estimated" and editable. Returns null if details are missing.
 */
export function estimateTargets(input: {
  weightKg: number | null;
  heightCm: number | null;
  age: number | null;
  sex: Sex | null;
  goal: Goal | null;
  activity: Activity;
}): Macros | null {
  const { weightKg: w, heightCm: h, age, sex, goal, activity } = input;
  if (!w || !h || !age) return null;

  const sexOffset = sex === 'male' ? 5 : sex === 'female' ? -161 : -78;
  const bmr = 10 * w + 6.25 * h - 5 * age + sexOffset;
  let calories = bmr * ACTIVITY_FACTOR[activity];
  if (goal === 'lose_weight') calories -= 500;
  if (goal === 'build_muscle') calories += 250;
  calories = Math.max(1200, round(calories, 50));

  const proteinPerKg = goal === 'lose_weight' || goal === 'build_muscle' ? 1.8 : 1.4;
  const protein_g = round(w * proteinPerKg, 5);
  const fat_g = round((calories * 0.25) / 9, 5);
  const carbs_g = Math.max(0, round((calories - protein_g * 4 - fat_g * 9) / 4, 5));
  return { calories, protein_g, carbs_g, fat_g };
}

/** Calories implied by the macros (4/4/9 kcal per gram). */
export function macroCalories(m: Omit<Macros, 'calories'>): number {
  return m.protein_g * 4 + m.carbs_g * 4 + m.fat_g * 9;
}

/** True when macros are more than 10% away from the calorie target. */
export function macrosMismatch(m: Macros): boolean {
  if (!m.calories) return false;
  return Math.abs(macroCalories(m) - m.calories) > m.calories * 0.1;
}
