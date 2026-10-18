-- Check the client's change before resetting "muted", so muting an always-on reminder is
-- refused with a clear error instead of being silently ignored.
create or replace function public.guard_custom_reminders()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) = old.client_id then
    if (to_jsonb(new) - 'muted' - 'updated_at') is distinct from (to_jsonb(old) - 'muted' - 'updated_at') then
      raise exception 'Only your trainer can change this reminder' using errcode = '42501';
    end if;
    if new.muted and not old.client_can_mute then
      raise exception 'Your trainer has made this reminder always on' using errcode = '42501';
    end if;
  end if;
  if not new.client_can_mute then
    new.muted := false;
  end if;
  return new;
end;
$$;
