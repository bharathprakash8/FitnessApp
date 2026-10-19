import { supabase } from '../../lib/supabase';

/**
 * Everything FitCoach stores about one person, as one JSON file (privacy request).
 * Admins can read all rows (RLS); photos are listed by path, not included.
 */
export async function exportUserData(userId: string): Promise<Blob> {
  const by = (table: string, column = 'client_id') =>
    supabase
      .from(table as never)
      .select('*')
      .eq(column, userId)
      .then(({ data, error }) => {
        if (error) throw error;
        return data ?? [];
      });

  const [
    profile,
    trainerLink,
    targets,
    measurements,
    meals,
    workouts,
    selfWorkouts,
    activity,
    water,
    reminders,
    trainerReminders,
    sessions,
    summaries,
    planAssignments,
    pushDevices,
    aiUsage,
  ] = await Promise.all([
    by('profiles', 'id'),
    by('trainer_clients'),
    by('targets'),
    by('measurements'),
    by('meal_logs'),
    by('workout_logs'),
    supabase
      .from('self_workouts')
      .select('*, self_workout_exercises(*)')
      .eq('client_id', userId)
      .then(({ data, error }) => {
        if (error) throw error;
        return data ?? [];
      }),
    by('activity_daily'),
    by('habits_daily'),
    by('reminder_settings'),
    by('custom_reminders'),
    supabase
      .from('session_attendees')
      .select('status, sessions(title, starts_at, duration_min, type, location, status)')
      .eq('client_id', userId)
      .then(({ data, error }) => {
        if (error) throw error;
        return data ?? [];
      }),
    by('weekly_summaries'),
    by('plan_assignments'),
    supabase
      .from('push_tokens')
      .select('platform, created_at, last_seen_at')
      .eq('user_id', userId)
      .then(({ data, error }) => {
        if (error) throw error;
        return data ?? [];
      }),
    by('ai_usage', 'user_id'),
  ]);

  const doc = {
    exported_at: new Date().toISOString(),
    note: 'All data FitCoach holds about this person. Photos are listed by file name only.',
    profile: profile[0] ?? null,
    trainer_link: trainerLink[0] ?? null,
    targets,
    measurements,
    meals,
    workout_sets: workouts,
    own_workouts: selfWorkouts,
    activity,
    water,
    reminder_settings: reminders,
    reminders_from_trainer: trainerReminders,
    sessions,
    weekly_summaries: summaries,
    workout_plan_assignments: planAssignments,
    notification_devices: pushDevices,
    ai_usage_per_day: aiUsage,
  };
  return new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
}

/** Save a file on the device (browser download). */
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
