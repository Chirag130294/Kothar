// Service worker: makes the app SHELL load offline and fast. Pantry DATA is cached separately by
// Firestore's own offline persistence, so this file never touches it. Cross-origin requests (Firebase,
// the optional scanner/Excel/photo libraries, Open Food Facts) are left alone.
// Bump VERSION whenever you deploy new code so phones pick it up.
const VERSION = 'kothar-v2.1';

const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/styles.css',
  'js/app.js', 'js/ctx.js', 'js/config.js', 'js/catalog.js', 'js/units.js', 'js/stock.js', 'js/importer.js',
  'js/store-local.js', 'js/store-firebase.js', 'js/fb.js', 'js/firebase-init.js', 'js/household.js',
  'js/ui/dom.js', 'js/ui/thumb.js', 'js/ui/pantry.js', 'js/ui/sheets.js', 'js/ui/form.js',
  'js/ui/shop.js', 'js/ui/family.js', 'js/ui/settings.js', 'js/ui/setup.js', 'js/ui/scan.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Pages: network first (so a new deploy shows up), cached copy when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put('index.html', copy)); return res; })
        .catch(() => caches.match('index.html').then((r) => r || caches.match('./'))));
    return;
  }
  // Everything else on this site: instant from cache, refreshed in the background.
  event.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(req);
      const refresh = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => cached);
      return cached || refresh;
    }));
});
