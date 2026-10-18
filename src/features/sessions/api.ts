import { FunctionsHttpError } from '@supabase/supabase-js';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Tables } from '../../lib/database.types';
import { supabase } from '../../lib/supabase';

export type Session = Tables<'sessions'>;
export type AttendeeStatus = 'invited' | 'present' | 'missed';
export interface Attendee {
  client_id: string;
  status: AttendeeStatus;
  profiles: { id: string; full_name: string | null; email: string } | null;
}
export type SessionWithPeople = Session & { session_attendees: Attendee[] };

/** Thrown by the calendar-session function; `code` tells the app what to show. */
export class SessionError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
  }
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('calendar-session', { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = (await (error.context as Response).json().catch(() => null)) as {
        error?: { message?: string; code?: string };
      } | null;
      throw new SessionError(
        payload?.error?.message ?? 'Something went wrong.',
        payload?.error?.code ?? 'error',
      );
    }
    throw new SessionError('Could not reach the server. Check your connection.', 'network');
  }
  return (data as { data: T }).data;
}

// ---------------------------------------------------------------------------
// Google connection (trainer)
// ---------------------------------------------------------------------------
export interface GoogleStatus {
  configured: boolean;
  connected: boolean;
  email: string | null;
}

export function useGoogleStatus(enabled = true) {
  return useQuery({
    queryKey: ['google-status'],
    enabled,
    queryFn: () => call<GoogleStatus>({ action: 'status' }),
  });
}

/** Opens Google's "Allow FitCoach…" page. On Android the system browser takes over. */
export async function connectGoogle() {
  const { url } = await call<{ url: string }>({ action: 'auth_url' });
  window.location.href = url;
}

export function useDisconnectGoogle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => call<unknown>({ action: 'disconnect' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['google-status'] }),
  });
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------
const PEOPLE = '*, session_attendees(client_id, status, profiles(id, full_name, email))';

/** A trainer's sessions from `sinceIso` on (cancelled ones included, for the history). */
export function useTrainerSessions(trainerId: string | undefined, sinceIso: string) {
  return useQuery({
    queryKey: ['sessions', 'trainer', trainerId, sinceIso],
    enabled: Boolean(trainerId),
    queryFn: async (): Promise<SessionWithPeople[]> => {
      const { data, error } = await supabase
        .from('sessions')
        .select(PEOPLE)
        .eq('trainer_id', trainerId!)
        .gte('starts_at', sinceIso)
        .order('starts_at')
        .limit(300);
      if (error) throw error;
      return data as unknown as SessionWithPeople[];
    },
  });
}

export function useSession(id: string | undefined) {
  return useQuery({
    queryKey: ['session', id],
    enabled: Boolean(id),
    queryFn: async (): Promise<SessionWithPeople | null> => {
      const { data, error } = await supabase
        .from('sessions')
        .select(PEOPLE)
        .eq('id', id!)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as SessionWithPeople | null;
    },
  });
}

export type ClientSession = Session & { my_status: AttendeeStatus };

/** Sessions a client is invited to (RLS returns only theirs). */
export function useClientSessions(clientId: string | undefined) {
  return useQuery({
    queryKey: ['sessions', 'client', clientId],
    enabled: Boolean(clientId),
    queryFn: async (): Promise<ClientSession[]> => {
      const { data, error } = await supabase
        .from('session_attendees')
        .select('status, sessions(*)')
        .eq('client_id', clientId!)
        .limit(500);
      if (error) throw error;
      return data
        .filter((r) => r.sessions)
        .map((r) => ({
          ...(r.sessions as unknown as Session),
          my_status: r.status as AttendeeStatus,
        }))
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    },
  });
}

export interface SessionInput {
  title: string;
  type: 'in_person' | 'online';
  location: string | null;
  notes: string | null;
  duration_min: number;
  time_zone: string;
  start_date: string;
  start_time: string;
  repeat: 'none' | 'daily' | 'weekly';
  weekdays: number[];
  ends_after: number | null;
  ends_on: string | null;
  client_ids: string[];
  meet: 'google' | 'link';
  meet_url: string | null;
  send_invite: boolean;
}

export interface SessionUpdate {
  session_id: string;
  scope: 'one' | 'series';
  title: string;
  location: string | null;
  notes: string | null;
  client_ids: string[];
  meet_url: string | null;
  start_date?: string;
  start_time?: string;
  time_zone?: string;
  duration_min?: number;
}

function useSessionMutation<I, O>(fn: (input: I) => Promise<O>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ['sessions'] }),
        qc.invalidateQueries({ queryKey: ['session'] }),
      ]),
  });
}

export const useCreateSession = () =>
  useSessionMutation((input: SessionInput) =>
    call<{ session_ids: string[]; sessions: number; meet_url: string | null }>({
      action: 'create',
      ...input,
    }),
  );

export const useUpdateSession = () =>
  useSessionMutation((input: SessionUpdate) => call<unknown>({ action: 'update', ...input }));

export const useCancelSession = () =>
  useSessionMutation((input: { session_id: string; scope: 'one' | 'series' }) =>
    call<{ cancelled: number }>({ action: 'cancel', ...input }),
  );

export function useMarkAttendance(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ clientId, status }: { clientId: string; status: AttendeeStatus }) => {
      const { error } = await supabase
        .from('session_attendees')
        .update({ status })
        .eq('session_id', sessionId)
        .eq('client_id', clientId);
      if (error) throw error;
    },
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ['session', sessionId] }),
        qc.invalidateQueries({ queryKey: ['sessions'] }),
      ]),
  });
}

/** Online sessions can be joined from 15 minutes before until they end. */
export function canJoin(
  s: Pick<Session, 'starts_at' | 'duration_min' | 'type' | 'meet_url' | 'status'>,
) {
  if (s.type !== 'online' || !s.meet_url || s.status !== 'scheduled') return false;
  const start = Date.parse(s.starts_at);
  return Date.now() >= start - 15 * 60_000 && Date.now() <= start + s.duration_min * 60_000;
}

export const sessionEnded = (s: Pick<Session, 'starts_at' | 'duration_min'>) =>
  Date.now() > Date.parse(s.starts_at) + s.duration_min * 60_000;

export const sessionStarted = (s: Pick<Session, 'starts_at'>) =>
  Date.now() >= Date.parse(s.starts_at);

/** ISO time `days` ago (start of the history window). */
export const daysAgoIso = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
