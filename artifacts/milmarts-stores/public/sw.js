const CACHE_NAME = 'milmarts-shell-v3';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/milmarts-icon-192.png',
  '/milmarts-icon-512.png',
  '/milmarts-icon-180.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('push', (event) => {
  let payload = {};
  const rawPayload = event.data?.text() ?? '';
  if (rawPayload) {
    try {
      payload = JSON.parse(rawPayload);
    } catch {
      payload = { body: rawPayload };
    }
  }

  const title = typeof payload.title === 'string' && payload.title.trim()
    ? payload.title.trim()
    : 'Milmarts update';
  const body = typeof payload.body === 'string' ? payload.body : '';
  const url = typeof payload.url === 'string' ? payload.url : '/';

  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: '/milmarts-icon-192.png',
    badge: '/milmarts-icon-192.png',
    data: { url },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const candidate = typeof event.notification.data?.url === 'string'
    ? event.notification.data.url
    : '/';
  let target;
  try {
    target = new URL(candidate, self.location.origin);
    if (target.origin !== self.location.origin) target = new URL('/', self.location.origin);
  } catch {
    target = new URL('/', self.location.origin);
  }

  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    const existing = clients.find((client) => new URL(client.url).origin === target.origin);
    if (existing) {
      const navigation = 'navigate' in existing ? existing.navigate(target.href) : Promise.resolve(existing);
      return navigation.then((client) => client?.focus());
    }
    return self.clients.openWindow(target.href);
  }));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const networkResponse = fetch(request).then((response) => {
        if (response.ok && response.type === 'basic') {
          const responseCopy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseCopy));
        }
        return response;
      });

      return networkResponse.catch(() => {
        if (cachedResponse) return cachedResponse;
        if (request.mode === 'navigate') return caches.match('/index.html');
        return Response.error();
      });
    }),
  );
});