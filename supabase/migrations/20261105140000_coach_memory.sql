-- Long-term memory for the AI trainer: a lasting fact the person mentioned in a chat (travel
-- routine, foods they dislike, a knee that hurts on stairs). Same access rules as the chat itself.
alter table public.coach_queries
  add column remembered text check (remembered is null or length(remembered) <= 200);

create index coach_queries_memory_idx on public.coach_queries (client_id, created_at desc)
  where remembered is not null;
