// Reading a meal with Gemini, and the portion suggestion built on it. Used by analyze-meal (the app)
// and by the coach function's portion_preview (a test that saves nothing).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';

import { withTableValues } from './foodTable.ts';
import { suggestPortions, type MealType, type PlateItem } from './portion.ts';

export const SYSTEM = `You are a nutrition estimation assistant for an Indian fitness coaching app. Identify each distinct food item in the meal photo or description. Estimate a realistic portion size for each and its calories, protein, carbohydrates and fat. Recognise Indian dishes accurately (for example idli, dosa, sambar, chapati, rajma chawal, paneer dishes, biryani, poha, upma) and account for typical home-style oil or ghee use. If the input is not food, return an empty items array. Never give medical or diet advice. Return only JSON matching the schema.
If an important detail is unclear (for example how many chapatis, or the size of a bowl), set follow_up_question to one short question and give 2 to 4 short answers in follow_up_options; otherwise set follow_up_question to an empty string and follow_up_options to an empty array.

Indian home-cooking guide (use it unless the photo or description clearly shows otherwise):
- Count every item, including ones stacked on top of each other or partly hidden (two idlis on top of each other are two idlis).- Home chapati/roti (about 40 g): 110–130 kcal; with ghee or oil on top 140–170 kcal; dry phulka about 90 kcal. Paratha or thepla: 180–250 kcal each. Puri: about 120 kcal each.
- Home curries and sabzis use about 1–2 teaspoons of oil or ghee per serving (40–90 kcal) – always include it. A bowl (about 200 ml) of dal: 150–220 kcal; of chana masala, rajma or lobia: 250–350 kcal (restaurant style 350–450); of paneer curry: 300–450 kcal; of dry sabzi: 120–200 kcal.
- Cooked rice 1 cup (about 150 g): about 200 kcal. Biryani 1 plate (about 350 g): 550–700 kcal.
- Idli (50–60 g): 60–80 kcal each. Plain dosa: 150–200 kcal; masala dosa: 350–450 kcal. Medu vada: 130–180 kcal each. Upma or poha 1 plate (about 200 g): 250–350 kcal.
- Coconut or peanut chutney: about 35–45 kcal per tablespoon. Sambar 1 bowl: 100–150 kcal.
- Sweets are dense: kaju katli about 45–55 kcal per piece; gulab jamun about 150 kcal each.`;

export const SCHEMA = {
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          portion: { type: 'STRING' },
          calories: { type: 'NUMBER' },
          protein_g: { type: 'NUMBER' },
          carbs_g: { type: 'NUMBER' },
          fat_g: { type: 'NUMBER' },
          confidence: { type: 'STRING', enum: ['high', 'medium', 'low'] },
        },
        required: ['name', 'portion', 'calories', 'protein_g', 'carbs_g', 'fat_g', 'confidence'],
      },
    },
    follow_up_question: { type: 'STRING' },
    follow_up_options: { type: 'ARRAY', items: { type: 'STRING' } },
    total_calories: { type: 'NUMBER' },
  },
  required: ['items', 'follow_up_question', 'follow_up_options', 'total_calories'],
};

// Portion advice also needs each item in household units.
export const ADVICE_SCHEMA = {
  ...SCHEMA,
  properties: {
    ...SCHEMA.properties,
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          ...SCHEMA.properties.items.items.properties,
          count: { type: 'NUMBER' },
          unit: { type: 'STRING' },
          grams: { type: 'NUMBER' },
        },
        required: [...SCHEMA.properties.items.items.required, 'count', 'unit', 'grams'],
      },
    },
  },
};

export const ADVICE_PROMPT = `For each item also give the amount on the plate: unit is what an Indian home cook counts it in (chapati, idli, dosa, piece, katori, cup, tablespoon, glass), count is how many of that unit (use 0 and an empty unit only when it can't be counted), and grams is your estimate of its total weight. This amount decides how much the person is told to eat, so judge the real size against the plate and bowl: don't default to "medium", and count only the food you can see (the plate may be partly eaten). A dosa reaching across most of the plate is large: 300-400 kcal with its oil. Raita is 80-100 kcal per half cup. Pickle or thokku is 40-45 kcal per tablespoon. Do not ask a follow-up question.`;

const num = (max: number) =>
  z.coerce
    .number()
    .catch(0)
    .transform((n) => Math.min(max, Math.max(0, Math.round(n * 10) / 10)));

export const AiResult = z.object({
  items: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        portion: z.string().trim().max(80).catch(''),
        calories: num(5000),
        protein_g: num(500),
        carbs_g: num(1000),
        fat_g: num(500),
        confidence: z.enum(['high', 'medium', 'low']).catch('low'),
        count: num(50).catch(0),
        unit: z.string().trim().max(30).catch(''),
        grams: num(3000).catch(0),
      }),
    )
    .max(20),
  follow_up_question: z.string().max(300).catch(''),
  follow_up_options: z.array(z.string().max(60)).max(4).catch([]),
});

/** The suggestion for this plate, from the person's target and what they have logged today. */
export async function portionAdvice(
  db: SupabaseClient,
  clientId: string,
  day: string,
  profile: {
    sex: string | null;
    diet_preference: string | null;
    foods_to_avoid: string | null;
    health_conditions: string[] | null;
  },
  plate: PlateItem[],
  mealType: MealType,
) {
  const [{ data: target }, { data: today }] = await Promise.all([
    db
      .from('targets')
      .select('calories, protein_g, carbs_g, fat_g')
      .eq('client_id', clientId)
      .lte('effective_from', day)
      .order('effective_from', { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from('meal_logs')
      .select('meal_type, total_calories, protein_g, carbs_g, fat_g')
      .eq('client_id', clientId)
      .eq('eaten_on', day),
  ]);
  if (!target) return { status: 'no_target' as const };
  const rows = today ?? [];
  const sum = (pick: (r: (typeof rows)[number]) => unknown) =>
    rows.reduce((s, r) => s + Number(pick(r) ?? 0), 0);
  const eaten = {
    kcal: sum((r) => r.total_calories),
    protein: sum((r) => r.protein_g),
    carbs: sum((r) => r.carbs_g),
    fat: sum((r) => r.fat_g),
  };
  const read = plate.map(withTableValues);
  return {
    status: 'ok' as const,
    eaten_today_kcal: Math.round(eaten.kcal),
    meals_logged_today: rows.length,
    caution: (profile.health_conditions ?? []).length > 0,
    foods_from_table: read.filter((i) => i.from_table).length,
    ...suggestPortions(read, {
      mealType,
      target,
      eaten,
      loggedMeals: rows.map((r) => r.meal_type as MealType),
      sex: profile.sex,
      diet: profile.diet_preference,
      foodsToAvoid: profile.foods_to_avoid,
    }),
  };
}
