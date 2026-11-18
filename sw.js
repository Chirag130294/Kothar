// Service worker: makes the app SHELL load offline. Pantry DATA is cached separately by
// Firestore's own offline persistence (firebase-init.js), so this file never touches it.
// Bump VERSION whenever you deploy new code so phones pick it up.
const VERSION = 'kothar-v1';

const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/styles.css',
  'js/app.js', 'js/fb.js', 'js/config.js', 'js/firebase-init.js',
  'js/household.js', 'js/items.js', 'js/predict.js', 'js/seed-data.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Page loads: network first (so deploys show up), cached shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('index.html')));
    return;
  }

  // Our own files: serve from cache instantly, refresh in the background.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.open(VERSION).then(async (cache) => {
        const cached = await cache.match(req);
        const refresh = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => cached);
        return cached || refresh;
      }),
    );
    return;
  }

  // Firebase SDK modules: versioned URLs never change, so cache-first is safe.
  if (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) {
    event.respondWith(
      caches.open(VERSION).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
  }
  // Everything else (Firestore, Auth, Google sign-in) goes straight to the network.
});
