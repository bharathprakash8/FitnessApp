// "How much should I eat?": a suggested portion of the plate in the photo. The AI only reads the
// plate; the amounts are worked out here, so the limits below always hold.
export type MealType = 'breakfast' | 'lunch' | 'snack' | 'dinner';

export interface PlateItem {
  name: string;
  portion: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  confidence: 'high' | 'medium' | 'low';
  /** On the plate, in household units (2 chapati, 1 katori); 0 if it can't be counted. */
  count: number;
  unit: string;
  grams: number;
}

export interface PortionInput {
  mealType: MealType;
  targetKcal: number;
  targetProtein: number;
  eatenKcal: number;
  sex: string | null;
  diet: string | null;
  foodsToAvoid: string | null;
}

/** A normal share of the day for each meal, the most one meal may take, and the least. */
const MEALS: Record<MealType, { share: number; cap: number; min: number }> = {
  breakfast: { share: 0.25, cap: 0.35, min: 300 },
  lunch: { share: 0.35, cap: 0.45, min: 300 },
  snack: { share: 0.1, cap: 0.2, min: 100 },
  dinner: { share: 0.3, cap: 0.5, min: 300 },
};
const ORDER: MealType[] = ['breakfast', 'lunch', 'snack', 'dinner'];

/** The day's calories are never treated as lower than this, so we don't encourage under-eating. */
export const calorieFloor = (sex: string | null) => (sex === 'female' ? 1200 : 1500);

export function mealBudget(input: PortionInput) {
  const day = Math.max(input.targetKcal, calorieFloor(input.sex));
  const m = MEALS[input.mealType];
  const later = ORDER.slice(ORDER.indexOf(input.mealType)).reduce((s, t) => s + MEALS[t].share, 0);
  const fair = (Math.max(0, day - input.eatenKcal) * m.share) / later;
  return Math.round(Math.max(m.min, Math.min(fair, day * m.cap)));
}

const halves = (n: number) => Math.round(n * 2) / 2;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Protein foods and light sides stay whole; the rest of the plate is reduced first. */
const isKept = (i: PlateItem) =>
  i.calories <= 60 || (i.calories > 0 && (i.protein_g * 4) / i.calories >= 0.2);

function proteinFoods(diet: string | null, avoid: string | null) {
  const foods = ['dal', 'sprouts'];
  if (diet === 'vegan') foods.push('tofu');
  else foods.push('curd', 'paneer');
  if (diet === 'egg' || diet === 'non_veg') foods.push('eggs');
  if (diet === 'non_veg') foods.push('chicken');
  const no = (avoid ?? '').toLowerCase();
  return foods.filter((f) => !no.includes(f));
}

function suggestItem(item: PlateItem, factor: number) {
  const f = Math.min(1, Math.max(0, factor));
  const unit = item.unit.trim();
  let eat: number;
  let text: string;
  if (item.count > 0 && unit) {
    // Real amounts only: half a chapati, not 0.37 of one. Never rounded down to nothing.
    eat = Math.min(item.count, Math.max(0.5, halves(item.count * f)));
    text = `${eat} ${unit}`;
    const g = item.grams > 0 ? Math.round((item.grams * (eat / item.count)) / 5) * 5 : 0;
    if (g) text += ` (about ${g} g)`;
    return { actual: eat / item.count, text };
  }
  if (item.grams > 0) {
    eat = Math.max(10, Math.round((item.grams * f) / 10) * 10);
    return { actual: Math.min(1, eat / item.grams), text: `about ${Math.min(eat, item.grams)} g` };
  }
  return { actual: f, text: f >= 1 ? 'all of it' : `about ${Math.round(f * 100)}%` };
}

/** What to eat from this plate. Estimates only: the person can always change what they log. */
export function suggestPortions(items: PlateItem[], input: PortionInput) {
  const budget = mealBudget(input);
  const plate = items.reduce((s, i) => s + i.calories, 0);
  const keptKcal = items.filter(isKept).reduce((s, i) => s + i.calories, 0);
  const restKcal = plate - keptKcal;

  const factorFor = (i: PlateItem) => {
    if (plate <= budget) return 1;
    // Protein and light sides alone are too much: reduce everything evenly.
    if (keptKcal >= budget || restKcal <= 0) return budget / plate;
    return isKept(i) ? 1 : (budget - keptKcal) / restKcal;
  };

  const suggested = items.map((i) => {
    const s = suggestItem(i, factorFor(i));
    return {
      name: i.name,
      portion: s.actual >= 1 ? i.portion || s.text : s.text,
      calories: Math.round(i.calories * s.actual),
      protein_g: round1(i.protein_g * s.actual),
      carbs_g: round1(i.carbs_g * s.actual),
      fat_g: round1(i.fat_g * s.actual),
      confidence: i.confidence,
      reduced: s.actual < 1,
    };
  });

  const kcal = suggested.reduce((s, i) => s + i.calories, 0);
  const protein = suggested.reduce((s, i) => s + i.protein_g, 0);
  const day = Math.max(input.targetKcal, calorieFloor(input.sex));
  const mealProtein = input.targetProtein * MEALS[input.mealType].share;
  return {
    budget_kcal: budget,
    plate_kcal: Math.round(plate),
    suggested_kcal: kcal,
    suggested_protein_g: Math.round(protein),
    left_after_kcal: Math.max(0, day - input.eatenKcal - kcal),
    eat_all: suggested.every((i) => !i.reduced),
    items: suggested,
    // Well under this meal's share of protein: suggest something to add.
    add_protein_foods:
      protein < mealProtein * 0.6 ? proteinFoods(input.diet, input.foodsToAvoid) : [],
  };
}
