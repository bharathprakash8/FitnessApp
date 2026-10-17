export type Sex = 'male' | 'female' | 'unspecified';
export type Goal = 'lose_weight' | 'build_muscle' | 'get_fitter' | 'maintain' | 'other';
export type Diet = 'veg' | 'egg' | 'non_veg' | 'vegan';

export const SEX_LABELS: Record<Sex, string> = {
  male: 'Male',
  female: 'Female',
  unspecified: 'Prefer not to say',
};

export const GOAL_LABELS: Record<Goal, string> = {
  lose_weight: 'Lose weight',
  build_muscle: 'Build muscle',
  get_fitter: 'Get fitter / more stamina',
  maintain: 'Maintain weight',
  other: 'Other',
};

export const DIET_LABELS: Record<Diet, string> = {
  veg: 'Vegetarian',
  egg: 'Eggetarian',
  non_veg: 'Non-vegetarian',
  vegan: 'Vegan',
};

export function goalText(goal: string | null, other: string | null): string {
  if (!goal) return '';
  if (goal === 'other') return other ? `Other: ${other}` : 'Other';
  return GOAL_LABELS[goal as Goal] ?? goal;
}

export function label<T extends string>(labels: Record<T, string>, value: string | null): string {
  return value ? (labels[value as T] ?? value) : '';
}
