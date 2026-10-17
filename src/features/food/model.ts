import type { Tables } from '../../lib/database.types';

export type MealType = 'breakfast' | 'lunch' | 'snack' | 'dinner';
export type MealSource = 'photo' | 'text' | 'manual';
export type MealLog = Tables<'meal_logs'>;

export interface MealItem {
  name: string;
  portion: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  confidence: 'high' | 'medium' | 'low' | 'manual';
}

export const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'snack', 'dinner'];

export const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  snack: 'Snack',
  dinner: 'Dinner',
};

/** Breakfast before 11:00, lunch until 16:00, snack until 19:00, then dinner. */
export function mealTypeForHour(hour: number): MealType {
  if (hour < 11) return 'breakfast';
  if (hour < 16) return 'lunch';
  if (hour < 19) return 'snack';
  return 'dinner';
}

/** Current local date (YYYY-MM-DD) and time (HH:MM) in a time zone. */
export function nowIn(timeZone: string): { date: string; time: string; hour: number } {
  const now = new Date();
  const date = new Intl.DateTimeFormat('en-CA', { timeZone }).format(now);
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(now);
  return { date, time, hour: Number(time.slice(0, 2)) };
}

/** Local date + time in a time zone → UTC ISO string. */
export function localToIso(date: string, time: string, timeZone: string): string {
  // Start from the wall-clock time as if it were UTC, then correct by the zone's offset.
  const guess = new Date(`${date}T${time}:00Z`);
  const shown = new Date(guess.toLocaleString('en-US', { timeZone }));
  const asUtc = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' }));
  return new Date(guess.getTime() - (shown.getTime() - asUtc.getTime())).toISOString();
}

/** HH:MM of an instant in a time zone. */
export function timeIn(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function scaleItem(item: MealItem, factor: number): MealItem {
  return {
    ...item,
    calories: Math.round(item.calories * factor),
    protein_g: r1(item.protein_g * factor),
    carbs_g: r1(item.carbs_g * factor),
    fat_g: r1(item.fat_g * factor),
  };
}

export interface Totals {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export function totalsOf(items: MealItem[]): Totals {
  return items.reduce<Totals>(
    (t, i) => ({
      calories: t.calories + Math.round(Number(i.calories) || 0),
      protein_g: r1(t.protein_g + (Number(i.protein_g) || 0)),
      carbs_g: r1(t.carbs_g + (Number(i.carbs_g) || 0)),
      fat_g: r1(t.fat_g + (Number(i.fat_g) || 0)),
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );
}

export function mealTotals(meals: MealLog[]): Totals {
  return meals.reduce<Totals>(
    (t, m) => ({
      calories: t.calories + m.total_calories,
      protein_g: r1(t.protein_g + Number(m.protein_g)),
      carbs_g: r1(t.carbs_g + Number(m.carbs_g)),
      fat_g: r1(t.fat_g + Number(m.fat_g)),
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );
}

export function itemsOf(meal: Pick<MealLog, 'items'>): MealItem[] {
  return Array.isArray(meal.items) ? (meal.items as unknown as MealItem[]) : [];
}

export function emptyItem(): MealItem {
  return {
    name: '',
    portion: '',
    calories: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    confidence: 'manual',
  };
}

/** Add or subtract days from a YYYY-MM-DD date. */
export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
