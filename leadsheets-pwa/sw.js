const CACHE_NAME = 'leadsheets-v4';
const ASSETS = [
  'index.html',
  'manifest.json',
  'assets/leadsheets/All-Of-Me.png',
  'assets/leadsheets/Autumn-Leaves.png',
  'assets/leadsheets/Beautiful-Love.png',
  'assets/leadsheets/Bewitched.png',
  'assets/leadsheets/Blue-in-Green.png',
  'assets/leadsheets/Body-and-Soul.png',
  'assets/leadsheets/Cheek-To-Cheek.png',
  'assets/leadsheets/Dont-Get-Around-much-Anymore.png',
  'assets/leadsheets/Dream-a-Little-Dream.png',
  'assets/leadsheets/Emily.png',
  'assets/leadsheets/How-High-The-Moon.png',
  'assets/leadsheets/Its-Only-A-Paper-Moon.png',
  'assets/leadsheets/Mercy-Mercy-Mercy.png',
  'assets/leadsheets/Misty.png',
  'assets/leadsheets/My-Favorite-Things.png',
  'assets/leadsheets/My-Funny-Valentine.png',
  'assets/leadsheets/Someday-My-Prince.png',
  'assets/leadsheets/Stella-By-Starlight.png',
  'assets/leadsheets/Summertime.png',
  'assets/leadsheets/Sunday-Kind-of-Love.png',
  'assets/leadsheets/there-will-never-be-another-you.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
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

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Network-first for HTML (picks up app updates)
  if (url.pathname.endsWith('.html') || url.pathname.endsWith('/')) {
    e.respondWith(
      fetch(e.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          return response;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }
  // Cache-first for everything else (images, manifest)
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
