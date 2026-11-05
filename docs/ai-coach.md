# AI coach

Built 27 Oct 2026 (phases 1–3 of the AI coach plan).

## Two ways to use it (27 Oct 2026)

| | AI-only | Trainer + AI assistant |
|---|---|---|
| Set up | Admin → Users → person → Trainer = **FitCoach AI Coach** | Trainer → client → Overview → **AI assistant** on (or admin) |
| Who approves the head coach's changes | Admin (Admin → AI Coach); in live mode small changes apply at once | **The trainer** (Clients → AI assistant). Setting: *I approve all* (default) or *Auto small changes* |
| Escalated questions / flags go to | Admins | The trainer (red flags also to admins) |
| Plan | Coach may propose one of its safe plans | The trainer's own plan – the coach only picks days, never assigns a plan |
| Client sees | "Your AI coach" | "Ravi's AI assistant" |

`trainer_clients.ai_assist`, `profiles.ai_auto_apply`. Trainers read coach changes and playbook
pages of their own clients only (RLS); run reports and the shared playbook stay admin-only. The
global mode (Off / Dry run / Live) still applies to everyone: in dry run every change waits.

## What it is

- **FitCoach AI Coach** is a trainer account (`ai.coach@fitcoach.app`, nobody can log in as it).
  Map anyone to it in Admin → Users → person → Trainer, like a human trainer.
- The person sees a **"Meet your AI coach"** card on Today and must agree once
  (`profiles.coach_consent_at`). Until then nothing about them goes to the coach.
- **Day coach** (Gemini, on the API key owned by nidhi@samhithe.in):
  - **Ask coach** chat (`/coach`). Red-flag words (chest pain, dizzy, breathless, fainting,
    sugar very low/high, in English and Kannada) get a fixed "stop, call your doctor / 108"
    reply without asking the AI, and the admins get a push.
  - Health, medicine or supplement questions are **escalated** to the head coach / admin.
  - **Morning note** from 8:30 and **evening note** from 20:30 (person's time zone; pg_cron job
    `coach-tick` every 30 minutes). The head coach's note replaces the morning note.
- **Head coach** (Gemini on the server, daily from 7:00 AM IST, PC not needed): reviews every person and every meal photo, corrects
  calories, sets today's plan (workout day / light / rest, ±200 kcal), writes the note, answers
  escalated questions, keeps the **playbook** the day coach follows, and sends the admin a
  report. Instructions: `supabase/functions/_shared/headCoach.ts`.

## Safety rules (server, `supabase/functions/coach`)

- Exercises: every exercise in a chosen workout day or plan must have the safety tags the
  person needs (55+ → senior_safe, knee → knee_friendly, back → back_friendly,
  BP/diabetes/heart/pregnancy → low_impact). Tags are in `exercises.safety_tags`.
- Calories: never below 1,200 (women) / 1,500 kcal; a target changes by at most 10% at a time;
  protein 0.8–2.5 g per kg. New targets and plans **always** wait for the admin.
- Meal fixes: changes over 300 kcal (or over 150 kcal and 60% of the meal), and meals the person
  edited themselves, become a **suggestion** with Accept / Keep mine.
- Every change is stored in `coach_actions` with the old value → **Undo** in Admin → AI Coach.

## Modes (Admin → AI Coach)

| Mode | Head coach | Day coach |
|---|---|---|
| Off | not run | off |
| **Dry run** (default) | proposes only – you approve each change | on |
| Live | small changes apply at once (undo possible); targets/plans still need you | on |

If the head coach hasn't run by 9 AM IST, admins get a push; people keep their normal plans.

## Running the head coach

- **Now:** pg_cron job `coach-head-tick` calls the `coach` function every 5 minutes from 06:30 to
  09:55 IST (`head_tick`). From 7:00 it starts one run a day and reviews a few people per call, one
  Gemini request per person; `coach_runs.progress` remembers who is done, and each person gets up
  to 3 tries. When everyone is done, the report goes to the admin.
- Start one early: POST `{ "action": "head_tick" }` with the `x-coach-key` header, repeated until it
  returns `finished`.
- Each new run turns down notes and day plans still waiting from earlier days. Meals already
  suggested or turned down are not proposed again.
- **Old manual way (fallback):** Claude Code with `coach/HEAD_COACH.md`, `scripts/coach-fetch.mjs`
  and `scripts/coach-apply.mjs`.
- Key: `COACH_API_KEY` – Supabase secret, local copy in git-ignored `.env.coach.local`.
  New key: generate a random string, put it in `.env.coach.local`, and set it with
  `npx supabase secrets set --env-file <temp file>` (never on the command line).

## Costs

Gemini free tier for both, sharing its daily limit with meal estimates. Free-tier content may be
used by Google to improve its services (the consent text says so).

## Testing

- `npm run db:test` includes the AI coach RLS checks.
- The head-coach key may also run `setup` (first set-up) and `note_now` (a note on demand).
- The temporary test accounts and test helpers were removed on 28 Oct 2026.
