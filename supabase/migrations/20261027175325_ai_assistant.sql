-- AI assistant for human trainers (owner, 27 Oct 2026). The AI coach now works two ways:
--   1. AI-only: the client's trainer is the FitCoach AI Coach account; the admin approves.
--   2. Assisted: the client keeps their human trainer and trainer_clients.ai_assist is on;
--      the head coach still reviews them every morning, but its proposals go to that trainer,
--      who approves (or lets small changes apply automatically: profiles.ai_auto_apply).
-- The switch is changed through the coach function (trainer for own clients, or admin).

alter table public.trainer_clients
  add column ai_assist boolean not null default false;

alter table public.profiles
  add column ai_auto_apply boolean not null default false;

-- A trainer sees the coach's changes and proposals for their own clients (not the runs –
-- a run report covers everyone).
create policy "coach_actions_trainer" on public.coach_actions
  for select to authenticated using (public.is_trainer_of(client_id));

-- A trainer reads their own clients' playbook pages (the shared page stays admin-only).
create policy "coach_playbook_trainer" on public.coach_playbook
  for select to authenticated
  using (client_id is not null and public.is_trainer_of(client_id));

