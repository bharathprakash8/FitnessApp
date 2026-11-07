// Typical home values for common Indian foods, per unit, so the same idli has the same numbers every
// time instead of a fresh AI guess. These are general nutrition values for typical recipes, not lab
// measurements of anyone's kitchen. The AI still decides what the food is and how big it looks.
import type { PlateItem } from './portion.ts';

interface Row {
  match: RegExp;
  unit: RegExp;
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}
const CUP = /cup|katori|bowl/;
const row = (
  match: RegExp,
  unit: RegExp,
  grams: number,
  kcal: number,
  protein: number,
  carbs: number,
  fat: number,
): Row => ({ match, unit, grams, kcal, protein, carbs, fat });

// The first match wins, so specific names come before general ones.
const FOODS: Row[] = [
  row(/sprout/, CUP, 100, 100, 8, 15, 1),
  row(/masala dosa/, /dosa|piece/, 180, 400, 8, 56, 16),
  row(/rava dosa/, /dosa|piece/, 110, 240, 4, 34, 10),
  row(/dosa/, /dosa|piece/, 90, 220, 5, 36, 6),
  row(/idl[iy]/, /idl[iy]|piece/, 55, 70, 2, 14, 0.5),
  row(/medu vada|vada/, /vada|piece/, 50, 150, 4, 14, 9),
  row(/aloo paratha|paratha|thepla/, /paratha|thepla|piece/, 90, 220, 5, 30, 9),
  row(/puri|poori/, /puri|poori|piece/, 30, 120, 2, 14, 6),
  row(/phulka/, /phulka|chapati|roti|piece/, 30, 90, 3, 18, 1),
  row(/chapati|roti/, /chapati|roti|piece/, 40, 120, 3, 20, 3),
  row(/biryani/, /plate/, 350, 620, 14, 85, 24),
  row(/pulao|tomato rice|masala rice|lemon rice|curd rice/, /cup/, 170, 240, 4, 40, 7),
  row(/rice/, /cup/, 150, 200, 4, 44, 0.5),
  row(/upma/, /plate/, 200, 280, 6, 40, 10),
  row(/poha/, /plate/, 200, 270, 5, 45, 8),
  row(/sambar/, CUP, 200, 120, 6, 18, 3),
  row(/rasam/, CUP, 200, 60, 2, 10, 1),
  row(/rajma|lobia|chole|chana masala/, CUP, 200, 290, 13, 40, 8),
  row(/sundal/, CUP, 120, 180, 9, 26, 5),
  row(/dal|daal/, CUP, 200, 180, 10, 25, 5),
  row(/paneer/, CUP, 200, 350, 16, 12, 26),
  row(/chicken/, CUP, 200, 300, 28, 8, 17),
  row(/sabzi|sabji|palya|bhindi|poriyal/, CUP, 150, 150, 3, 15, 8),
  row(/raita/, CUP, 120, 90, 4, 7, 5),
  row(/curd|dahi|yogh?urt/, CUP, 100, 100, 6, 5, 6),
  row(/boiled egg|omelette|egg/, /egg|piece/, 50, 75, 6, 1, 5),
  row(/banana/, /banana|piece/, 118, 105, 1, 27, 0.5),
  row(/tea|coffee/, /cup|glass/, 150, 70, 2, 10, 2),
  row(/coconut chutney|peanut chutney|chutney/, /tablespoon|tbsp/, 15, 40, 0.5, 2, 3.5),
  row(/pickle|thokku/, /tablespoon|tbsp/, 15, 45, 0.3, 2, 4),
];

/** How much a food's numbers may follow its visible size. */
const SIZE_LOW = 0.7;
const SIZE_HIGH = 1.6;

/** Use the table's numbers when the food and unit are known; otherwise keep the AI's reading. */
export function withTableValues(item: PlateItem): PlateItem & { from_table: boolean } {
  const name = item.name.toLowerCase();
  const unit = item.unit.toLowerCase();
  const r = FOODS.find((f) => f.match.test(name));
  if (!r || !(item.count > 0) || !r.unit.test(unit)) return { ...item, from_table: false };
  // A big dosa has more in it than a small one, within reason.
  const seen = item.grams > 0 ? item.grams / item.count / r.grams : 1;
  const size = Math.min(SIZE_HIGH, Math.max(SIZE_LOW, seen));
  const amount = item.count * size;
  return {
    ...item,
    calories: Math.round(r.kcal * amount),
    protein_g: Math.round(r.protein * amount * 10) / 10,
    carbs_g: Math.round(r.carbs * amount * 10) / 10,
    fat_g: Math.round(r.fat * amount * 10) / 10,
    from_table: true,
  };
}
