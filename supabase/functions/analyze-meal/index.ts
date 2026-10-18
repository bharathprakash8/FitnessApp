// analyze-meal: estimate the food items in a meal photo or description with Gemini.
// Client callers only. Does NOT save the meal – the client reviews and saves it.
import { encodeBase64 } from 'jsr:@std/encoding@1/base64';
import { z } from 'npm:zod@3';

import { adminClient, requireCaller } from '../_shared/auth.ts';
import { generateJson, type Part } from '../_shared/gemini.ts';
import { HttpError, serveJson } from '../_shared/http.ts';

const DAILY_CAP = 15;
const FOLLOW_UP_CAP = 15;

const SYSTEM = `You are a nutrition estimation assistant for an Indian fitness coaching app. Identify each distinct food item in the meal photo or description. Estimate a realistic portion size for each and its calories, protein, carbohydrates and fat. Recognise Indian dishes accurately (for example idli, dosa, sambar, chapati, rajma chawal, paneer dishes, biryani, poha, upma) and account for typical home-style oil or ghee use. If the input is not food, return an empty items array. Never give medical or diet advice. Return only JSON matching the schema.
If an important detail is unclear (for example how many chapatis, or the size of a bowl), set follow_up_question to one short question and give 2 to 4 short answers in follow_up_options; otherwise set follow_up_question to an empty string and follow_up_options to an empty array.`;

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
  })
  .refine((b) => b.photo_path || b.text, { message: 'Add a photo or describe the meal' });

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

function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
}

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
    .select('diet_preference, timezone')
    .eq('id', caller.id)
    .single();
  if (pErr) throw pErr;
  const day = todayIn(profile.timezone || 'Asia/Kolkata');

  // Daily cap (follow-up answers have their own allowance).
  const feature = body.follow_up ? 'analyze-meal-followup' : 'analyze-meal';
  const cap = body.follow_up ? FOLLOW_UP_CAP : DAILY_CAP;
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
  if (body.follow_up) {
    prompt += `\nYou asked: "${body.follow_up.question}" The client answered: "${body.follow_up.answer}". Use this answer and do not ask again.`;
  }
  parts.push({ text: prompt });

  const result = AiResult.safeParse(
    await generateJson({
      system: SYSTEM,
      parts,
      schema: SCHEMA,
      feature: body.follow_up ? 'meal-follow-up' : body.photo_path ? 'meal-photo' : 'meal-text',
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
  if (body.follow_up) {
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
  const followUp = body.follow_up ? '' : result.data.follow_up_question.trim();
  return {
    items,
    total_calories: Math.round(items.reduce((s, i) => s + i.calories, 0)),
    follow_up_question: followUp || null,
    follow_up_options: followUp ? result.data.follow_up_options : [],
    remaining_today: Math.max(0, DAILY_CAP - mainUsed),
  };
});
