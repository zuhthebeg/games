import { TICK_MS } from '../sim/core.js';

// Only wake-ups cross the worker boundary; authoritative sim stays on the page.
export function startNetworkTicks(update, env = globalThis) {
  const now = env.now || (() => performance.now());
  let last = now(), worker = null, timer = null, stopped = false;
  const tick = () => { if (stopped) return; const at = now(); const elapsed = at - last; last = at; update(elapsed); };
  const fallback = () => {
    if (stopped || timer !== null) return;
    if (worker) { worker.onmessage = worker.onerror = null; worker.terminate(); worker = null; }
    timer = env.setInterval(tick, TICK_MS);
  };
  try {
    // Classic same-origin file avoids Blob CSP exceptions and worker import maps.
    worker = new env.Worker(new URL('./tick-worker.js', import.meta.url));
    worker.onmessage = tick;
    worker.onerror = event => { event.preventDefault?.(); fallback(); };
    worker.postMessage(TICK_MS);
  } catch { fallback(); }
  return () => {
    stopped = true;
    if (worker) worker.terminate();
    if (timer !== null) env.clearInterval(timer);
  };
}

export function suspendHiddenSession(session) {
  if (session && !session.isHost) session.suspend();
}

// Presentation only: reuse the session's snapshot clock, not its reconnect policy.
export function hostWaitingLabel(session) {
  return session && !session.isHost && session.phase === 'running'
    && session.now - session.lastHostAt >= 1500 ? '방장:대기' : '';
}
