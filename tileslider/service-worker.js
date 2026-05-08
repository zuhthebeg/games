const CACHE_NAME = 'tiles-slider-v2';
const urlsToCache = [
  '/tileslider/',
  '/tileslider/index.html',
  '/tileslider/manifest.json',
  '/tileslider/icons/icon.svg',
  '/tileslider/style.css?v=1.0.12',
  '/tileslider/script.js?v=1.0.12'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key !== CACHE_NAME)
        .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});
