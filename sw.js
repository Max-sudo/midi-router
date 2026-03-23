const CACHE_NAME = 'leadsheets-v3';

// App shell files to cache for offline use
const APP_SHELL = [
  '/',
  '/index.html',
  '/css/variables.css',
  '/css/base.css',
  '/css/layout.css',
  '/css/components.css',
  '/css/home.css',
  '/css/leadsheets.css',
  '/css/lcxl.css',
  '/css/take5.css',
  '/css/patchbay.css',
  '/css/chat.css',
  '/css/ccmonitor.css',
  '/css/animations.css',
  '/js/app.js',
  '/js/tabs.js',
  '/js/midi.js',
  '/js/utils.js',
  '/js/router.js',
  '/js/launchpad.js',
  '/js/leadsheets.js',
  '/js/presets.js',
  '/js/lcxl.js',
  '/js/take5.js',
  '/js/chat.js',
  '/js/home.js',
  '/js/patchbay.js',
  '/js/ccmonitor.js',
];

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

  // Network-first for app files (HTML, JS, CSS) — cache on success, serve cache on failure
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }).then(response => {
      const clone = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
      return response;
    }).catch(() => caches.match(e.request))
  );
});

// Listen for messages from the app
self.addEventListener('message', (e) => {
  if (e.data.type === 'CACHE_LEADSHEETS') {
    const urls = e.data.urls;
    caches.open(CACHE_NAME).then(async (cache) => {
      // Cache app shell first
      for (const shellUrl of APP_SHELL) {
        try {
          await cache.add(shellUrl);
        } catch (err) { /* skip failures */ }
      }
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
