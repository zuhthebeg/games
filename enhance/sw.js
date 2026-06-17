const CACHE = 'enhance-v13';
const OFFLINE = [
  '/enhance/',
  '/enhance/index.html',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(OFFLINE)));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // cross-origin(relay.cocy.io API, GTM, WS 워커 등)은 SW가 개입하지 않음 —
  // 가로채서 fetch 실패 시 캐시도 없으면 undefined 반환 → "Failed to convert value to 'Response'" 크래시.
  if (url.origin !== self.location.origin) return;
  // /lib/ 파일은 항상 네트워크 (캐시버스터 쿼리로 관리)
  if (url.pathname.startsWith('/lib/')) {
    e.respondWith((async () => {
      try { return await fetch(e.request); }
      catch (_) { return (await caches.match(e.request)) || Response.error(); }
    })());
    return;
  }
  // 항상 Response를 보장: 네트워크 실패 → 캐시 → (네비게이션이면 index) → Response.error()
  e.respondWith((async () => {
    try { return await fetch(e.request); }
    catch (_) {
      const cached = await caches.match(e.request);
      if (cached) return cached;
      if (e.request.mode === 'navigate') {
        const idx = await caches.match('/enhance/index.html');
        if (idx) return idx;
      }
      return Response.error();
    }
  })());
});
