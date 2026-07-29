const SHELL_CACHE = 'teachflow-shell-v1';
const STATIC_CACHE = 'teachflow-static-v1';
const PAGE_CACHE = 'teachflow-pages-v1';
const MAX_PAGE_ENTRIES = 12;
const OFFLINE_FALLBACK = '/offline.html';
const PRECACHE_URLS = ['/', '/login', '/signup', '/manifest.json', '/icon-192.png', '/icon-512.png', OFFLINE_FALLBACK];

let messagingInitialized = false;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => ![SHELL_CACHE, STATIC_CACHE, PAGE_CACHE].includes(key))
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

const trimPageCache = async () => {
  const cache = await caches.open(PAGE_CACHE);
  const keys = await cache.keys();
  const staleEntries = keys.slice(0, Math.max(0, keys.length - MAX_PAGE_ENTRIES));
  await Promise.all(staleEntries.map((request) => cache.delete(request)));
};

const cachePageResponse = async (request, response) => {
  const cache = await caches.open(PAGE_CACHE);
  await cache.put(request, response.clone());
  await trimPageCache();
};

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          await cachePageResponse(request, response);
          return response;
        })
        .catch(async () => {
          const cachedPage = await caches.match(request);
          if (cachedPage) return cachedPage;
          return caches.match(OFFLINE_FALLBACK);
        })
    );
    return;
  }

  const isStaticAsset =
    url.pathname.startsWith('/assets/') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.webmanifest') ||
    url.pathname.endsWith('.json');

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const networkFetch = fetch(request)
          .then(async (response) => {
            const cache = await caches.open(STATIC_CACHE);
            await cache.put(request, response.clone());
            return response;
          })
          .catch(() => cached);

        return cached ?? networkFetch;
      })
    );
  }
});

self.addEventListener('message', (event) => {
  const data = event.data || {};

  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (data.type === 'INIT_FIREBASE' && !messagingInitialized && data.config) {
    importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
    importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

    firebase.initializeApp(data.config);
    const messaging = firebase.messaging();

    messaging.onBackgroundMessage((payload) => {
      const title = payload.notification?.title || 'TeachFlow';
      const body = payload.notification?.body || 'You have a new update.';
      const targetUrl = payload.data?.url || '/';

      self.registration.showNotification(title, {
        body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        data: {
          url: targetUrl,
        },
      });
    });

    messagingInitialized = true;
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const matchingClient = clients.find((client) => 'focus' in client);
      if (matchingClient) {
        matchingClient.navigate(targetUrl);
        return matchingClient.focus();
      }

      return self.clients.openWindow(targetUrl);
    })
  );
});
