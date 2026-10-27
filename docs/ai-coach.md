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
- **Day coach** (fast AI – Groq GPT-OSS 120B, then Qwen, then Gemini as backup):
  - **Ask coach** chat (`/coach`). Red-flag words (chest pain, dizzy, breathless, fainting,
    sugar very low/high, in English and Kannada) get a fixed "stop, call your doctor / 108"
    reply without asking the AI, and the admins get a push.
  - Health, medicine or supplement questions are **escalated** to the head coach / admin.
  - **Morning note** from 8:30 and **evening note** from 20:30 (person's time zone; pg_cron job
    `coach-tick` every 30 minutes). The head coach's note replaces the morning note.
- **Head coach** (Claude, daily ~7:30 AM): reviews every person and every meal photo, corrects
  calories, sets today's plan (workout day / light / rest, ±200 kcal), writes the note, answers
  escalated questions, keeps the **playbook** the day coach follows, and sends the admin a
  report. Instructions: `coach/HEAD_COACH.md`.

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

- **Now:** a scheduled task in the Claude desktop app on the owner's PC
  ("FitCoach head coach", daily 7:30 AM; the PC and app must be on – if not, it runs on next
  launch). It uses the owner's Claude Pro plan.
- By hand: open Claude Code in this folder and say "run the head coach as in coach/HEAD_COACH.md".
- Scripts: `node scripts/coach-fetch.mjs` (digest + photos into the git-ignored `coach-work/`),
  `node scripts/coach-apply.mjs` (sends actions + report, deletes `coach-work/`).
- Key: `COACH_API_KEY` – Supabase secret, local copy in git-ignored `.env.coach.local`.
  New key: generate a random string, put it in `.env.coach.local`, and set it with
  `npx supabase secrets set --env-file <temp file>` (never on the command line).
- **Later:** move the head coach to the Claude API (Console, prepaid) so it doesn't use the Pro
  plan – same coach function; `start_run` accepts `source: 'claude_api'`.

## Costs

Day coach: Groq free tier (+ Gemini free as backup). Head coach: owner's Claude Pro plan
(~₹0 extra; measure usage in the first week).

## Testing

- `npm run db:test` includes the AI coach RLS checks.
- Temporary test helpers (remove at go-live with the test users): `test-users` actions
  `map_to_coach` and `coach_mode`; the head-coach key may also run `setup` and `note_now`.
