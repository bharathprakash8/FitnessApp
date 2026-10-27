-- Trainers answer questions and edit playbook pages for their assisted clients.
alter table public.coach_queries drop constraint coach_queries_follow_up_by_check;
alter table public.coach_queries add constraint coach_queries_follow_up_by_check
  check (follow_up_by is null or follow_up_by in ('claude', 'admin', 'trainer'));
alter table public.coach_playbook drop constraint coach_playbook_updated_by_check;
alter table public.coach_playbook add constraint coach_playbook_updated_by_check
  check (updated_by in ('claude', 'admin', 'trainer'));
