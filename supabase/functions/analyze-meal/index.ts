// analyze-meal: estimate the food items in a meal photo or description with Gemini.
// Client callers only. Does NOT save the meal – the client reviews and saves it.
//   detail: 'quick' (default, at most ~20 s) or 'detailed' (closer look, at most ~30 s)
//   item: { name, portion } – re-estimate one item the client renamed or re-sized
//         (counts against the follow-up allowance, not the main one)
import { encodeBase64 } from 'jsr:@std/encoding@1/base64';
import { z } from 'npm:zod@3';

import { adminClient, requireCaller } from '../_shared/auth.ts';
import { generateJson, lastTimings, type Part } from '../_shared/gemini.ts';
import { HttpError, serveJson } from '../_shared/http.ts';
import { todayIn } from '../_shared/util.ts';

const DAILY_CAP = 15;
const FOLLOW_UP_CAP = 15;

const SYSTEM = `You are a nutrition estimation assistant for an Indian fitness coaching app. Identify each distinct food item in the meal photo or description. Estimate a realistic portion size for each and its calories, protein, carbohydrates and fat. Recognise Indian dishes accurately (for example idli, dosa, sambar, chapati, rajma chawal, paneer dishes, biryani, poha, upma) and account for typical home-style oil or ghee use. If the input is not food, return an empty items array. Never give medical or diet advice. Return only JSON matching the schema.
If an important detail is unclear (for example how many chapatis, or the size of a bowl), set follow_up_question to one short question and give 2 to 4 short answers in follow_up_options; otherwise set follow_up_question to an empty string and follow_up_options to an empty array.

Indian home-cooking guide (use it unless the photo or description clearly shows otherwise):
- Count every item, including ones stacked on top of each other or partly hidden (two idlis on top of each other are two idlis).- Home chapati/roti (about 40 g): 110–130 kcal; with ghee or oil on top 140–170 kcal; dry phulka about 90 kcal. Paratha or thepla: 180–250 kcal each. Puri: about 120 kcal each.
- Home curries and sabzis use about 1–2 teaspoons of oil or ghee per serving (40–90 kcal) – always include it. A bowl (about 200 ml) of dal: 150–220 kcal; of chana masala, rajma or lobia: 250–350 kcal (restaurant style 350–450); of paneer curry: 300–450 kcal; of dry sabzi: 120–200 kcal.
- Cooked rice 1 cup (about 150 g): about 200 kcal. Biryani 1 plate (about 350 g): 550–700 kcal.
- Idli (50–60 g): 60–80 kcal each. Plain dosa: 150–200 kcal; masala dosa: 350–450 kcal. Medu vada: 130–180 kcal each. Upma or poha 1 plate (about 200 g): 250–350 kcal.
- Coconut or peanut chutney: about 35–45 kcal per tablespoon. Sambar 1 bowl: 100–150 kcal.
- Sweets are dense: kaju katli about 45–55 kcal per piece; gulab jamun about 150 kcal each.`;

// Detailed = two steps: first a careful look (what is there and how much), then the estimate.
const LOOK_SYSTEM = `You look carefully at a meal photo for an Indian fitness app. List every distinct food or drink item. Count pieces exactly, including items stacked on top of each other, overlapping or partly hidden. Judge each amount using the plate, bowl, glass or hand as a scale. Note visible oil, ghee, butter, gravy or cream. Do not estimate calories. Return only JSON matching the schema.`;

const LOOK_SCHEMA = {
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          count: { type: 'NUMBER' },
          amount: { type: 'STRING' },
          visible_fat: { type: 'STRING' },
        },
        required: ['name', 'count', 'amount', 'visible_fat'],
      },
    },
    container: { type: 'STRING' },
  },
  required: ['items', 'container'],
};

const LookResult = z.object({
  items: z
    .array(
      z.object({
        name: z.string().max(80),
        count: z.number().min(0).max(50).catch(1),
        amount: z.string().max(80).catch(''),
        visible_fat: z.string().max(80).catch(''),
      }),
    )
    .max(20),
  container: z.string().max(80).catch(''),
});

const SCHEMA = {
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

const Body = z
  .object({
    photo_path: z.string().max(200).optional(),
    text: z.string().trim().max(1000).optional(),
    meal_type: z.enum(['breakfast', 'lunch', 'snack', 'dinner']),
    follow_up: z
      .object({ question: z.string().max(300), answer: z.string().trim().min(1).max(200) })
      .optional(),
    detail: z.enum(['quick', 'detailed']).default('quick'),
    item: z
      .object({ name: z.string().trim().min(1).max(80), portion: z.string().trim().max(80) })
      .optional(),
  })
  .refine((b) => b.photo_path || b.text || b.item, {
    message: 'Add a photo or describe the meal',
  });

// Extra care for "Detailed" estimates.
const DETAILED = `Take extra care with this estimate: look closely at every item, count pieces (chapatis, idlis, pieces of meat), judge each portion against the plate, bowl or hand size, include visible oil, ghee, butter, gravy, chutney and sugar, and think about common hidden ingredients for each dish. Make protein, carbohydrate and fat consistent with the calories (4/4/9 kcal per gram).`;

const num = (max: number) =>
  z.coerce
    .number()
    .catch(0)
    .transform((n) => Math.min(max, Math.max(0, Math.round(n * 10) / 10)));

const AiResult = z.object({
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
      }),
    )
    .max(20),
  follow_up_question: z.string().max(300).catch(''),
  follow_up_options: z.array(z.string().max(60)).max(4).catch([]),
});

serveJson(async (req) => {
  const db = adminClient();
  const caller = await requireCaller(req, db);
  if (caller.role !== 'client' && caller.role !== 'trainer') {
    throw new HttpError(403, 'Only clients and trainers can log meals', 'forbidden');
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new HttpError(400, 'Body must be JSON', 'bad_request');
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid input', 'invalid_input');
  }
  const body = parsed.data;

  const { data: profile, error: pErr } = await db
    .from('profiles')
    .select('diet_preference, timezone, email')
    .eq('id', caller.id)
    .single();
  if (pErr) throw pErr;
  const day = todayIn(profile.timezone || 'Asia/Kolkata');

  // Daily cap (follow-up answers and single-item re-estimates have their own allowance).
  const secondary = Boolean(body.follow_up || body.item);
  const feature = secondary ? 'analyze-meal-followup' : 'analyze-meal';
  // Temporary test accounts (load and accuracy tests) aren't limited; removed at go-live.
  const testAccount = profile.email.endsWith('@fitcoach.test');
  const cap = testAccount ? 1000 : secondary ? FOLLOW_UP_CAP : DAILY_CAP;
  const detailed = body.detail === 'detailed' && !body.item;
  const { data: usage } = await db
    .from('ai_usage')
    .select('count')
    .eq('user_id', caller.id)
    .eq('used_on', day)
    .eq('feature', feature)
    .maybeSingle();
  if ((usage?.count ?? 0) >= cap) {
    throw new HttpError(
      429,
      `You've used today's ${cap} AI estimates. Please add the meal manually – it resets tomorrow.`,
      'daily_cap',
    );
  }

  const parts: Part[] = [];
  if (body.photo_path) {
    // The photo must be in the caller's own folder.
    if (!body.photo_path.startsWith(`${caller.id}/`) || body.photo_path.includes('..')) {
      throw new HttpError(403, 'That photo does not belong to you', 'forbidden');
    }
    const { data: file, error } = await db.storage.from('meal-photos').download(body.photo_path);
    if (error || !file)
      throw new HttpError(404, 'Photo not found. Please take it again.', 'photo_missing');
    parts.push({
      inline_data: {
        mime_type: 'image/jpeg',
        data: encodeBase64(new Uint8Array(await file.arrayBuffer())),
      },
    });
  }
  let prompt = `Diet preference: ${profile.diet_preference ?? 'not given'}. Meal type: ${body.meal_type}.`;
  if (body.text) prompt += `\nThe client describes the meal as: "${body.text}"`;
  if (body.item) {
    const portion = body.item.portion ? `, portion "${body.item.portion}"` : '';
    prompt += `\nEstimate exactly one food item: "${body.item.name}"${portion}. Return exactly one item with this name and portion. Do not ask a follow-up question.`;
  }
  if (detailed) prompt += `\n${DETAILED}`;
  // Detailed photo: step 1, a careful look at what is on the plate (counts and amounts).
  if (detailed && body.photo_path) {
    const look = await generateJson({
      system: LOOK_SYSTEM,
      parts: [...parts, { text: `Meal type: ${body.meal_type}.` }],
      schema: LOOK_SCHEMA,
      feature: 'meal-photo-look',
      temperature: 0,
      thinking: 'low',
      preferLite: true,
      timeoutMs: 12_000,
      budgetMs: 14_000,
    }).catch(() => null); // if the look fails, the estimate still runs on its own
    // Use the look only if it has the expected shape (a bad answer is simply ignored).
    const seen = LookResult.safeParse(look);
    if (seen.success && seen.data.items.length) {
      prompt += `\nA careful look at this photo found (use these counts and amounts): ${JSON.stringify(seen.data).slice(0, 2000)}`;
    }
  }
  if (body.follow_up) {
    prompt += `\nYou asked: "${body.follow_up.question}" The client answered: "${body.follow_up.answer}". Use this answer and do not ask again.`;
  }
  parts.push({ text: prompt });

  const result = AiResult.safeParse(
    await generateJson({
      system: SYSTEM,
      parts,
      schema: SCHEMA,
      feature: body.item
        ? 'meal-reestimate'
        : body.follow_up
          ? 'meal-follow-up'
          : body.photo_path
            ? detailed
              ? 'meal-photo-detailed'
              : 'meal-photo'
            : 'meal-text',
      // Lite models first (fast, large free quota); the same answer for the same photo.
      preferLite: true,
      temperature: 0,
      thinking: detailed && !body.photo_path ? 'medium' : 'low',
      timeoutMs: detailed ? 14_000 : 10_000,
      budgetMs: detailed ? 18_000 : 24_000,
    }),
  );
  if (!result.success) {
    throw new HttpError(
      502,
      'The AI could not read this meal. Try again or enter it manually.',
      'ai_invalid',
    );
  }

  // Count only successful estimates.
  const { data: newCount } = await db.rpc('bump_ai_usage', { uid: caller.id, day, feat: feature });

  // "Left today" always refers to the main allowance, also after a follow-up answer.
  let mainUsed = Number(newCount ?? 0);
  if (secondary) {
    const { data: main } = await db
      .from('ai_usage')
      .select('count')
      .eq('user_id', caller.id)
      .eq('used_on', day)
      .eq('feature', 'analyze-meal')
      .maybeSingle();
    mainUsed = main?.count ?? 0;
  }

  const items = result.data.items;
  const followUp = secondary ? '' : result.data.follow_up_question.trim();
  return {
    items,
    total_calories: Math.round(items.reduce((s, i) => s + i.calories, 0)),
    follow_up_question: followUp || null,
    follow_up_options: followUp ? result.data.follow_up_options : [],
    remaining_today: Math.max(0, DAILY_CAP - mainUsed),
    ai_timing: lastTimings, // which models were tried and how long each took
  };
});
