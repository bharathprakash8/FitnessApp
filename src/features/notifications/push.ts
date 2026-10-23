// Turning push notifications on/off for this device and registering its FCM token.
import { FunctionsHttpError } from '@supabase/supabase-js';
import { isImpersonating } from '../../lib/impersonation';
import { PushNotifications } from '@capacitor/push-notifications';

import { firebaseApp, firebaseConfigured, VAPID_KEY } from '../../lib/firebase';
import { isAndroidApp, isIOSWeb } from '../../lib/platform';
import { supabase } from '../../lib/supabase';

const TOKEN_KEY = 'fitcoach.push.token';

export type PushSupport =
  | 'android'
  | 'web'
  | 'ios_needs_install' // iPhone in Safari: must "Add to Home Screen" first
  | 'ios_too_old'
  | 'not_configured'
  | 'unsupported';

export type PushPermission = 'granted' | 'denied' | 'prompt';

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function pushSupport(): PushSupport {
  if (isAndroidApp) return 'android';
  if (!firebaseConfigured) return 'not_configured';
  if (isIOSWeb && !isStandalone()) return 'ios_needs_install';
  if (
    !('serviceWorker' in navigator) ||
    !('PushManager' in window) ||
    !('Notification' in window)
  ) {
    return isIOSWeb ? 'ios_too_old' : 'unsupported';
  }
  return 'web';
}

export async function pushPermission(): Promise<PushPermission> {
  if (isAndroidApp) {
    const { receive } = await PushNotifications.checkPermissions();
    return receive === 'granted' ? 'granted' : receive === 'denied' ? 'denied' : 'prompt';
  }
  if (!('Notification' in window)) return 'denied';
  return Notification.permission === 'default' ? 'prompt' : Notification.permission;
}

function rememberToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* storage blocked */
  }
}

function rememberedToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

async function saveToken(token: string, platform: 'web' | 'android') {
  // Admin logged in as someone: never link this device to their account (their
  // notifications would come to the admin's phone).
  if (isImpersonating()) return;
  const { error } = await supabase.rpc('claim_push_token', { t: token, p: platform });
  if (error) throw error;
  rememberToken(token);
}

async function androidToken(): Promise<string> {
  await PushNotifications.createChannel({
    id: 'reminders',
    name: 'Reminders',
    description: 'Meal and workout reminders',
    importance: 4,
    visibility: 1,
  });
  const handles: { remove: () => Promise<void> }[] = [];
  try {
    return await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('No push token received')), 20_000);
      void PushNotifications.addListener('registration', (t) => {
        clearTimeout(timer);
        resolve(t.value);
      }).then((h) => handles.push(h));
      void PushNotifications.addListener('registrationError', (e) => {
        clearTimeout(timer);
        reject(new Error(e.error));
      }).then((h) => handles.push(h));
      void PushNotifications.register();
    });
  } finally {
    await Promise.all(handles.map((h) => h.remove()));
  }
}

async function webToken(): Promise<string> {
  const { getMessaging, getToken } = await import('firebase/messaging');
  const registration = await navigator.serviceWorker.ready;
  return getToken(getMessaging(firebaseApp()), {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: registration,
  });
}

/** Ask for permission (must be called from a tap) and register this device. */
export async function enablePush(): Promise<PushPermission> {
  if (isImpersonating()) {
    throw new Error("Notifications can't be turned on while you're logged in as someone else.");
  }
  if (isAndroidApp) {
    const { receive } = await PushNotifications.requestPermissions();
    if (receive !== 'granted') return receive === 'denied' ? 'denied' : 'prompt';
    await saveToken(await androidToken(), 'android');
    return 'granted';
  }
  const result = await Notification.requestPermission();
  if (result !== 'granted') return result === 'denied' ? 'denied' : 'prompt';
  await saveToken(await webToken(), 'web');
  return 'granted';
}

/** Re-register silently when permission was already given (tokens can change). */
export async function refreshPushToken(): Promise<void> {
  const support = pushSupport();
  if (support !== 'android' && support !== 'web') return;
  if ((await pushPermission()) !== 'granted') return;
  const token = support === 'android' ? await androidToken() : await webToken();
  await saveToken(token, support);
}

/** Stop notifications on this device. */
export async function disablePush(): Promise<void> {
  const token = rememberedToken();
  if (token) await supabase.from('push_tokens').delete().eq('token', token);
  try {
    if (isAndroidApp) {
      await PushNotifications.unregister();
    } else if (firebaseConfigured) {
      const { getMessaging, deleteToken } = await import('firebase/messaging');
      await deleteToken(getMessaging(firebaseApp()));
    }
  } catch {
    /* already gone */
  }
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage blocked */
  }
}

export function isThisDeviceRegistered(): boolean {
  return rememberedToken() !== null;
}

export async function sendTestNotification(): Promise<void> {
  const { error } = await supabase.functions.invoke('send-push', { body: { action: 'test' } });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = (await (error.context as Response).json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      throw new Error(payload?.error?.message ?? 'Could not send the test');
    }
    throw new Error('Could not reach the server');
  }
}
