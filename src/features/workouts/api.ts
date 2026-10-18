import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { TablesInsert, TablesUpdate } from '../../lib/database.types';
import { supabase } from '../../lib/supabase';
import {
  sortPlan,
  type Exercise,
  type LogWithExercise,
  type PlanAssignment,
  type PlanFull,
  type SelfWorkoutFull,
  type WorkoutPlan,
  sortSelfWorkout,
} from './model';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------
export const exercisesKey = ['exercises'] as const;
export const plansKey = (trainerId: string | undefined) => ['plans', trainerId] as const;
export const planKey = (planId: string | undefined) => ['plan', planId] as const;
export const assignmentKey = (clientId: string | undefined) => ['assignment', clientId] as const;
export const planAssignmentsKey = (planId: string | undefined) =>
  ['plan-assignments', planId] as const;
export const logsKey = (clientId: string | undefined) => ['workout-logs', clientId] as const;
export const selfWorkoutsKey = (clientId: string | undefined) =>
  ['self-workouts', clientId] as const;

const PLAN_SELECT = '*, plan_days(*, plan_exercises(*, exercises(*)))';

// ---------------------------------------------------------------------------
// Exercises
// ---------------------------------------------------------------------------

/** Every exercise this user may see (shared library + own/trainer's), not archived. */
export function useExercises() {
  return useQuery({
    queryKey: exercisesKey,
    queryFn: async (): Promise<Exercise[]> => {
      const { data, error } = await supabase
        .from('exercises')
        .select('*')
        .eq('is_archived', false)
        .order('name');
      if (error) throw error;
      return data;
    },
  });
}

export function useSaveExercise() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ex: TablesInsert<'exercises'> & { id?: string }) => {
      const { id, ...fields } = ex;
      const { error } = id
        ? await supabase.from('exercises').update(fields).eq('id', id)
        : await supabase.from('exercises').insert(fields);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: exercisesKey }),
  });
}

/** Exercises used in plans or logs can't be deleted, so they are archived (hidden). */
export function useArchiveExercise() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('exercises').update({ is_archived: true }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: exercisesKey }),
  });
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

export interface PlanSummary extends WorkoutPlan {
  dayCount: number;
  activeClients: number;
}

export function useMyPlans(trainerId: string | undefined) {
  return useQuery({
    queryKey: plansKey(trainerId),
    enabled: Boolean(trainerId),
    queryFn: async (): Promise<PlanSummary[]> => {
      const { data, error } = await supabase
        .from('workout_plans')
        .select('*, plan_days(id), plan_assignments(id, is_active)')
        .eq('trainer_id', trainerId!)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data.map(({ plan_days, plan_assignments, ...p }) => ({
        ...p,
        dayCount: plan_days.length,
        activeClients: plan_assignments.filter((a) => a.is_active).length,
      }));
    },
  });
}

export function usePlan(planId: string | undefined) {
  return useQuery({
    queryKey: planKey(planId),
    enabled: Boolean(planId),
    queryFn: async (): Promise<PlanFull | null> => {
      const { data, error } = await supabase
        .from('workout_plans')
        .select(PLAN_SELECT)
        .eq('id', planId!)
        .maybeSingle();
      if (error) throw error;
      return data ? sortPlan(data as unknown as PlanFull) : null;
    },
  });
}

/** All plan editing goes through here; every change refreshes the plan and plan lists. */
export function usePlanMutation<T>(planId: string | undefined, fn: (input: T) => Promise<void>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: planKey(planId) }),
        qc.invalidateQueries({ queryKey: ['plans'] }),
      ]),
  });
}

const check = ({ error }: { error: unknown }) => {
  if (error) throw error;
};

export const planApi = {
  async create(trainerId: string, name: string): Promise<string> {
    const { data, error } = await supabase
      .from('workout_plans')
      .insert({ trainer_id: trainerId, name })
      .select('id')
      .single();
    if (error) throw error;
    const { error: dayErr } = await supabase
      .from('plan_days')
      .insert({ plan_id: data.id, day_index: 0, title: 'Day 1' });
    if (dayErr) throw dayErr;
    return data.id;
  },
  update: async (id: string, fields: TablesUpdate<'workout_plans'>) =>
    check(await supabase.from('workout_plans').update(fields).eq('id', id)),
  remove: async (id: string) => check(await supabase.from('workout_plans').delete().eq('id', id)),
  addDay: async (planId: string, dayIndex: number, title: string) =>
    check(await supabase.from('plan_days').insert({ plan_id: planId, day_index: dayIndex, title })),
  updateDay: async (id: string, fields: TablesUpdate<'plan_days'>) =>
    check(await supabase.from('plan_days').update(fields).eq('id', id)),
  removeDay: async (id: string) => check(await supabase.from('plan_days').delete().eq('id', id)),
  addExercise: async (row: TablesInsert<'plan_exercises'>) =>
    check(await supabase.from('plan_exercises').insert(row)),
  updateExercise: async (id: string, fields: TablesUpdate<'plan_exercises'>) =>
    check(await supabase.from('plan_exercises').update(fields).eq('id', id)),
  removeExercise: async (id: string) =>
    check(await supabase.from('plan_exercises').delete().eq('id', id)),

  /** Copy a plan with its days and exercises (not its assignments). */
  async duplicate(plan: PlanFull, trainerId: string): Promise<string> {
    const { data, error } = await supabase
      .from('workout_plans')
      .insert({
        trainer_id: trainerId,
        name: `${plan.name} (copy)`.slice(0, 80),
        description: plan.description,
      })
      .select('id')
      .single();
    if (error) throw error;
    for (const day of plan.plan_days) {
      const { data: newDay, error: dErr } = await supabase
        .from('plan_days')
        .insert({ plan_id: data.id, day_index: day.day_index, title: day.title })
        .select('id')
        .single();
      if (dErr) throw dErr;
      if (day.plan_exercises.length) {
        const { error: eErr } = await supabase.from('plan_exercises').insert(
          day.plan_exercises.map((pe) => ({
            plan_day_id: newDay.id,
            exercise_id: pe.exercise_id,
            sort_order: pe.sort_order,
            sets: pe.sets,
            reps: pe.reps,
            rest_seconds: pe.rest_seconds,
            notes: pe.notes,
          })),
        );
        if (eErr) throw eErr;
      }
    }
    return data.id;
  },
};

// ---------------------------------------------------------------------------
// Assignments
// ---------------------------------------------------------------------------

/** The client's active plan assignment, with the full plan. */
export function useActivePlan(clientId: string | undefined) {
  return useQuery({
    queryKey: assignmentKey(clientId),
    enabled: Boolean(clientId),
    queryFn: async (): Promise<{ assignment: PlanAssignment; plan: PlanFull } | null> => {
      const { data, error } = await supabase
        .from('plan_assignments')
        .select(`*, workout_plans(${PLAN_SELECT})`)
        .eq('client_id', clientId!)
        .eq('is_active', true)
        .maybeSingle();
      if (error) throw error;
      if (!data || !data.workout_plans) return null;
      const { workout_plans, ...assignment } = data;
      return { assignment, plan: sortPlan(workout_plans as unknown as PlanFull) };
    },
  });
}

export function usePlanAssignments(planId: string | undefined) {
  return useQuery({
    queryKey: planAssignmentsKey(planId),
    enabled: Boolean(planId),
    queryFn: async (): Promise<PlanAssignment[]> => {
      const { data, error } = await supabase
        .from('plan_assignments')
        .select('*')
        .eq('plan_id', planId!)
        .eq('is_active', true);
      if (error) throw error;
      return data;
    },
  });
}

/** Give `planId` to `add` clients and end it for `remove` clients. */
export function useSetPlanClients(defaultPlanId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      add,
      remove,
      planId = defaultPlanId,
    }: {
      add: string[];
      remove: string[];
      planId?: string;
    }) => {
      if (add.length) {
        check(
          await supabase
            .from('plan_assignments')
            .insert(add.map((client_id) => ({ plan_id: planId, client_id }))),
        );
      }
      if (remove.length) {
        check(
          await supabase
            .from('plan_assignments')
            .update({ is_active: false })
            .eq('plan_id', planId)
            .eq('is_active', true)
            .in('client_id', remove),
        );
      }
    },
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ['plan-assignments'] }),
        qc.invalidateQueries({ queryKey: ['assignment'] }),
        qc.invalidateQueries({ queryKey: ['plans'] }),
      ]),
  });
}

// ---------------------------------------------------------------------------
// Workout logs
// ---------------------------------------------------------------------------

export function useWorkoutLogs(clientId: string | undefined) {
  return useQuery({
    queryKey: logsKey(clientId),
    enabled: Boolean(clientId),
    queryFn: async (): Promise<LogWithExercise[]> => {
      const { data, error } = await supabase
        .from('workout_logs')
        .select('*, exercises(id, name, log_type, muscle_group)')
        .eq('client_id', clientId!)
        .order('performed_on', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(2000);
      if (error) throw error;
      return data as LogWithExercise[];
    },
  });
}

export function useLogSet(clientId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Omit<TablesInsert<'workout_logs'>, 'client_id'>) =>
      check(await supabase.from('workout_logs').insert({ ...row, client_id: clientId! })),
    onSuccess: () => qc.invalidateQueries({ queryKey: logsKey(clientId) }),
  });
}

export function useDeleteLog(clientId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      check(await supabase.from('workout_logs').delete().eq('id', id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: logsKey(clientId) }),
  });
}

// ---------------------------------------------------------------------------
// Self workouts
// ---------------------------------------------------------------------------

const SELF_SELECT = '*, self_workout_exercises(*, exercises(*))';

/** Workouts this person saved for themselves (also read by their trainer). */
export function useSelfWorkouts(clientId: string | undefined) {
  return useQuery({
    queryKey: selfWorkoutsKey(clientId),
    enabled: Boolean(clientId),
    queryFn: async (): Promise<SelfWorkoutFull[]> => {
      const { data, error } = await supabase
        .from('self_workouts')
        .select(SELF_SELECT)
        .eq('client_id', clientId!)
        .order('created_at');
      if (error) throw error;
      return (data as unknown as SelfWorkoutFull[]).map(sortSelfWorkout);
    },
  });
}

/** All self workout editing goes through here; every change refreshes the list. */
export function useSelfWorkoutMutation<T>(
  clientId: string | undefined,
  fn: (input: T) => Promise<void>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: selfWorkoutsKey(clientId) }),
  });
}

export const selfWorkoutApi = {
  async create(name: string): Promise<string> {
    const { data, error } = await supabase
      .from('self_workouts')
      .insert({ name })
      .select('id')
      .single();
    if (error) throw error;
    return data.id;
  },
  rename: async (id: string, name: string) =>
    check(await supabase.from('self_workouts').update({ name }).eq('id', id)),
  remove: async (id: string) => check(await supabase.from('self_workouts').delete().eq('id', id)),
  addExercise: async (row: TablesInsert<'self_workout_exercises'>) =>
    check(await supabase.from('self_workout_exercises').insert(row)),
  updateExercise: async (id: string, fields: TablesUpdate<'self_workout_exercises'>) =>
    check(await supabase.from('self_workout_exercises').update(fields).eq('id', id)),
  removeExercise: async (id: string) =>
    check(await supabase.from('self_workout_exercises').delete().eq('id', id)),
};
