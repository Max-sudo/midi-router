const CACHE_NAME = 'leadsheets-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Cache-first for leadsheet images, network-first for everything else
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  if (url.pathname.includes('/assets/leadsheets/')) {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request))
    );
    return;
  }

  // Network-first for app files (HTML, JS, CSS)
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});

// Listen for messages from the app
self.addEventListener('message', (e) => {
  if (e.data.type === 'CACHE_LEADSHEETS') {
    const urls = e.data.urls;
    caches.open(CACHE_NAME).then(async (cache) => {
      let done = 0;
      for (const url of urls) {
        try {
          const cached = await cache.match(url);
          if (!cached) {
            await cache.add(url);
          }
          done++;
          e.source.postMessage({ type: 'CACHE_PROGRESS', done, total: urls.length });
        } catch (err) {
          done++;
          e.source.postMessage({ type: 'CACHE_PROGRESS', done, total: urls.length });
        }
      }
      e.source.postMessage({ type: 'CACHE_DONE' });
    });
  }

  if (e.data.type === 'CHECK_CACHE') {
    const urls = e.data.urls;
    caches.open(CACHE_NAME).then(async (cache) => {
      let cachedCount = 0;
      for (const url of urls) {
        const match = await cache.match(url);
        if (match) cachedCount++;
      }
      e.source.postMessage({ type: 'CACHE_STATUS', cachedCount, total: urls.length });
    });
  }
});
