// 리치마작 서비스워커 — 코드(HTML/JS)는 네트워크 우선(항상 최신), 무거운 정적자산(tiles/sounds/voice)만 캐시 우선
const CACHE = 'riichi-v1';
const ASSET_RE = /\/riichi\/(tiles|sounds|voice)\//;

self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // 타일/사운드/보이스 = 잘 안 변함 → 캐시 우선(빠르고 오프라인 가능)
  if (ASSET_RE.test(url.pathname)) {
    e.respondWith(
      caches.open(CACHE).then(c => c.match(req).then(hit => hit || fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; })))
    );
    return;
  }
  // index.html / lib / 그 외 = 네트워크 우선(항상 최신), 오프라인이면 캐시 폴백
  e.respondWith(
    fetch(req).then(res => { if (res.ok && url.pathname.startsWith('/riichi/')) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); } return res; })
       .catch(() => caches.match(req))
  );
});
