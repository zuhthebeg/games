// Test transport only: the exact Session protocol, without relay credentials or sockets.
export function createMemoryTransport() {
  const peers = new Map();
  return {
    connect(uid, receive) {
      peers.set(uid, receive);
      return { sendRt: data => { for (const [id, fn] of peers) if (id !== uid) fn(uid, structuredClone(data)); },
        sendAction: a => { for (const fn of peers.values()) fn(uid, { t: 'action', action: structuredClone(a) }); },
        close: () => peers.delete(uid) };
    },
  };
}
export function connectBroadcast({ room, uid, host, onReady, onRoster, onRt, onAction }) {
  const channel = new BroadcastChannel(`arpg-test:${room}`), peers = new Map([[uid, Date.now()]]);
  let ready = false, closed = false;
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
    else onRt(from, data);
  };
  send({ t: 'presence' });
  const timer = setInterval(() => {
    send({ t: 'presence' });
    for (const [id, at] of peers) if (id !== uid && Date.now() - at > 3000) peers.delete(id);
    check();
  }, 500);
  const close = () => { if (closed) return; closed = true; send({ t: 'leave' }); clearInterval(timer); channel.close(); };
  window.addEventListener('pagehide', close, { once: true });
  return { sendRt: send, sendAction: action => { send({ t: 'action', action }); onAction(action); }, close };
}
