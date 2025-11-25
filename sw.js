// sw.js - simple service worker to cache essential files
const CACHE_NAME = 'dtes-v1';
const OFFLINE_ASSETS = [
  '/',
  '/index.html',
  '/dtes-resources.json',
  '/css/tailwind.min.css',
  '/js/markers.js',
  '/libs/leaflet/leaflet.js',
  '/libs/leaflet/leaflet.css',
  '/libs/leaflet.markercluster/leaflet.markercluster.min.js',
  '/libs/leaflet.markercluster/MarkerCluster.css',
  '/libs/leaflet.markercluster/MarkerCluster.Default.css',
  '/libs/leaflet-routing-machine/leaflet-routing-machine.min.js',
  '/libs/leaflet-routing-machine/leaflet-routing-machine.css',
  '/libs/qrcode/qrcode.min.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(OFFLINE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', function(event) {
  const req = event.request;
  const url = new URL(req.url);

  // For tiles: try network first then fallback to cache (tiles are external so not cached here)
  if (url.hostname.includes('tile.openstreetmap.org') || url.hostname.includes('tiles')) {
    event.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }

  // For other requests, use cache-first
  event.respondWith(
    caches.match(req).then(res => {
      return res || fetch(req).then(fetchRes => {
        // cache a copy (except if response is opaque and big)
        if (fetchRes && fetchRes.status === 200 && fetchRes.type !== 'opaque') {
          const copy = fetchRes.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
        }
        return fetchRes;
      }).catch(()=> {
        // fallback to index.html for navigation requests
        if (req.mode === 'navigate') return caches.match('/index.html');
        return new Response('', {status: 503, statusText: 'Offline'});
      });
    })
  );
});
