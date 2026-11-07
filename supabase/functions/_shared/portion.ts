// "How much should I eat?": real portions of the food in the photo, planned across the whole day so
// calories, protein, carbs and fat each end between 90% and 110% of target. The AI only reads the
// food; everything here is ordinary arithmetic, so the limits below always hold.
export type MealType = 'breakfast' | 'lunch' | 'snack' | 'dinner';
export interface Macros {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}
const KEYS = ['kcal', 'protein', 'carbs', 'fat'] as const;
type Key = (typeof KEYS)[number];

export interface PlateItem {
  name: string;
  portion: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  confidence: 'high' | 'medium' | 'low';
  /** On the plate, in household units (2 idli, 1 katori); 0 if it can't be counted. */
  count: number;
  unit: string;
  grams: number;
}

export interface PortionInput {
  mealType: MealType;
  target: {
    calories: number;
    protein_g: number | null;
    carbs_g: number | null;
    fat_g: number | null;
  };
  eaten: Macros;
  /** Which meals are logged today. Left out: what's logged is taken as the whole day so far. */
  loggedMeals?: MealType[];
  sex: string | null;
  diet: string | null;
  foodsToAvoid: string | null;
}

/** A normal share of the day for each meal, the most one meal may take, and the least. */
const MEALS: Record<MealType, { share: number; cap: number; min: number }> = {
  breakfast: { share: 0.25, cap: 0.35, min: 250 },
  lunch: { share: 0.35, cap: 0.45, min: 300 },
  snack: { share: 0.1, cap: 0.2, min: 80 },
  dinner: { share: 0.3, cap: 0.6, min: 300 },
};
const ORDER: MealType[] = ['breakfast', 'lunch', 'snack', 'dinner'];

export const BAND_LOW = 0.9;
export const BAND_HIGH = 1.1;
const BALANCE = 0.6;

/** The day's calories are never treated as lower than this, so we don't encourage under-eating. */
export const calorieFloor = (sex: string | null) => (sex === 'female' ? 1200 : 1500);

/** The day's four targets. A missing macro gets a normal share of the calories. */
export function dayTargets(t: PortionInput['target'], sex: string | null) {
  const kcal = Math.max(t.calories, calorieFloor(sex));
  const protein = t.protein_g ?? Math.round((kcal * 0.2) / 4);
  const fat = t.fat_g ?? Math.round((kcal * 0.27) / 9);
  const carbs = t.carbs_g ?? Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  const fromMacros = protein * 4 + carbs * 4 + fat * 9;
  return {
    goal: { kcal, protein, carbs, fat } as Macros,
    filled: t.protein_g === null || t.carbs_g === null || t.fat_g === null,
    // Numbers that don't add up can't all be reached, whatever is eaten.
    adds_up: Math.abs(fromMacros - kcal) / kcal <= 0.1,
  };
}

/** What this meal should provide: its fair share of what is left. Dinner takes all that is left. */
export function mealGoal(day: Macros, eaten: Macros, mealType: MealType): Macros {
  const m = MEALS[mealType];
  const later = ORDER.slice(ORDER.indexOf(mealType)).reduce((s, t) => s + MEALS[t].share, 0);
  const goal = {} as Macros;
  for (const k of KEYS) {
    const left = Math.max(0, day[k] - eaten[k]);
    goal[k] = Math.min((left * m.share) / later, day[k] * m.cap);
  }
  goal.kcal = Math.max(goal.kcal, m.min);
  return goal;
}

interface Food {
  name: string;
  unit: string;
  count: number;
  gramsPerUnit: number;
  per: Macros;
  step: number;
  min: number;
  max: number;
  portion: string;
  confidence: 'high' | 'medium' | 'low';
}

function stepFor(unit: string) {
  if (/chapati|roti|phulka|dosa|paratha|thepla/.test(unit)) return 0.5;
  if (/idli|idly|vada|puri|egg|piece|banana|fruit|slice|tablespoon|tbsp|teaspoon|tsp/.test(unit)) {
    return 1;
  }
  if (/cup|plate/.test(unit)) return 0.25;
  return 0.5;
}

const snap = (n: number, step: number) => Math.round(n / step) * step;
const round1 = (n: number) => Math.round(n * 10) / 10;

function toFood(i: PlateItem): Food {
  const unit = i.unit.trim();
  let count = i.count;
  let usedUnit = unit;
  let step: number;
  let gramsPerUnit = 0;
  if (i.count > 0 && unit) {
    step = stepFor(unit.toLowerCase());
    gramsPerUnit = i.grams > 0 ? i.grams / i.count : 0;
  } else if (i.grams > 0) {
    count = i.grams;
    usedUnit = 'g';
    step = 10;
  } else {
    count = 1;
    usedUnit = 'portion';
    step = 0.25;
  }
  // Half a cup of tea isn't a thing anyone does.
  if (/\btea\b|coffee/i.test(i.name) && usedUnit !== 'g') step = 1;
  const per: Macros = {
    kcal: i.calories / count,
    protein: i.protein_g / count,
    carbs: i.carbs_g / count,
    fat: i.fat_g / count,
  };
  // Chutney and pickle are extras, not a way to reach a target.
  const extra = /tablespoon|tbsp|teaspoon|tsp/.test(usedUnit.toLowerCase());
  const drink = /\btea\b|coffee/i.test(i.name);
  const byAmount = drink ? count : extra ? count * 1.5 : Math.max(count * 2, step * 4);
  const byCalories = per.kcal > 0 ? 900 / per.kcal : byAmount;
  return {
    name: i.name,
    unit: usedUnit,
    count,
    gramsPerUnit,
    per,
    step,
    min: drink ? count : step,
    max: Math.max(step, Math.min(byAmount, byCalories)),
    portion: i.portion,
    confidence: i.confidence,
  };
}

/** Common foods to suggest adding, in amounts people can picture. Numbers are typical home values. */
const PANTRY: (Macros & {
  name: string;
  unit: string;
  step: number;
  max: number;
  diets: string[];
})[] = (() => {
  const all = ['veg', 'egg', 'non_veg', 'vegan'];
  const dairy = ['veg', 'egg', 'non_veg'];
  return [
    {
      name: 'Dal',
      unit: 'katori',
      kcal: 180,
      protein: 10,
      carbs: 25,
      fat: 5,
      step: 0.5,
      max: 1,
      diets: all,
    },
    {
      name: 'Sprouts',
      unit: 'katori',
      kcal: 100,
      protein: 8,
      carbs: 15,
      fat: 1,
      step: 0.5,
      max: 1,
      diets: all,
    },
    {
      name: 'Soya chunks',
      unit: 'katori',
      kcal: 170,
      protein: 20,
      carbs: 15,
      fat: 4,
      step: 0.5,
      max: 1,
      diets: all,
    },
    {
      name: 'Tofu',
      unit: 'piece (100 g)',
      kcal: 80,
      protein: 9,
      carbs: 2,
      fat: 5,
      step: 1,
      max: 1,
      diets: all,
    },
    {
      name: 'Roasted chana',
      unit: 'handful (30 g)',
      kcal: 120,
      protein: 6,
      carbs: 18,
      fat: 2,
      step: 1,
      max: 2,
      diets: all,
    },
    {
      name: 'Curd',
      unit: 'katori',
      kcal: 100,
      protein: 6,
      carbs: 5,
      fat: 6,
      step: 0.5,
      max: 2,
      diets: dairy,
    },
    {
      name: 'Paneer',
      unit: 'piece (50 g)',
      kcal: 130,
      protein: 9,
      carbs: 2,
      fat: 10,
      step: 1,
      max: 3,
      diets: dairy,
    },
    {
      name: 'Boiled egg',
      unit: 'egg',
      kcal: 75,
      protein: 6,
      carbs: 1,
      fat: 5,
      step: 1,
      max: 3,
      diets: ['egg', 'non_veg'],
    },
    {
      name: 'Grilled chicken',
      unit: 'piece (100 g)',
      kcal: 165,
      protein: 31,
      carbs: 0,
      fat: 4,
      step: 1,
      max: 2,
      diets: ['non_veg'],
    },
    {
      name: 'Rice',
      unit: 'cup',
      kcal: 200,
      protein: 4,
      carbs: 44,
      fat: 0.5,
      step: 0.25,
      max: 1.5,
      diets: all,
    },
    {
      name: 'Chapati',
      unit: 'chapati',
      kcal: 120,
      protein: 3,
      carbs: 20,
      fat: 3,
      step: 0.5,
      max: 3,
      diets: all,
    },
    {
      name: 'Banana',
      unit: 'banana',
      kcal: 105,
      protein: 1,
      carbs: 27,
      fat: 0.5,
      step: 1,
      max: 2,
      diets: all,
    },
    {
      name: 'Almonds',
      unit: 'handful (15 g)',
      kcal: 90,
      protein: 3,
      carbs: 3,
      fat: 8,
      step: 1,
      max: 2,
      diets: all,
    },
    {
      name: 'Ghee',
      unit: 'teaspoon',
      kcal: 45,
      protein: 0,
      carbs: 0,
      fat: 5,
      step: 1,
      max: 3,
      diets: dairy,
    },
  ];
})();

/** What goes with which meal. Nobody wants soya chunks with their morning idli. */
const FITS: Record<string, MealType[]> = {
  Dal: ['lunch', 'dinner'],
  Sprouts: ['breakfast', 'lunch', 'snack', 'dinner'],
  'Soya chunks': ['lunch', 'dinner'],
  Tofu: ['lunch', 'dinner'],
  'Roasted chana': ['breakfast', 'snack'],
  Curd: ['breakfast', 'lunch', 'snack', 'dinner'],
  Paneer: ['breakfast', 'lunch', 'dinner'],
  'Boiled egg': ['breakfast', 'snack', 'dinner'],
  'Grilled chicken': ['lunch', 'dinner'],
  Rice: ['lunch', 'dinner'],
  Chapati: ['lunch', 'dinner'],
  Banana: ['breakfast', 'snack'],
  Almonds: ['breakfast', 'snack'],
  Ghee: ['lunch', 'dinner'],
};
const MAX_ADDS = 2;

function pantryFor(input: PortionInput, plate: PlateItem[]): Food[] {
  const diet = input.diet ?? 'veg'; // unknown diet: only suggest what suits everyone but vegans
  const no = `${input.foodsToAvoid ?? ''} ${plate.map((i) => i.name).join(' ')}`.toLowerCase();
  const curdOnPlate = /raita|yogh?urt|dahi|lassi|buttermilk/.test(no);
  return PANTRY.filter(
    (p) =>
      p.diets.includes(diet) &&
      FITS[p.name]!.includes(input.mealType) &&
      !p.name
        .toLowerCase()
        .split(' ')
        .filter((w) => !['boiled', 'grilled', 'roasted', 'chunks'].includes(w))
        .some((w) => no.includes(w)) &&
      !(p.name === 'Curd' && curdOnPlate),
  ).map((p) => ({
    name: p.name,
    unit: p.unit,
    count: 0,
    gramsPerUnit: 0,
    per: { kcal: p.kcal, protein: p.protein, carbs: p.carbs, fat: p.fat },
    step: p.step,
    min: 0,
    max: p.max,
    portion: '',
    confidence: 'medium' as const,
  }));
}

function totals(foods: Food[], q: number[]): Macros {
  const t: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  foods.forEach((f, i) => {
    for (const k of KEYS) t[k] += f.per[k] * q[i]!;
  });
  return t;
}

interface Ctx {
  day: Macros;
  eaten: Macros;
  goal: Macros;
  last: boolean;
  minKcal: number;
  /** The most this one meal may be, even if that means missing the day's targets. */
  maxKcal: number;
}

function score(got: Macros, c: Ctx) {
  let s = 0;
  for (const k of KEYS) {
    const scale = Math.max(c.goal[k], c.day[k] * 0.1);
    const err = (got[k] - c.goal[k]) / scale;
    s += (k === 'kcal' ? 1.5 : 1) * err * err;
    // Past the band for the day costs far more than any miss inside it.
    const end = c.eaten[k] + got[k];
    // Even past target, the minimum meal stays (kcal only: it's what the minimum is measured in).
    const allowed =
      k === 'kcal'
        ? Math.max(c.day[k] * BAND_HIGH, c.eaten.kcal + c.minKcal)
        : c.day[k] * BAND_HIGH;
    const over = end - allowed;
    if (over > 0) s += (over / c.day[k]) ** 2 * 400;
    if (c.last) {
      const under = c.day[k] * BAND_LOW - end;
      if (under > 0) s += (under / c.day[k]) ** 2 * 400;
    }
  }
  if (got.kcal < c.minKcal) s += ((c.minKcal - got.kcal) / c.minKcal) ** 2 * 50;
  if (got.kcal > c.maxKcal) s += ((got.kcal - c.maxKcal) / c.day.kcal) ** 2 * 5000;
  return s;
}

/**
 * A meal people would actually eat: amounts stay roughly in proportion to how the food was served.
 * Without this the numbers alone suggest "1 idli and 3 cups of sambar". Added foods are exempt.
 */
function balance(foods: Food[], q: number[], c: Ctx) {
  const served = foods.filter((f) => f.count > 0);
  const plateKcal = served.reduce((s, f) => s + f.per.kcal * f.count, 0);
  if (plateKcal <= 0) return 0;
  const size = c.goal.kcal / plateKcal;
  let s = 0;
  foods.forEach((f, i) => {
    if (f.count > 0) s += (q[i]! / f.count - size) ** 2;
  });
  return (s * BALANCE) / Math.max(1, served.length);
}

/** The best real amounts of these foods: try each amount up or down until nothing improves. */
function solve(foods: Food[], c: Ctx) {
  const clip = (f: Food, v: number) =>
    Math.min(snap(f.max, f.step), Math.max(f.min, snap(v, f.step)));
  const plateKcal = foods.reduce((s, f) => s + f.per.kcal * f.count, 0);
  const starts = [
    foods.map((f) => clip(f, f.count)),
    foods.map((f) => clip(f, plateKcal > 0 ? (f.count * c.goal.kcal) / plateKcal : f.count)),
    foods.map((f) => f.min),
  ];
  let best = starts[0]!;
  let bestScore = Infinity;
  for (const start of starts) {
    const q = [...start];
    const judge = () => score(totals(foods, q), c) + balance(foods, q, c);
    let cur = judge();
    for (let round = 0; round < 80; round++) {
      let moved = false;
      for (let i = 0; i < foods.length; i++) {
        const f = foods[i]!;
        for (const dir of [1, -1]) {
          const next = clip(f, q[i]! + dir * f.step);
          if (next === q[i]) continue;
          const old = q[i]!;
          q[i] = next;
          const s = judge();
          if (s < cur - 1e-9) {
            cur = s;
            moved = true;
          } else {
            q[i] = old;
          }
        }
      }
      if (!moved) break;
    }
    if (cur < bestScore) {
      bestScore = cur;
      best = q;
    }
  }
  // The minimum meal is a firm rule: raise whatever is furthest below how it was served.
  const q = [...best];
  for (let guard = 0; guard < 100 && totals(foods, q).kcal < c.minKcal; guard++) {
    const can = foods
      .map((f, i) => ({ f, i, share: f.count > 0 ? q[i]! / f.count : Infinity }))
      .filter((x) => x.f.count > 0 && q[x.i]! + x.f.step <= x.f.max);
    if (!can.length) break;
    const low = can.reduce((a, b) => (b.share < a.share ? b : a));
    q[low.i] = q[low.i]! + low.f.step;
  }
  // So is the most one meal may be: take from whatever is furthest above how it was served, and
  // from added foods first.
  for (let guard = 0; guard < 100 && totals(foods, q).kcal > c.maxKcal; guard++) {
    const can = foods
      .map((f, i) => ({
        f,
        i,
        share: f.count > 0 ? q[i]! / f.count : Infinity,
      }))
      .filter((x) => q[x.i]! - x.f.step >= x.f.min);
    if (!can.length) break;
    const high = can.reduce((a, b) => (b.share > a.share ? b : a));
    q[high.i] = q[high.i]! - high.f.step;
  }
  return { q, score: bestScore };
}

function amountText(f: Food, q: number) {
  if (f.unit === 'g') return `about ${q} g`;
  const g = f.gramsPerUnit ? Math.round((f.gramsPerUnit * q) / 5) * 5 : 0;
  return g ? `${q} ${f.unit} (about ${g} g)` : `${q} ${f.unit}`;
}

function checks(meal: Macros, c: Ctx) {
  return KEYS.map((key: Key) => {
    const end = c.eaten[key] + meal[key];
    const t = c.day[key];
    let status: 'ok' | 'low' | 'high' = 'ok';
    if (end > t * BAND_HIGH) status = 'high';
    else if (c.last ? end < t * BAND_LOW : meal[key] < c.goal[key] * 0.8) status = 'low';
    return {
      key,
      target: Math.round(t),
      meal: Math.round(meal[key]),
      after: Math.round(end),
      percent: t > 0 ? Math.round((end / t) * 100) : 100,
      status,
    };
  });
}

function describe(foods: Food[], q: number[], c: Ctx) {
  const meal = totals(foods, q);
  const items = foods
    .map((f, i) => ({ f, n: q[i]! }))
    .filter((x) => x.n > 0)
    .map(({ f, n }) => ({
      name: f.name,
      portion: amountText(f, n),
      calories: Math.round(f.per.kcal * n),
      protein_g: round1(f.per.protein * n),
      carbs_g: round1(f.per.carbs * n),
      fat_g: round1(f.per.fat * n),
      confidence: f.confidence,
      reduced: n < f.count,
      increased: f.count > 0 && n > f.count,
      added: f.count === 0,
    }));
  const list = checks(meal, c);
  return {
    items,
    kcal: Math.round(meal.kcal),
    protein_g: Math.round(meal.protein),
    checks: list,
    on_track: list.every((x) => x.status === 'ok'),
  };
}

/** What to eat from this food, and what to add if the food alone can't reach the targets. */
export function suggestPortions(plate: PlateItem[], input: PortionInput) {
  const { goal: day, filled, adds_up } = dayTargets(input.target, input.sex);
  const last = input.mealType === 'dinner';
  // Breakfast or lunch not logged: most likely eaten, not skipped. Count a normal portion, or a
  // missed log would turn into "have 1,800 kcal for dinner".
  const assumed = input.loggedMeals
    ? (['breakfast', 'lunch'] as MealType[]).filter(
        (m) => ORDER.indexOf(m) < ORDER.indexOf(input.mealType) && !input.loggedMeals!.includes(m),
      )
    : [];
  const eaten = { ...input.eaten };
  for (const m of assumed) {
    for (const k of KEYS) eaten[k] += day[k] * MEALS[m].share;
  }
  const c: Ctx = {
    day,
    eaten,
    goal: mealGoal(day, eaten, input.mealType),
    last,
    minKcal: MEALS[input.mealType].min,
    maxKcal: day.kcal * MEALS[input.mealType].cap,
  };
  const foods = plate.map(toFood);
  const base = solve(foods, c);
  const plan = describe(foods, base.q, c);

  // Not enough with this food alone: try adding up to 2 common foods that suit this meal.
  let boost: ReturnType<typeof describe> | null = null;
  if (!plan.on_track) {
    const options = pantryFor(input, plate);
    let chosen: Food[] = [];
    let bestScore = base.score;
    let bestQ = base.q;
    for (let n = 0; n < MAX_ADDS; n++) {
      let pick: { add: Food; q: number[]; score: number } | null = null;
      for (const add of options.filter((o) => !chosen.includes(o))) {
        const r = solve([...foods, ...chosen, add], c);
        if (r.q.at(-1)! > 0 && r.score < bestScore * 0.9 && r.score < (pick?.score ?? Infinity)) {
          pick = { add, q: r.q, score: r.score };
        }
      }
      if (!pick) break;
      chosen = [...chosen, pick.add];
      bestScore = pick.score;
      bestQ = pick.q;
    }
    if (chosen.length) boost = describe([...foods, ...chosen], bestQ, c);
  }

  const plateKcal = plate.reduce((s, i) => s + i.calories, 0);
  return {
    is_last_meal: last,
    targets_filled_in: filled,
    targets_add_up: adds_up,
    assumed_meals: assumed,
    plan,
    boost,
    meal_goal_kcal: Math.round(c.goal.kcal),
    // The fields below are what app versions from before 7 Nov read.
    budget_kcal: Math.round(c.goal.kcal),
    plate_kcal: Math.round(plateKcal),
    suggested_kcal: plan.kcal,
    suggested_protein_g: plan.protein_g,
    left_after_kcal: Math.max(0, Math.round(day.kcal - eaten.kcal - plan.kcal)),
    eat_all: plan.items.every((i) => !i.reduced && !i.increased),
    items: plan.items,
    add_protein_foods: [] as string[],
  };
}
