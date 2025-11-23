/* sw.js */
const PRECACHE = 'dtes-precache-v1';
const RUNTIME = 'dtes-runtime-v1';
const PRECACHE_URLS = [
  '/', '/index.html', '/dtes-resources.json', '/manifest.json',
  '/icons/icon-192.png', '/icons/icon-512.png',
  '/css/tailwind.min.css',
  '/libs/leaflet/leaflet.css', '/libs/leaflet/leaflet.js',
  '/libs/leaflet-routing-machine/leaflet-routing-machine.min.js',
  '/libs/leaflet-routing-machine/leaflet-routing-machine.css',
  '/libs/qrcode/qrcode.min.js'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(PRECACHE).then(cache => cache.addAll(PRECACHE_URLS).catch(err=>console.warn('precache failed', err)))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== PRECACHE && k !== RUNTIME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  // special handling for resources json - try network then cache
  if (url.pathname.endsWith('/dtes-resources.json')) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        const cache = await caches.open(PRECACHE);
        cache.put('/dtes-resources.json', response.clone());
        return response;
      } catch (err) {
        const cached = await caches.match('/dtes-resources.json');
        return cached || new Response('[]', { headers: { 'Content-Type': 'application/json' }});
      }
    })());
    return;
  }

  // navigation -> serve index.html from cache fallback to network
  if (request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('/index.html')) {
    event.respondWith(caches.match('/index.html').then(cached => cached || fetch(request)));
    return;
  }

  // default: try cache then network and cache runtime responses
  event.respondWith(caches.match(request).then(cached => {
    if (cached) return cached;
    return fetch(request).then(response => {
      return caches.open(RUNTIME).then(cache => {
        cache.put(request, response.clone());
        return response;
      });
    }).catch(() => {
      if (request.destination === 'image') return caches.match('/icons/icon-192.png');
    });
  }));
});
