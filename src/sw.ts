/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { createDb } from './data/db';
import { notificationFor, openToday, pushData } from './platform/push-handler';

declare let self: ServiceWorkerGlobalScope;

// The same offline behaviour the generated worker had: precache the build, serve index.html
// for every navigation, and wait for "Reload" (SKIP_WAITING) before an update takes over.
self.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | null)?.type === 'SKIP_WAITING') void self.skipWaiting();
});
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL(`${import.meta.env.BASE_URL}index.html`)));

// Notifications (s30, decision 1d64a633).
const todayUrl = new URL(`${import.meta.env.BASE_URL}#/today`, self.location.origin).href;

async function loadTodos() {
  const db = createDb();
  try {
    return await db.items.filter((item) => item.type === 'todo').toArray();
  } finally {
    db.close();
  }
}

self.addEventListener('push', (event) => {
  event.waitUntil(
    notificationFor(pushData(event), loadTodos).then((note) =>
      self.registration.showNotification(note.title, {
        body: note.body,
        tag: note.tag,
        icon: `${import.meta.env.BASE_URL}pwa-192x192.png`,
      }),
    ),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    openToday(todayUrl, {
      matchAll: () => self.clients.matchAll({ type: 'window', includeUncontrolled: true }),
      openWindow: (url) => self.clients.openWindow(url),
    }),
  );
});
