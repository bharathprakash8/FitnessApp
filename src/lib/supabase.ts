import { createClient } from '@supabase/supabase-js';

import type { Database } from './database.types';

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishableKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env.local and fill them in.',
  );
}

/**
 * On the hosted web app, Supabase is reached through our own address (/sb, a Vercel
 * rewrite in vercel.json). Safari on iPhone – and some content blockers – refuse the
 * cross-site request to supabase.co from the app, while a same-site request always works.
 * Local dev and the Android app talk to Supabase directly.
 */
const useProxy =
  import.meta.env.VITE_SUPABASE_USE_PROXY === 'true' && typeof window !== 'undefined';
export const supabaseApiUrl = useProxy ? `${window.location.origin}/sb` : url;

// Keep the session key based on the real project, so switching to the proxy doesn't log
// anyone out.
const projectRef = new URL(url).hostname.split('.')[0];

// Browser client: publishable key only. The secret key lives in Edge Functions, never here.
export const supabase = createClient<Database>(supabaseApiUrl, publishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storageKey: `sb-${projectRef}-auth-token`,
  },
});
