// How often does the day planner land calories, protein, carbs and fat all at 90–110%?
//   npx deno run --no-check --node-modules-dir=none scripts/portion-sim.ts
// Simulates whole days of typical Indian home meals. "On paper" = using the app's own numbers.
// "Real" = the true food differs from the AI's reading, and people don't always follow the plan.
import {
  suggestPortions,
  type MealType,
  type PlateItem,
} from '../supabase/functions/_shared/portion.ts';

// name, per unit: kcal, protein, carbs, fat; unit; grams per unit; usual count
type F = [string, number, number, number, number, string, number, number];
const FOODS: Record<string, F> = {
  idli: ['Idli', 70, 2, 14, 0.5, 'idli', 55, 3],
  sambar: ['Sambar', 120, 6, 18, 3, 'cup', 200, 1],
  chutney: ['Coconut chutney', 40, 0.5, 2, 3.5, 'tablespoon', 15, 2],
  dosa: ['Plain dosa', 220, 5, 36, 6, 'dosa', 90, 2],
  upma: ['Upma', 280, 6, 40, 10, 'plate', 200, 1],
  poha: ['Poha', 270, 5, 45, 8, 'plate', 200, 1],
  paratha: ['Aloo paratha', 220, 5, 30, 9, 'paratha', 90, 2],
  curd: ['Curd', 100, 6, 5, 6, 'katori', 100, 1],
  egg: ['Boiled egg', 75, 6, 1, 5, 'egg', 50, 2],
  chapati: ['Chapati', 120, 3, 20, 3, 'chapati', 40, 3],
  rice: ['Rice', 200, 4, 44, 0.5, 'cup', 150, 1],
  dal: ['Dal', 180, 10, 25, 5, 'katori', 200, 1],
  rajma: ['Rajma', 280, 14, 40, 7, 'katori', 200, 1],
  chana: ['Chana masala', 290, 13, 40, 9, 'katori', 200, 1],
  sabzi: ['Mixed sabzi', 150, 3, 15, 8, 'katori', 150, 1],
  paneer: ['Paneer curry', 350, 16, 12, 26, 'katori', 200, 1],
  chicken: ['Chicken curry', 300, 28, 8, 17, 'katori', 200, 1],
  rasam: ['Rasam', 60, 2, 10, 1, 'cup', 200, 1],
  sundal: ['Chana sundal', 180, 9, 26, 5, 'katori', 120, 1],
  banana: ['Banana', 105, 1, 27, 0.5, 'banana', 118, 1],
  sprouts: ['Sprouts', 100, 8, 15, 1, 'katori', 100, 1],
  tea: ['Tea with milk', 70, 2, 10, 2, 'cup', 150, 1],
  biscuit: ['Biscuits', 45, 0.6, 7, 2, 'piece', 10, 3],
  almonds: ['Almonds', 90, 3, 3, 8, 'handful', 15, 1],
};
const BREAKFAST = [
  ['idli', 'sambar', 'chutney'],
  ['dosa', 'sambar', 'chutney'],
  ['upma', 'chutney'],
  ['poha', 'curd'],
  ['paratha', 'curd'],
  ['idli', 'sambar', 'egg'],
];
const LUNCH = [
  ['rice', 'sambar', 'sabzi', 'curd'],
  ['chapati', 'dal', 'sabzi'],
  ['rice', 'rajma', 'curd'],
  ['chapati', 'paneer', 'rice'],
  ['rice', 'rasam', 'sundal', 'curd'],
  ['chapati', 'chicken', 'rice'],
];
const SNACK = [['tea', 'biscuit'], ['banana'], ['sprouts'], ['tea', 'almonds']];
const DINNER = [
  ['chapati', 'dal', 'sabzi'],
  ['rice', 'dal', 'sabzi'],
  ['chapati', 'paneer'],
  ['dosa', 'sambar'],
  ['chapati', 'chana'],
  ['rice', 'rasam', 'curd'],
];
const PEOPLE = [
  {
    name: 'Moderate (1650 kcal, 110 g protein)',
    t: { calories: 1650, protein_g: 110, carbs_g: 180, fat_g: 55 },
    sex: 'female',
    diet: 'veg',
  },
  {
    name: 'Moderate (2100 kcal, 110 g protein)',
    t: { calories: 2100, protein_g: 110, carbs_g: 280, fat_g: 60 },
    sex: 'male',
    diet: 'veg',
  },
  {
    name: 'High protein (2050 kcal, 150 g protein)',
    t: { calories: 2050, protein_g: 150, carbs_g: 220, fat_g: 55 },
    sex: 'male',
    diet: 'veg',
  },
];

let seed = 12345;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)]!;
const noise = (pct: number) => 1 + (rnd() * 2 - 1) * pct;

/** What the AI reads: right food, numbers off by up to `err`. */
function read(key: string, err: number): PlateItem {
  const [name, kcal, p, c, f, unit, grams, count] = FOODS[key]!;
  const e = noise(err);
  return {
    name,
    portion: `${count} ${unit}`,
    calories: kcal * count * e,
    protein_g: p * count * e,
    carbs_g: c * count * e,
    fat_g: f * count * e,
    confidence: 'medium',
    count,
    unit,
    grams: grams * count,
  };
}
const KEYS = ['kcal', 'protein', 'carbs', 'fat'] as const;
const inBand = (v: number, t: number) => v >= t * 0.9 && v <= t * 1.1;

/** Print a few example days, to judge by eye whether the meals make sense. */
function sample(p: (typeof PEOPLE)[number]) {
  const eaten = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const meals: [MealType, string[]][] = [
    ['breakfast', pick(BREAKFAST)],
    ['lunch', pick(LUNCH)],
    ['snack', pick(SNACK)],
    ['dinner', pick(DINNER)],
  ];
  console.log(`\nExample day: ${p.name}`);
  for (const [mealType, keys] of meals) {
    const r = suggestPortions(
      keys.filter((k) => !['egg', 'chicken'].includes(k)).map((k) => read(k, 0)),
      { mealType, target: p.t, eaten: { ...eaten }, sex: p.sex, diet: p.diet, foodsToAvoid: null },
    );
    const c = r.boost ?? r.plan;
    for (const i of c.items) {
      eaten.kcal += i.calories;
      eaten.protein += i.protein_g;
      eaten.carbs += i.carbs_g;
      eaten.fat += i.fat_g;
    }
    console.log(
      `  ${mealType}: ${c.items.map((i) => `${i.added ? 'ADD ' : ''}${i.name} ${i.portion}`).join(', ')}`,
    );
  }
  console.log(
    `  end: ${Math.round(eaten.kcal)} kcal, ${Math.round(eaten.protein)} P, ${Math.round(eaten.carbs)} C, ${Math.round(eaten.fat)} F`,
  );
}

function runDay(
  p: (typeof PEOPLE)[number],
  o: { err: number; adds: boolean; follow: number; realErr: number; bias?: number },
) {
  const eaten = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const real = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const meals: [MealType, string[][]][] = [
    ['breakfast', BREAKFAST],
    ['lunch', LUNCH],
    ['snack', SNACK],
    ['dinner', DINNER],
  ];
  for (const [mealType, menu] of meals) {
    const keys = pick(menu).filter((k) => p.diet !== 'veg' || !['egg', 'chicken'].includes(k));
    const plate = keys.map((k) => read(k, o.err));
    const r = suggestPortions(plate, {
      mealType,
      target: p.t,
      eaten: { ...eaten },
      sex: p.sex,
      diet: p.diet,
      foodsToAvoid: null,
    });
    const chosen = o.adds && r.boost ? r.boost : r.plan;
    const followed = noise(o.follow); // people serve a little more or less than suggested
    for (const i of chosen.items) {
      const truth = noise(o.realErr) * (o.bias ?? 1);
      eaten.kcal += i.calories * followed;
      eaten.protein += i.protein_g * followed;
      eaten.carbs += i.carbs_g * followed;
      eaten.fat += i.fat_g * followed;
      real.kcal += i.calories * followed * truth;
      real.protein += i.protein_g * followed * truth;
      real.carbs += i.carbs_g * followed * truth;
      real.fat += i.fat_g * followed * truth;
    }
  }
  const t = { kcal: p.t.calories, protein: p.t.protein_g, carbs: p.t.carbs_g, fat: p.t.fat_g };
  return {
    paper: KEYS.map((k) => inBand(eaten[k], t[k])),
    real: KEYS.map((k) => inBand(real[k], t[k])),
    eaten,
  };
}

const DAYS = 400;
const pc = (n: number) => `${Math.round((n / DAYS) * 100)}%`;
function report(label: string, o: Parameters<typeof runDay>[1]) {
  console.log(`\n${label}`);
  for (const p of PEOPLE) {
    const paper = [0, 0, 0, 0];
    const real = [0, 0, 0, 0];
    let all = 0;
    let allReal = 0;
    for (let d = 0; d < DAYS; d++) {
      const r = runDay(p, o);
      r.paper.forEach((v, i) => (paper[i]! += v ? 1 : 0));
      r.real.forEach((v, i) => (real[i]! += v ? 1 : 0));
      if (r.paper.every(Boolean)) all++;
      if (r.real.every(Boolean)) allReal++;
    }
    console.log(`  ${p.name}`);
    console.log(
      `    app's numbers: all four ${pc(all)} | kcal ${pc(paper[0]!)} protein ${pc(paper[1]!)} carbs ${pc(paper[2]!)} fat ${pc(paper[3]!)}`,
    );
    console.log(
      `    real food:     all four ${pc(allReal)} | kcal ${pc(real[0]!)} protein ${pc(real[1]!)} carbs ${pc(real[2]!)} fat ${pc(real[3]!)}`,
    );
  }
}
report('A. Only the food cooked, plan followed exactly', {
  err: 0,
  adds: false,
  follow: 0,
  realErr: 0,
});
report('B. Food cooked + the suggested additions, plan followed exactly', {
  err: 0,
  adds: true,
  follow: 0,
  realErr: 0,
});
report('C. With additions; AI reading ±15%, serving ±10%, real food ±20%', {
  err: 0.15,
  adds: true,
  follow: 0.1,
  realErr: 0.2,
});
report('D. As C, and the AI reads all food 15% too low (as seen on real photos)', {
  err: 0.15,
  adds: true,
  follow: 0.1,
  realErr: 0.2,
  bias: 1.15,
});
report(
  'E. Food table in use: reading ±5%, serving ±10%, this kitchen ±15%, overall bias 5% (an assumption)',
  {
    err: 0.05,
    adds: true,
    follow: 0.1,
    realErr: 0.15,
    bias: 1.05,
  },
);
for (const p of PEOPLE) sample(p);
