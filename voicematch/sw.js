// 보이스매치 서비스워커 — 코드(HTML/JS/JSON)는 네트워크 우선(항상 최신),
// 무거운 정적 자산(ONNX 모델, 아이콘)만 캐시 우선. 전부 ?v= 버전 쿼리로 관리되니
// 캐시 키가 URL 전체(쿼리 포함)라서 버전 bump = 새 캐시 엔트리, 오염 위험 없음.
const CACHE = 'voicematch-v1';
const HEAVY_RE = /\.(onnx|svg|png)(\?|$)/;

self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!url.pathname.startsWith('/voicematch/')) return;

  if (HEAVY_RE.test(url.pathname + url.search)) {
    e.respondWith(
      caches.open(CACHE).then(c => c.match(req).then(hit => hit || fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; })))
    );
    return;
  }
  e.respondWith(
    fetch(req).then(res => { if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); } return res; })
       .catch(() => caches.match(req))
  );
});
