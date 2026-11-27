// Offline shell for the Halyra Focus web app. API calls always go to the network.
const CACHE = 'halyra-web-v3';
const SHELL = ['./', 'index.html', 'app.css', 'app.js', 'grow.js', 'config.js', 'manifest.webmanifest', '../assets/favicon.svg', '../assets/icon-192.png', '../assets/fonts/Inter-Regular.woff', '../assets/fonts/Inter-SemiBold.woff'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
});
