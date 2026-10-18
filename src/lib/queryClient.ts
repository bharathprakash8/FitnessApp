import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient } from '@tanstack/react-query';
import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client';
import { del, get, set } from 'idb-keyval';

const WEEK = 7 * 24 * 60 * 60_000;

export const queryClient = new QueryClient({
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
