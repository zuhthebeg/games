// Back/forward may serve an older cached index.html whose importmap pins older modules.
// Such a build cannot read newer saves, so reload once when the server's importmap differs.
const IMPORTMAP = /<script[^>]*type=["']importmap["'][^>]*>([\s\S]*?)<\/script>/i;
const GUARD_KEY = 'arpg.freshReloadAt';
const GUARD_MS = 60_000;

const normalize = text => String(text).replace(/\s+/g, '');

export async function reloadIfStale({
  doc = globalThis.document, fetchFn = globalThis.fetch?.bind(globalThis), storage = globalThis.sessionStorage,
  url = globalThis.location?.pathname, reload = () => globalThis.location.reload(), now = Date.now, timeoutMs = 1200,
} = {}) {
  try {
    const mine = doc.querySelector('script[type="importmap"]')?.textContent;
    if (!mine || !fetchFn) return false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let html;
    try {
      const response = await fetchFn(url, { cache: 'no-cache', signal: controller.signal });
      if (!response.ok) return false;
      html = await response.text();
    } finally { clearTimeout(timer); }
    const live = IMPORTMAP.exec(html)?.[1];
    if (!live || normalize(live) === normalize(mine)) return false;
    const last = Number(storage?.getItem(GUARD_KEY)) || 0;
    if (now() - last < GUARD_MS) return false;
    storage?.setItem(GUARD_KEY, String(now()));
    reload();
    return true;
  } catch {
    return false;
  }
}
