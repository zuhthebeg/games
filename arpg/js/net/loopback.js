// Test transport only: the exact Session protocol, without relay credentials or sockets.
export function impairment({ latency = 0, jitter = 0, loss = 0, seed = 1 } = {}) {
  let state = seed >>> 0;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  return data => data.t === 'action' || data.t === 'presence' || data.t === 'leave'
    ? 0 : random() < loss ? null : Math.max(0, latency + (random() * 2 - 1) * jitter);
}
export function createMemoryTransport(options = {}) {
  const peers = new Map(), delay = impairment(options), queue = [];
  let now = 0;
  const deliver = (id, from, data) => {
    const ms = delay(data);
    if (ms === null) return;
    if (!ms) peers.get(id)?.(from, structuredClone(data));
    else queue.push({ at: now + ms, id, from, data: structuredClone(data) });
  };
  return {
    flush(at) {
      now = at; queue.sort((a, b) => a.at - b.at);
      while (queue.length && queue[0].at <= now) {
        const row = queue.shift(); peers.get(row.id)?.(row.from, row.data);
      }
    },
    connect(uid, receive) {
      peers.set(uid, receive);
      return { sendRt: data => { for (const id of peers.keys()) if (id !== uid) deliver(id, uid, data); },
        sendAction: a => { for (const fn of peers.values()) fn(uid, { t: 'action', action: structuredClone(a) }); },
        close: () => peers.delete(uid) };
    },
  };
}
export function connectBroadcast({ room, uid, host, onReady, onRoster, onRt, onAction, network = {} }) {
  const channel = new BroadcastChannel(`arpg-test:${room}`), peers = new Map([[uid, Date.now()]]);
  let ready = false, closed = false;
  const delay = impairment({ ...network, seed: (network.seed ?? 1) + (uid === host ? 0 : 99) }), deliveries = new Set();
  const send = data => channel.postMessage({ from: uid, data });
  const roster = () => ({ hostUser: host, players: [...peers.keys()].map(user => ({ user })) });
  const check = () => {
    if (!ready && peers.has(host) && peers.size >= 2) { ready = true; onReady(roster()); }
    if (ready) onRoster(roster());
  };
  channel.onmessage = ({ data: { from, data } }) => {
    if (from === uid) return;
    if (data.t === 'presence') { const fresh = !peers.has(from); peers.set(from, Date.now()); if (fresh) send({ t: 'presence' }); check(); }
    else if (data.t === 'leave') { peers.delete(from); check(); }
    else if (data.t === 'action') onAction(data.action);
    else {
      const ms = delay(data);
      if (ms === null) return;
      if (!ms) onRt(from, data);
      else { const timer = setTimeout(() => { deliveries.delete(timer); if (!closed) onRt(from, data); }, ms); deliveries.add(timer); }
    }
  };
  send({ t: 'presence' });
  const timer = setInterval(() => {
    send({ t: 'presence' });
    for (const [id, at] of peers) if (id !== uid && Date.now() - at > 3000) peers.delete(id);
    check();
  }, 500);
  const close = () => { if (closed) return; closed = true; send({ t: 'leave' }); clearInterval(timer); for (const delivery of deliveries) clearTimeout(delivery); deliveries.clear(); channel.close(); };
  window.addEventListener('pagehide', close, { once: true });
  return { sendRt: send, sendAction: action => { send({ t: 'action', action }); onAction(action); }, close };
}
