// npx deno test --node-modules-dir=none --no-check supabase/functions/_shared/portion_test.ts
import { withTableValues } from './foodTable.ts';
import { mealGoal, suggestPortions, type PlateItem, type PortionInput } from './portion.ts';

function ok(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const item = (
  name: string,
  calories: number,
  protein_g: number,
  carbs_g: number,
  fat_g: number,
  count: number,
  unit: string,
  grams: number,
): PlateItem => ({
  name,
  portion: `${count} ${unit}`,
  calories,
  protein_g,
  carbs_g,
  fat_g,
  confidence: 'medium',
  count,
  unit,
  grams,
});

const none = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
const base: PortionInput = {
  mealType: 'breakfast',
  target: { calories: 1650, protein_g: 110, carbs_g: 180, fat_g: 55 },
  eaten: none,
  sex: 'female',
  diet: 'veg',
  foodsToAvoid: null,
};

const idliPlate = [
  item('Idli', 140, 4, 28, 1, 2, 'idli', 110),
  item('Sambar', 120, 6, 18, 3, 1, 'cup', 200),
];
const dinner = [
  item('Chapati', 240, 6, 40, 6, 2, 'chapati', 80),
  item('Dal', 180, 10, 25, 5, 1, 'katori', 200),
  item('Sabzi', 150, 3, 15, 8, 1, 'katori', 150),
];

Deno.test('can suggest more than the photo shows, in whole idlis', () => {
  // A target with room for carbs at breakfast; at 180 g a day, 2 idlis is the right answer.
  const r = suggestPortions(idliPlate, {
    ...base,
    sex: 'male',
    target: { calories: 2100, protein_g: 110, carbs_g: 280, fat_g: 60 },
  });
  const idli = r.plan.items[0]!;
  ok(idli.increased, `expected more idlis: ${idli.portion}`);
  ok(/^\d+ idli/.test(idli.portion), idli.portion);
  ok(Number(idli.portion.split(' ')[0]) >= 3, `a real breakfast: ${idli.portion}`);
  ok(
    Number(r.plan.items[1]!.portion.split(' ')[0]) <= 2,
    `not all sambar: ${r.plan.items[1]!.portion}`,
  );
});

Deno.test('dinner closes the day inside the band when the food allows it', () => {
  const eaten = { kcal: 1100, protein: 85, carbs: 125, fat: 37 };
  const r = suggestPortions(dinner, { ...base, mealType: 'dinner', eaten });
  ok(r.is_last_meal, 'last');
  for (const x of r.plan.checks) ok(x.percent >= 90 && x.percent <= 110, `${x.key} ${x.percent}%`);
  ok(r.plan.on_track, 'on track');
  ok(r.boost === null, 'nothing to add');
});

Deno.test('a day short on protein gets a real food to add, not a false "on track"', () => {
  const eaten = { kcal: 1000, protein: 40, carbs: 130, fat: 35 };
  const plain = [
    item('Rice', 400, 8, 88, 1, 2, 'cup', 300),
    item('Rasam', 60, 2, 10, 1, 1, 'cup', 200),
  ];
  const r = suggestPortions(plain, { ...base, mealType: 'dinner', eaten });
  ok(!r.plan.on_track, 'food alone cannot reach protein');
  ok(r.plan.checks.find((x) => x.key === 'protein')!.status === 'low', 'protein low');
  ok(Boolean(r.boost), 'adds offered');
  ok(
    r.boost!.items.some((i) => i.added),
    'an added food',
  );
  const p = r.boost!.checks.find((x) => x.key === 'protein')!;
  const before = r.plan.checks.find((x) => x.key === 'protein')!;
  ok(p.percent > before.percent + 10, `adds help: ${before.percent}% -> ${p.percent}%`);
  if (p.percent < 90) ok(p.status === 'low', 'never a false on track');
});

Deno.test('adds respect diet and foods to avoid, and skip what is already there', () => {
  const eaten = { kcal: 1000, protein: 40, carbs: 130, fat: 35 };
  const plain = [
    item('Rice', 400, 8, 88, 1, 2, 'cup', 300),
    item('Dal', 180, 10, 25, 5, 1, 'katori', 200),
  ];
  const names = (o: Partial<PortionInput>) =>
    (suggestPortions(plain, { ...base, mealType: 'dinner', eaten, ...o }).boost?.items ?? [])
      .filter((i) => i.added)
      .map((i) => i.name);
  const veg = names({ foodsToAvoid: 'soya' });
  ok(!veg.some((n) => /chicken|egg/i.test(n)), `veg: ${veg}`);
  ok(!veg.includes('Soya chunks'), `avoid: ${veg}`);
  ok(!veg.includes('Dal') && !veg.includes('Rice'), `already there: ${veg}`);
  const vegan = names({ diet: 'vegan' });
  ok(!vegan.some((n) => /curd|paneer|ghee/i.test(n)), `vegan: ${vegan}`);
});

Deno.test('already over target: still a real meal, and honest about it', () => {
  const eaten = { kcal: 2400, protein: 130, carbs: 300, fat: 90 };
  const r = suggestPortions(dinner, { ...base, mealType: 'dinner', eaten });
  ok(r.plan.kcal >= 250, `kcal ${r.plan.kcal}`);
  ok(r.plan.items.length === 3 && r.plan.items.every((i) => i.calories > 0), 'no empty item');
  ok(!r.plan.on_track, 'not on track');
  ok(r.plan.checks.find((x) => x.key === 'kcal')!.status === 'high', 'says high');
});

Deno.test('a very low target never goes under the calorie floor', () => {
  const low = suggestPortions(dinner, {
    ...base,
    mealType: 'dinner',
    target: { calories: 800, protein_g: 40, carbs_g: 100, fat_g: 25 },
  });
  ok(low.plan.checks.find((x) => x.key === 'kcal')!.target === 1200, 'floor used');
  ok(!low.targets_add_up, 'flags targets that do not add up');
});

Deno.test('missing macros get a normal split and say so', () => {
  const r = suggestPortions(idliPlate, {
    ...base,
    target: { calories: 2000, protein_g: null, carbs_g: null, fat_g: null },
  });
  ok(r.targets_filled_in, 'filled');
  ok(r.targets_add_up, 'adds up');
});

Deno.test('earlier meals take a fair share; unlogged days cannot make one meal huge', () => {
  const day = { kcal: 2000, protein: 100, carbs: 250, fat: 60 };
  ok(mealGoal(day, none, 'breakfast').kcal === 500, 'breakfast');
  ok(mealGoal(day, none, 'lunch').kcal === 900, 'lunch capped at 45%');
  ok(mealGoal(day, { ...none, kcal: 2500 }, 'snack').kcal === 80, 'minimum snack');
});

Deno.test('uncountable dish uses grams; chutney is not used to reach targets', () => {
  const r = suggestPortions(
    [
      item('Biryani', 900, 25, 120, 30, 0, '', 400),
      item('Chutney', 40, 1, 2, 3, 1, 'tablespoon', 15),
    ],
    { ...base, mealType: 'lunch', eaten: { kcal: 400, protein: 25, carbs: 45, fat: 14 } },
  );
  ok(/about \d+ g/.test(r.plan.items[0]!.portion), r.plan.items[0]!.portion);
  const chutney = r.plan.items[1]!;
  ok(!/^[2-9]/.test(chutney.portion), chutney.portion);
});

Deno.test('compatible with app versions from before this change', () => {
  const r = suggestPortions(idliPlate, base);
  for (const k of [
    'budget_kcal',
    'plate_kcal',
    'suggested_kcal',
    'left_after_kcal',
    'eat_all',
    'items',
  ]) {
    ok(k in r, k);
  }
  ok(Array.isArray(r.add_protein_foods), 'add_protein_foods');
});

Deno.test('the food table replaces a low AI guess, following visible size', () => {
  const small = withTableValues(item('Plain Dosa', 170, 3, 30, 4, 1, 'dosa', 70));
  ok(small.from_table, 'known food');
  ok(small.calories === 171, `small ${small.calories}`);
  const big = withTableValues(item('Plain Dosa', 170, 3, 30, 4, 1, 'dosa', 150));
  ok(big.calories > 300 && big.calories <= 352, `big ${big.calories}`);
  const unknown = withTableValues(item('Grandma special', 300, 5, 40, 12, 1, 'bowl', 200));
  ok(!unknown.from_table && unknown.calories === 300, 'unknown keeps the AI numbers');
  const otherUnit = withTableValues(item('Rice', 300, 6, 60, 1, 1, 'plate', 225));
  ok(!otherUnit.from_table, 'unit not in the table keeps the AI numbers');
});

Deno.test('additions suit the meal: no soya with breakfast', () => {
  const r = suggestPortions([item('Idli', 140, 4, 28, 1, 2, 'idli', 110)], { ...base });
  const added = (r.boost?.items ?? []).filter((i) => i.added).map((i) => i.name);
  ok(added.length <= 2, `${added}`);
  ok(!added.some((n) => /soya|tofu|dal|chicken|rice|chapati/i.test(n)), `${added}`);
});

Deno.test('tea stays a whole cup', () => {
  const r = suggestPortions([item('Tea with milk', 70, 2, 10, 2, 1, 'cup', 150)], {
    ...base,
    mealType: 'snack',
  });
  ok(/^1 cup/.test(r.plan.items[0]!.portion), r.plan.items[0]!.portion);
});

const bigPlate = [
  item('Chapati', 360, 9, 60, 9, 3, 'chapati', 120),
  item('Rice', 100, 2, 22, 0, 0.5, 'cup', 75),
  item('Palak Paneer', 250, 11, 8, 18, 1, 'katori', 120),
  item('Kala Chana', 200, 10, 28, 6, 1, 'katori', 120),
];

Deno.test('unlogged breakfast and lunch never become a giant dinner', () => {
  const r = suggestPortions(bigPlate, { ...base, mealType: 'dinner', loggedMeals: [] });
  ok(r.assumed_meals.join() === 'breakfast,lunch', r.assumed_meals.join());
  ok(r.plan.kcal <= 1650 * 0.5, `dinner ${r.plan.kcal} kcal`);
  ok(r.plan.kcal >= 300, 'still a real meal');
});

Deno.test('logged meals are not assumed again; a snack is optional', () => {
  const r = suggestPortions(bigPlate, {
    ...base,
    mealType: 'dinner',
    eaten: { kcal: 1000, protein: 60, carbs: 110, fat: 35 },
    loggedMeals: ['breakfast', 'lunch'],
  });
  ok(r.assumed_meals.length === 0, 'none assumed');
});

Deno.test('one meal never passes its limit, even to reach the day', () => {
  const r = suggestPortions(bigPlate, {
    ...base,
    mealType: 'dinner',
    eaten: { kcal: 100, protein: 5, carbs: 10, fat: 3 },
    loggedMeals: ['breakfast', 'lunch'],
  });
  ok(r.plan.kcal <= 1650 * 0.6, `dinner ${r.plan.kcal} kcal`);
  ok(!r.plan.on_track, 'says the day falls short');
  if (r.boost) ok(r.boost.kcal <= 1650 * 0.6, `with adds ${r.boost.kcal} kcal`);
});
