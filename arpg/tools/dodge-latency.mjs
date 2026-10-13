import { CoopSession } from '../js/net/session.js';
import { createMemoryTransport } from '../js/net/loopback.js';
import { spawnMonster, emptyInput } from '../js/sim/world.js';
import { ABILITIES } from '../js/content/combat.js';
import { ticks, TICK_MS } from '../js/sim/core.js';
import { pathToFileURL } from 'node:url';
export function dodgeLatency(condition, Session = CoopSession, trials = 80) {
  let perfect = 0, attempted = 0, counters = 0, refunds = 0;
  for (let seed = 1; seed <= trials; seed++) {
    const network = createMemoryTransport({ ...condition, seed }), sessions = {};
    let logicalNow = 0, armed = false, pressed = false, paid = false, counter = false;
    for (const uid of ['host', 'guest']) {
      const transport = network.connect(uid, (from, data) => {
        if (data.t === 'pong') { if (data.to === uid) sessions[uid].rtt = logicalNow - data.at; }
        else if (data.t === 'action') sessions[uid].action(data.action);
        else sessions[uid].rt(from, data);
      });
      sessions[uid] = new Session({ uid, host: 'host', players: ['host', 'guest'],
        profile: { level: 1, weapon: 'blade', mods: { maxHp: 2000 }, threats: { S2: 1 } },
        config: { stageId: 'S2', threat: 1, seed }, ...transport,
        sendRt: data => transport.sendRt(data.t === 'ping' ? { ...data, at: logicalNow } : data),
        onBegin: () => { if (uid === 'host') {
          const w = sessions.host.world;
          w.round.pending = []; w.round.goal = 'timer'; w.round.timerTicks = 1e6;
          const h = w.entities.find(e => e.pid === 'host'), g = w.entities.find(e => e.pid === 'guest');
          h.x = 1100; h.y = 700; g.x = 400; g.y = 400;
        } },
        onFrame: (_, events) => { if (uid === 'host') {
          paid ||= events.some(e => e.type === 'perfectDodge' && e.pid === 'guest');
          counter ||= events.some(e => e.type === 'counter' && e.pid === 'guest');
          refunds += events.filter(e => e.type === 'dodgeRewind').length;
        } },
      });
    }
    for (let frame = 0; frame < 330; frame++) {
      logicalNow = frame * TICK_MS / 2; network.flush(logicalNow);
      const host = sessions.host, guest = sessions.guest;
      if (!armed && host.world && logicalNow >= 1800 + seed % 6 * TICK_MS / 2) {
        const w = host.world, m = spawnMonster(w, 'goblin_grunt', 460, 400), def = ABILITIES.goblin_slash;
        m.spawnLeft = 0; m.hp = m.maxHp = 10000; m.thinkLeft = 9999;
        const phaseTicks = Object.fromEntries(['windup','lock','active','recovery'].map(p => [p, ticks(def[`${p}Ms`])]));
        m.act = { id: 'goblin_slash', def, phaseTicks, phase: 'windup', left: phaseTicks.windup,
          elapsed: 0, total: phaseTicks.windup + phaseTicks.lock, facing: Math.PI, ox: m.x, oy: m.y, hit: [], fired: false };
        armed = true;
      }
      const view = guest.view(), warning = view?.entities.find(e => e.kind === 'monster')?.act;
      // The exact action clock supplied to rendering: dodge 1-2 ticks before the visible impact.
      const edge = !pressed && warning && warning.phase !== 'recovery' && warning.total - warning.elapsed <= 2;
      if (edge) { pressed = true; attempted++; }
      guest.update(TICK_MS / 2, { ...emptyInput(), dodgeEdge: !!edge, mx: edge ? 1 : 0 });
      if (frame % 2 === 0) host.update(TICK_MS, emptyInput());
    }
    perfect += Number(paid); counters += Number(counter);
  }
  return { ...condition, trials, attempted, perfect, perfectRate: perfect / trials, counters, refunds };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const Session = process.argv[2] ? (await import(pathToFileURL(process.argv[2]).href)).CoopSession : CoopSession;
  console.log(JSON.stringify([0,40,80,120].map(latency => dodgeLatency({ latency, jitter: latency ? 25 : 0 }, Session)), null, 2));
}
