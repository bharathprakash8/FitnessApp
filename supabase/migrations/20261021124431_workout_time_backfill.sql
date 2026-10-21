-- Sets logged before workout times existed got the migration time as performed_at.
-- Use the time each set was saved instead (close to when it was done).
update public.workout_logs
set performed_at = created_at
where performed_at > created_at;
