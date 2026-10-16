// Source-bound, deterministic combat transport diagnostic. No production world edits.
// Usage: node arpg/tools/net-hit-continuity.mjs [source-root]
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const root = resolve(process.argv[2] || new URL('../../', import.meta.url).pathname);
const load = path => import(pathToFileURL(resolve(root, path)));
const { CoopSession } = await load('arpg/js/net/session.js');
const { createMemoryTransport } = await load('arpg/js/net/loopback.js');
const { emptyInput } = await load('arpg/js/sim/world.js');
const digest = value => createHash('sha256').update(value).digest('hex');
function run(condition) {
  const transport = createMemoryTransport({ ...condition, seed: 13579 }), sessions = {};
  const worldHash = createHash('sha256'), eventHash = createHash('sha256'), wireHash = createHash('sha256');
  let now = 0, episode = null, previousAuthority = null, pendingMax = 0, offsetMax = 0, reaction = null, onsetX = null;
  const corrections = [], convergences = [];
  for (const uid of ['h', 'g']) {
    const t = transport.connect(uid, (from, data) => data.t === 'action' ? sessions[uid].action(data.action) : sessions[uid].rt(from, data));
    sessions[uid] = new CoopSession({ uid, host: 'h', players: ['h', 'g'],
      // Explicit test profile keeps natural combat alive; never modify a live world/RNG.
      profile: { name: uid, level: 1, weapon: uid === 'g' ? 'bow' : 'blade', mods: { maxHp: 2000 }, threats: { S2: 1 } },
      config: { stageId: 'S2', threat: 1, seed: 11 }, ...t,
      sendRt(data) { if (uid === 'h' && data.t === 'snapshot') wireHash.update(JSON.stringify(data)); t.sendRt(data); },
      onFrame(world, events) { if (uid === 'h') eventHash.update(JSON.stringify(events)); }
    });
  }
  const p = sessions.g.prediction, original = p.reconcile;
  const own = w => p.view(w)?.entities.find(e => e.pid === 'g');
  p.reconcile = function(world) {
    const a = own(world), count = p.stats.corrections, snaps = p.stats.snaps, total = p.stats.totalDistance;
    const authority = world.entities.find(e => e.pid === 'g');
    const evidence = previousAuthority && (authority.hp < previousAuthority.hp || authority.hurtInvuln > previousAuthority.hurtInvuln || Math.hypot(authority.kx, authority.ky) > Math.hypot(previousAuthority.kx, previousAuthority.ky) + .5);
    const result = original.call(this, world), b = own(world);
    if (p.stats.corrections > count) {
      const row = { now, jump: Math.hypot(a.x - b.x, a.y - b.y), offset: Math.hypot(p.offset.x, p.offset.y),
        distance: p.stats.totalDistance - total,
        reason: p.stats.lastCorrection?.reason ?? (authority.terminal || authority.dead ? 'terminal' : evidence ? 'authority-hit' : 'drift'),
        snap: p.stats.snaps > snaps, pending: p.pending.length };
      corrections.push(row);
      if (p.smoothLeft > 0 && row.reason === 'authority-hit' && episode === null) episode = { at: now, distance: row.distance };
      if (row.snap && episode !== null) { convergences.push({ ...episode, elapsed: now - episode.at, endedBy: 'snap', offset: 0 }); episode = null; }
    }
    previousAuthority = { ...authority };
    return result;
  };
  for (let frame = 0; frame < 1800; frame++) {
    now = frame * 1000 / 60; transport.flush(now);
    const input = { ...emptyInput(), mx: now >= 1000 && now < 1200 ? 1 : 0, dodgeEdge: frame === 78 };
    if (frame === 60) onsetX = sessions.g.view()?.entities.find(e => e.pid === 'g')?.x;
    sessions.g.update(1000 / 60, input);
    const displayed = sessions.g.view()?.entities.find(e => e.pid === 'g');
    if (onsetX !== null && reaction === null && displayed && Math.abs(displayed.x - onsetX) > .01) reaction = now - 1000 + 1000 / 60;
    if (frame % 2 === 0) { sessions.h.update(1000 / 30, emptyInput()); if (sessions.h.world) worldHash.update(JSON.stringify(sessions.h.world)); }
    pendingMax = Math.max(pendingMax, p.pending.length); offsetMax = Math.max(offsetMax, Math.hypot(p.offset.x, p.offset.y));
    if (episode !== null && p.smoothLeft === 0) { convergences.push({ ...episode, elapsed: now - episode.at, endedBy: 'converged', offset: Math.hypot(p.offset.x, p.offset.y) }); episode = null; }
  }
  return { condition, inputOnsetMs: reaction, guestOwnsWorld: sessions.g.world !== null,
    hostWorldDigest: worldHash.digest('hex'), hostEventDigest: eventHash.digest('hex'), hostWireDigest: wireHash.digest('hex'),
    pendingMax, offsetMax, unfinishedOffset: Math.hypot(p.offset.x, p.offset.y), convergencesMs: convergences, corrections,
    prediction: p.diagnostics() };
}
console.log(JSON.stringify({ root, sourceSha256: Object.fromEntries(['prediction.js','player-prediction.js','session.js','protocol.js'].map(f => [f, digest(readFileSync(resolve(root, 'arpg/js/net', f)))])),
  scenarios: [{ latency: 0, jitter: 0, loss: 0 }, { latency: 60, jitter: 20, loss: .02 }, { latency: 120, jitter: 40, loss: .02 }].map(run) }, null, 2));
