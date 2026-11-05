// npx deno test --node-modules-dir=none --no-check supabase/functions/_shared/portion_test.ts
import { mealBudget, suggestPortions, type PlateItem, type PortionInput } from './portion.ts';

function ok(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const item = (
  name: string,
  calories: number,
  protein_g: number,
  count: number,
  unit: string,
  grams: number,
): PlateItem => ({
  name,
  portion: `${count} ${unit}`,
  calories,
  protein_g,
  carbs_g: 0,
  fat_g: 0,
  confidence: 'medium',
  count,
  unit,
  grams,
});

const base: PortionInput = {
  mealType: 'lunch',
  targetKcal: 1600,
  targetProtein: 80,
  eatenKcal: 300,
  sex: 'female',
  diet: 'veg',
  foodsToAvoid: null,
};

const plate = [
  item('Chapati', 450, 12, 3, 'chapati', 120),
  item('Rice', 300, 6, 1.5, 'cup', 225),
  item('Dal', 200, 12, 1, 'katori', 200),
  item('Salad', 40, 1, 1, 'small bowl', 80),
];

Deno.test('a big plate is cut to the budget, keeping real amounts', () => {
  const r = suggestPortions(plate, base);
  ok(r.plate_kcal === 990, 'plate');
  ok(!r.eat_all, 'should reduce');
  ok(r.suggested_kcal <= r.budget_kcal * 1.15, `over budget: ${r.suggested_kcal}/${r.budget_kcal}`);
  const chapati = r.items[0]!;
  ok(/^(0\.5|1|1\.5|2|2\.5) chapati/.test(chapati.portion), chapati.portion);
});

Deno.test('dal and salad stay whole; rice and chapati go first', () => {
  const r = suggestPortions(plate, base);
  ok(r.items[2]!.calories === 200, 'dal kept');
  ok(r.items[3]!.calories === 40, 'salad kept');
  ok(r.items[0]!.reduced && r.items[1]!.reduced, 'carbs reduced');
});

Deno.test('a plate within budget: eat it all, unchanged', () => {
  const small = [item('Idli', 140, 4, 2, 'idli', 110), item('Sambar', 120, 5, 1, 'katori', 150)];
  const r = suggestPortions(small, { ...base, mealType: 'breakfast', eatenKcal: 0 });
  ok(r.eat_all, 'eat all');
  ok(r.suggested_kcal === 260, 'unchanged');
  ok(r.items[0]!.portion === '2 idli', r.items[0]!.portion);
});

Deno.test('already over target: still a real meal, never nothing', () => {
  const r = suggestPortions(plate, { ...base, mealType: 'dinner', eatenKcal: 2400 });
  ok(r.budget_kcal === 300, `budget ${r.budget_kcal}`);
  ok(
    r.items.every((i) => i.calories > 0),
    'no empty item',
  );
});

Deno.test('a very low target never goes under the calorie floor', () => {
  const low = mealBudget({ ...base, targetKcal: 800, eatenKcal: 0, mealType: 'dinner' });
  const floor = mealBudget({ ...base, targetKcal: 1200, eatenKcal: 0, mealType: 'dinner' });
  ok(low === floor, `${low} vs ${floor}`);
});

Deno.test('someone who ate little has a bigger dinner, within the cap', () => {
  const hungry = mealBudget({ ...base, mealType: 'dinner', eatenKcal: 645 });
  ok(hungry === 800, `dinner budget ${hungry}`); // capped at half of 1,600
});

Deno.test('a single dish with no countable pieces uses grams', () => {
  const r = suggestPortions([item('Biryani', 900, 25, 0, '', 400)], { ...base, eatenKcal: 500 });
  ok(/about \d+ g/.test(r.items[0]!.portion), r.items[0]!.portion);
  ok(r.items[0]!.calories < 900, 'reduced');
});

Deno.test('low protein suggests foods that fit diet and foods to avoid', () => {
  const plain = [item('Rice', 300, 6, 1.5, 'cup', 225)];
  const r = suggestPortions(plain, { ...base, foodsToAvoid: 'Paneer, mushrooms' });
  ok(r.add_protein_foods.includes('dal'), 'dal');
  ok(!r.add_protein_foods.includes('paneer'), 'avoid paneer');
  ok(!r.add_protein_foods.includes('chicken'), 'veg');
  const vegan = suggestPortions(plain, { ...base, diet: 'vegan' });
  ok(!vegan.add_protein_foods.includes('curd'), 'vegan');
});
