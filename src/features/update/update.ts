// Keeps every phone on the newest version and tells the popup (UpdatePrompt) what to show.
// iPhone / web: the new version downloads by itself; "Update now" swaps it in and restarts.
// Android: the screens are inside the APK, so a new APK has to be downloaded and installed.
import { App } from '@capacitor/app';
import { useSyncExternalStore } from 'react';
import { registerSW } from 'virtual:pwa-register';

import { isAndroidApp } from '../../lib/platform';
import { supabase } from '../../lib/supabase';

export interface AndroidRelease {
  code: number;
  name: string;
  notes: string | null;
  required: boolean;
}

export type UpdateOffer = { kind: 'web' } | ({ kind: 'android' } & AndroidRelease);

const SNOOZE_KEY = 'fitcoach.update.snooze';
const SNOOZE_MS = 24 * 60 * 60 * 1000;
const WEB_CHECK_EVERY_MS = 30 * 60 * 1000;
const RESUME_CHECK_GAP_MS = 60 * 1000;

let webReady = false;
let android: AndroidRelease | null = null;
let registration: ServiceWorkerRegistration | undefined;
let swapIn: ((reload?: boolean) => Promise<void>) | undefined;
let lastCheck = 0;
let storeVersion = 0;
const listeners = new Set<() => void>();

function changed() {
  storeVersion += 1;
  listeners.forEach((l) => l());
}

function readSnooze(): { key: string; until: number } | null {
  try {
    return JSON.parse(localStorage.getItem(SNOOZE_KEY) ?? 'null') as {
      key: string;
      until: number;
    } | null;
  } catch {
    return null;
  }
}

const offerKey = (offer: UpdateOffer) =>
  offer.kind === 'web' ? 'web' : `android-${String(offer.code)}`;

/** Compares the phone's build with the server's latest. */
export function pickAndroidRelease(currentCode: number, info: unknown): AndroidRelease | null {
  if (!info || typeof info !== 'object' || !Number.isFinite(currentCode)) return null;
  const { code, name, notes, min_code: minCode } = info as Record<string, unknown>;
  if (typeof code !== 'number' || code <= currentCode) return null;
  return {
    code,
    name: typeof name === 'string' ? name : String(code),
    notes: typeof notes === 'string' && notes.trim() ? notes.trim() : null,
    required: typeof minCode === 'number' && currentCode < minCode,
  };
}

async function checkAndroid() {
  try {
    const [appInfo, { data, error }] = await Promise.all([
      App.getInfo(),
      supabase.rpc('app_update_info'),
    ]);
    if (error) return;
    android = pickAndroidRelease(Number(appInfo.build), data);
    changed();
  } catch {
    /* offline: try again on the next open */
  }
}

async function checkWeb() {
  try {
    await registration?.update();
  } catch {
    /* offline: try again on the next open */
  }
}

function checkOnResume() {
  if (Date.now() - lastCheck < RESUME_CHECK_GAP_MS) return;
  lastCheck = Date.now();
  void (isAndroidApp ? checkAndroid() : checkWeb());
}

/** Call once when the app starts. */
export function startUpdateChecks() {
  if (isAndroidApp) {
    void checkAndroid();
    void App.addListener('resume', checkOnResume);
    return;
  }
  // A new service worker asks whether this page can show the popup (see src/sw.ts).
  navigator.serviceWorker?.addEventListener('message', (e: MessageEvent<{ type?: string }>) => {
    if (e.data?.type === 'CAN_PROMPT_UPDATE') e.ports[0]?.postMessage(true);
  });
  swapIn = registerSW({
    immediate: true,
    onNeedRefresh() {
      webReady = true;
      changed();
    },
    onRegisteredSW(_url, reg) {
      registration = reg;
      window.setInterval(() => void checkWeb(), WEB_CHECK_EVERY_MS);
    },
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkOnResume();
  });
}

/** "Update now" on iPhone / web. The page restarts once the new version has taken over. */
export async function applyWebUpdate() {
  await swapIn?.(true);
  // Safety net in case the "new version took over" signal never arrives.
  window.setTimeout(() => window.location.reload(), 4000);
}

/** "Later": ask again after a day (a newer Android version asks straight away). */
export function snoozeUpdate(offer: UpdateOffer) {
  try {
    localStorage.setItem(
      SNOOZE_KEY,
      JSON.stringify({ key: offerKey(offer), until: Date.now() + SNOOZE_MS }),
    );
  } catch {
    /* storage blocked: the popup just comes back sooner */
  }
  changed();
}

/** The "Check for updates" button: forgets "Later" and looks now. */
export async function checkForUpdatesNow(): Promise<'update' | 'latest'> {
  try {
    localStorage.removeItem(SNOOZE_KEY);
  } catch {
    /* storage blocked */
  }
  lastCheck = Date.now();
  if (isAndroidApp) {
    await checkAndroid();
    return android ? 'update' : 'latest';
  }
  await checkWeb();
  // A found version takes a moment to download before the popup can offer it.
  for (let i = 0; i < 40 && !webReady && registration?.installing; i += 1) {
    await new Promise((r) => window.setTimeout(r, 500));
  }
  changed();
  return webReady ? 'update' : 'latest';
}

function currentOffer(): UpdateOffer | null {
  const offer: UpdateOffer | null = android
    ? { kind: 'android', ...android }
    : webReady
      ? { kind: 'web' }
      : null;
  if (!offer) return null;
  if (offer.kind === 'android' && offer.required) return offer;
  const snooze = readSnooze();
  return snooze && snooze.key === offerKey(offer) && snooze.until > Date.now() ? null : offer;
}

let cached: { at: number; offer: UpdateOffer | null } = { at: -1, offer: null };

/** What the popup should offer right now, or null. */
export function useUpdateOffer(): UpdateOffer | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => {
      if (cached.at !== storeVersion) cached = { at: storeVersion, offer: currentOffer() };
      return cached.offer;
    },
  );
}
