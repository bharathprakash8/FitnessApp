/// <reference lib="webworker" />
// FitCoach service worker: offline app shell (Workbox precache) + push notifications.
// Push messages come from Firebase Cloud Messaging (send-push / cron-meal-reminders).
import { clientsClaim } from 'workbox-core';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: (string | { url: string; revision: string | null })[];
};

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// Single-page app: every in-app address loads index.html, except real pages.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: [/^\/privacy\.html$/, /^\/google-connected\.html$/],
  }),
);

interface FcmPayload {
  notification?: { title?: string; body?: string; icon?: string; tag?: string };
  data?: { url?: string; tag?: string; title?: string; body?: string };
  fcmOptions?: { link?: string };
}

self.addEventListener('push', (event) => {
  let payload: FcmPayload;
  try {
    payload = (event.data?.json() as FcmPayload) ?? {};
  } catch {
    payload = { notification: { title: 'FitCoach', body: event.data?.text() ?? '' } };
  }
  const n = payload.notification ?? {};
  const title = n.title ?? payload.data?.title ?? 'FitCoach';
  const tag = n.tag || payload.data?.tag || undefined;
  event.waitUntil(
    self.registration.showNotification(title, {
      body: n.body ?? payload.data?.body ?? '',
      icon: n.icon ?? '/pwa-192x192.png',
      badge: '/pwa-64x64.png',
      tag,
      data: { url: payload.data?.url ?? '/today' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = (event.notification.data as { url?: string } | undefined)?.url ?? '/today';
  const target = new URL(path, self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        await open.navigate(target).catch(() => undefined);
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});
