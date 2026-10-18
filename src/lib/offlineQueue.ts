import { get, set } from 'idb-keyval';
import { useSyncExternalStore } from 'react';

import type { TablesInsert } from './database.types';
import { supabase } from './supabase';

/**
 * Saves that failed for lack of network wait here (in IndexedDB, so they survive closing
 * the app) and are sent when the connection is back. Each row carries its own id, so a
 * retry after a half-finished request can't create a duplicate.
 */

export interface ExerciseSnapshot {
  id: string;
  name: string;
  log_type: string;
  muscle_group: string | null;
}

interface Base {
  /** Same as the row's id (meal, set) or a random id (activity). */
  id: string;
  userId: string;
  createdAt: string;
  /** Set when the server refused the item (not a network problem); it is kept to show. */
  error?: string;
}

export type QueuedItem = Base &
  (
    | { kind: 'meal'; row: TablesInsert<'meal_logs'> & { id: string; client_id: string } }
    | {
        kind: 'workout_set';
        row: TablesInsert<'workout_logs'> & { id: string; client_id: string };
        exercise: ExerciseSnapshot;
      }
    | { kind: 'activity'; row: TablesInsert<'activity_daily'> }
    | { kind: 'water'; row: TablesInsert<'habits_daily'> }
  );

type NewItem = QueuedItem extends infer T
  ? T extends QueuedItem
    ? Omit<T, 'createdAt' | 'error'>
    : never
  : never;

const STORE_KEY = 'fitcoach-offline-queue-v1';

let items: QueuedItem[] = [];
const listeners = new Set<() => void>();
const loaded = get<QueuedItem[]>(STORE_KEY)
  .then((saved) => {
    items = saved ?? [];
    emit();
  })
  .catch(() => {
    /* private mode or storage blocked: the queue just lives in memory */
  });

function emit() {
  for (const l of listeners) l();
}

async function persist() {
  emit();
  try {
    await set(STORE_KEY, items);
  } catch {
    /* see above */
  }
}

/** True when an error means "couldn't reach the server" rather than "the server said no". */
export function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const msg =
    err instanceof Error
      ? err.message
      : typeof err === 'object' && err !== null && 'message' in err
        ? String((err as { message: unknown }).message)
        : String(err);
  return /failed to fetch|load failed|network|fetch|timed? ?out/i.test(msg);
}

export async function enqueue(item: NewItem) {
  await loaded;
  items = [
    ...items.filter((i) => i.id !== item.id),
    { ...item, createdAt: new Date().toISOString() } as QueuedItem,
  ];
  await persist();
}

export async function removeQueued(id: string) {
  await loaded;
  items = items.filter((i) => i.id !== id);
  await persist();
}

const isDuplicate = (error: { code?: string } | null) => error?.code === '23505';

async function send(item: QueuedItem) {
  switch (item.kind) {
    case 'meal': {
      const { error } = await supabase.from('meal_logs').insert(item.row);
      if (error && !isDuplicate(error)) throw error;
      return;
    }
    case 'workout_set': {
      const { error } = await supabase.from('workout_logs').insert(item.row);
      if (error && !isDuplicate(error)) throw error;
      return;
    }
    case 'activity': {
      const { error } = await supabase
        .from('activity_daily')
        .upsert(item.row, { onConflict: 'client_id,activity_date' });
      if (error) throw error;
      return;
    }
    case 'water': {
      const { error } = await supabase
        .from('habits_daily')
        .upsert(item.row, { onConflict: 'client_id,habit_date' });
      if (error) throw error;
      return;
    }
  }
}

let flushing: Promise<number> | null = null;
const syncedListeners = new Set<() => void>();

/** Called after anything was synced (used to refresh the screens). */
export function onSynced(fn: () => void) {
  syncedListeners.add(fn);
  return () => void syncedListeners.delete(fn);
}

/** Send everything waiting for the signed-in user. Returns how many items were sent. */
export function flushQueue(): Promise<number> {
  flushing ??= (async () => {
    await loaded;
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user.id;
    if (!uid) return 0;
    let sent = 0;
    for (const item of items.filter((i) => i.userId === uid && !i.error)) {
      try {
        await send(item);
        items = items.filter((i) => i.id !== item.id);
        sent++;
      } catch (err) {
        if (isNetworkError(err)) break;
        items = items.map((i) =>
          i.id === item.id
            ? { ...i, error: err instanceof Error ? err.message : 'Not accepted' }
            : i,
        );
      }
    }
    await persist();
    if (sent > 0) for (const fn of syncedListeners) fn();
    return sent;
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

/** Retry on reconnect, when the app comes back to the front, and every minute. */
export function startAutoSync() {
  const tryNow = () => {
    if (items.length > 0) void flushQueue();
  };
  window.addEventListener('online', tryNow);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tryNow();
  });
  setInterval(tryNow, 60_000);
  void loaded.then(tryNow);
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};
const snapshot = () => items;

/** Everything waiting to be sent (all users on this device; filter by userId). */
export function useQueuedItems(): QueuedItem[] {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
