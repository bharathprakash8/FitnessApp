-- The head coach stopped after 29 Oct, leaving 37 suggestions waiting for approval. Their notes
-- and day plans are for dates long past. Same effect as pressing Reject on each one: only the
-- status changes, and the rows stay as history. Newer suggestions are not touched.
update public.coach_actions
set status = 'rejected', decided_at = now()
where status = 'proposed'
  and created_at < '2026-10-30 00:00:00+00';
