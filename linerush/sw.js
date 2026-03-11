const CACHE = 'linerush-v4';
const ASSETS = [
  '/linerush/',
  '/linerush/index.html',
  '/linerush/icon.svg',
  '/linerush/manifest.webmanifest',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // API 요청 + 외부 도메인은 캐시하지 않음 (네트워크 직접)
  if (url.hostname !== location.hostname || url.pathname.startsWith('/api/')) {
    return; // SW 개입 없이 브라우저 기본 동작
  }

  const isHTML = e.request.mode === 'navigate' || (e.request.headers.get('accept') || '').includes('text/html');

  // HTML은 network-first (신버전 반영 우선)
  if (isHTML) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(e.request).then((cached) => cached || caches.match('/linerush/index.html')))
    );
    return;
  }

  // /lib/ (shared-wallet 등)은 network-first (항상 최신)
  if (url.pathname.startsWith('/lib/')) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // 이미지/정적 자산은 cache-first (변경 빈도 낮음)
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => cached))
  );
});
