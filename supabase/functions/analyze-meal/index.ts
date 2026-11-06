// analyze-meal: estimate the food items in a meal photo or description with Gemini.
// Client callers only. Does NOT save the meal – the client reviews and saves it.
//   detail: 'quick' (default, at most ~20 s) or 'detailed' (closer look, at most ~30 s)
//   item: { name, portion } – re-estimate one item the client renamed or re-sized
//         (counts against the follow-up allowance, not the main one)
//   advice: true – also suggest how much of this plate to eat (see _shared/portion.ts)
import { encodeBase64 } from 'jsr:@std/encoding@1/base64';
import { z } from 'npm:zod@3';

import { adminClient, requireCaller } from '../_shared/auth.ts';
import { generateJson, lastTimings, type Part } from '../_shared/gemini.ts';
import { HttpError, serveJson } from '../_shared/http.ts';
import {
  ADVICE_PROMPT,
  ADVICE_SCHEMA,
  AiResult,
  portionAdvice,
  SCHEMA,
  SYSTEM,
} from '../_shared/mealAi.ts';
import { todayIn } from '../_shared/util.ts';

const DAILY_CAP = 15;
const FOLLOW_UP_CAP = 15;

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
    advice: z.boolean().default(false),
  })
  .refine((b) => b.photo_path || b.text || b.item, {
    message: 'Add a photo or describe the meal',
  });

// Extra care for "Detailed" estimates.
const DETAILED = `Take extra care with this estimate: look closely at every item, count pieces (chapatis, idlis, pieces of meat), judge each portion against the plate, bowl or hand size, include visible oil, ghee, butter, gravy, chutney and sugar, and think about common hidden ingredients for each dish. Make protein, carbohydrate and fat consistent with the calories (4/4/9 kcal per gram).`;

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
    .select('diet_preference, timezone, sex, foods_to_avoid, health_conditions')
    .eq('id', caller.id)
    .single();
  if (pErr) throw pErr;
  const day = todayIn(profile.timezone || 'Asia/Kolkata');

  // Daily cap (follow-up answers and single-item re-estimates have their own allowance).
  const secondary = Boolean(body.follow_up || body.item);
  const feature = secondary ? 'analyze-meal-followup' : 'analyze-meal';
  const cap = secondary ? FOLLOW_UP_CAP : DAILY_CAP;
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
  const wantsAdvice = body.advice && !secondary;
  if (wantsAdvice) prompt += `\n${ADVICE_PROMPT}`;
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
      schema: wantsAdvice ? ADVICE_SCHEMA : SCHEMA,
      feature: wantsAdvice
        ? 'meal-portion'
        : body.item
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

  const plate = result.data.items;
  // What the app saves: the portion fields only.
  const items = plate.map(({ count: _c, unit: _u, grams: _g, ...item }) => item);
  const followUp = secondary || wantsAdvice ? '' : result.data.follow_up_question.trim();

  const advice =
    wantsAdvice && plate.length
      ? await portionAdvice(db, caller.id, day, profile, plate, body.meal_type)
      : null;

  return {
    items,
    total_calories: Math.round(items.reduce((s, i) => s + i.calories, 0)),
    follow_up_question: followUp || null,
    follow_up_options: followUp ? result.data.follow_up_options : [],
    remaining_today: Math.max(0, DAILY_CAP - mainUsed),
    advice,
    ai_timing: lastTimings, // which models were tried and how long each took
  };
});
