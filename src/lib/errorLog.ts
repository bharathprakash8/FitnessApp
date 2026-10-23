// Problem log: errors the app runs into are saved (app_errors) so the admin can see what
// went wrong on someone's phone and paste it to Claude. Never throws; never blocks the app.
import { App } from '@capacitor/app';

import type { Json } from './database.types';
import { isImpersonating } from './impersonation';
import { isAndroidApp, isIOSWeb } from './platform';
import { supabase } from './supabase';

export type ErrorKind = 'crash' | 'js' | 'api' | 'sync' | 'ai' | 'report';

interface RecentEvent {
  at: string;
  kind: ErrorKind;
  message: string;
  screen: string;
}

/** The last few problems on this device (attached to "Report a problem"). */
const recent: RecentEvent[] = [];
const lastSent = new Map<string, number>();

let androidVersion: string | null = null;
if (isAndroidApp) {
  void App.getInfo()
    .then((i) => (androidVersion = i.version))
    .catch(() => undefined);
}

export function appInfo() {
  return {
    app_version: isAndroidApp ? `android ${androidVersion ?? '?'}` : `web ${__APP_BUILD__}`,
    platform: isAndroidApp ? 'android' : isIOSWeb ? 'iphone-web' : 'web',
    device: navigator.userAgent.slice(0, 300),
  };
}

export function recentProblems(): RecentEvent[] {
  return [...recent];
}

const screen = () => window.location.pathname.slice(0, 200);

function messageOf(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e)
    return String((e as { message: unknown }).message);
  return String(e);
}

/** Record a problem. Same message from the same screen is sent at most once a minute. */
export async function logError(
  kind: ErrorKind,
  error: unknown,
  details: Record<string, unknown> = {},
) {
  try {
    const message = messageOf(error).slice(0, 2000) || 'Unknown error';
    recent.push({ at: new Date().toISOString(), kind, message, screen: screen() });
    if (recent.length > 20) recent.shift();

    const key = `${kind}|${screen()}|${message}`;
    const now = Date.now();
    if (now - (lastSent.get(key) ?? 0) < 60_000) return;
    lastSent.set(key, now);
    if (!navigator.onLine) return;

    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) return;
    const stack = error instanceof Error ? error.stack?.slice(0, 4000) : undefined;
    await supabase.from('app_errors').insert({
      user_id: userId,
      kind,
      screen: screen(),
      message,
      details: {
        ...details,
        ...(stack ? { stack } : {}),
        ...(isImpersonating() ? { by_admin: true } : {}),
      } as Json,
      ...appInfo(),
    });
  } catch {
    /* logging must never cause another problem */
  }
}

/** Tell the server which app this person uses (once per app start; not while impersonating). */
export async function touchClientInfo() {
  if (isImpersonating()) return;
  try {
    const i = appInfo();
    await supabase.rpc('touch_client_info', {
      app_version: i.app_version,
      platform: i.platform,
      device: i.device,
    });
  } catch {
    /* ignore */
  }
}
