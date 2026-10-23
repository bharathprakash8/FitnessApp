import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client';
import { del, get, set } from 'idb-keyval';

const WEEK = 7 * 24 * 60 * 60_000;

// Failed loads and saves go to the problem log (lib/errorLog.ts – imported lazily to keep
// this file free of the Supabase client at start-up).
const report = (kind: 'api', e: unknown, key: unknown) =>
  void import('./errorLog').then((m) =>
    m.logError(kind, e, { key: JSON.stringify(key).slice(0, 300) }),
  );

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: (e, q) => report('api', e, q.queryKey) }),
  mutationCache: new MutationCache({
    onError: (e, _v, _c, m) => report('api', e, m.options.mutationKey ?? 'save'),
  }),
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      // Keep data around long enough to be saved for offline use (see persistOptions).
      gcTime: WEEK,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      // Run saves even when the phone says it's offline: they fall back to the offline
      // queue (lib/offlineQueue.ts) instead of waiting silently.
      networkMode: 'always',
    },
  },
});

const PERSIST_KEY = 'fitcoach-query-cache-v1';

/**
 * The last data each screen showed is kept on the phone (IndexedDB), so Today, Workouts
 * and Food still show something without a connection. Cleared on log out.
 */
export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister: createAsyncStoragePersister({
    storage: {
      getItem: (k) => get<string>(k).then((v) => v ?? null),
      setItem: (k, v: string) => set(k, v),
      removeItem: (k) => del(k),
    },
    key: PERSIST_KEY,
    throttleTime: 2000,
  }),
  maxAge: WEEK,
  // Bump when the shape of saved query data changes, so old copies on phones are dropped.
  buster: '2026-10-19',
  dehydrateOptions: {
    // Signed photo links expire after an hour – never keep them.
    shouldDehydrateQuery: (q) =>
      q.state.status === 'success' && q.queryKey[0] !== 'meal-photo-urls',
  },
};

/** Forget all saved data (log out). */
export async function clearPersistedCache() {
  queryClient.clear();
  try {
    await del(PERSIST_KEY);
  } catch {
    /* storage blocked */
  }
}
