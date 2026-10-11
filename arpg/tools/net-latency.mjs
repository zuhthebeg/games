import { CoopSession } from '../js/net/session.js';
import { createMemoryTransport } from '../js/net/loopback.js';
import { SnapshotBuffer as LegacyBuffer } from '../test/fixtures/net-before/protocol.js';
import { emptyInput } from '../js/sim/world.js';
import { pathToFileURL } from 'node:url';
export const CONDITIONS = [{ latency: 60, jitter: 20, loss: .02 }, { latency: 120, jitter: 40, loss: .02 }];
const percentile = (values, p) => [...values].sort((a,b) => a-b)[Math.max(0, Math.ceil(values.length * p) - 1)] ?? 0;
export function measure(condition, legacy = false) {
  const network = createMemoryTransport({ ...condition, seed: 13579 }), sessions = {};
  for (const uid of ['host', 'guest']) {
    const transport = network.connect(uid, (from, data) => data.t === 'action' ? sessions[uid].action(data.action) : sessions[uid].rt(from, data));
    sessions[uid] = new CoopSession({ uid, host: 'host', players: ['host', 'guest'],
      profile: { level: 1, weapon: 'blade', mods: {}, threats: { S2: 1 } }, config: { stageId: 'S2', seed: 11, threat: 1 }, ...transport });
  }
  const host = sessions.host, guest = sessions.guest;
  if (legacy) { guest.buffer = new LegacyBuffer('guest'); guest.prediction.reconcile = () => {}; guest.prediction.advance = () => {}; }
  const dt = 1000 / 60, reactions = [], jumps = [];
  let previous, repeated = 0, samples = 0, onset = null, onsetX = 0, wasMoving = false;
  let startup = false;
  for (let i = 0; i < 1800; i++) {
    const now = i * dt; network.flush(now);
    const moving = now >= 2500 && now % 4000 >= 500 && now % 4000 < 1300;
    const direction = Math.floor(now / 4000) % 2 ? -1 : 1;
    const before = guest.view()?.entities[0].x;
    if (moving && !wasMoving && before !== undefined) { onset = now; onsetX = before; }
    wasMoving = moving;
    if (!legacy || i % 2 === 0) guest.update(legacy ? dt * 2 : dt, { ...emptyInput(), mx: moving ? direction : 0 });
    if (i % 2 === 0) host.update(dt * 2, { ...emptyInput(), my: Math.floor(now / 2000) % 2 ? -.3 : .3 });
    if (host.world && !startup) {
      // Isolate network movement: no damage/AI/terminal transitions in this trace.
      host.world.entities = host.world.entities.filter(e => e.kind === 'player');
      host.world.round.pending = []; host.world.round.goal = 'timer'; host.world.round.timerTicks = 1e6; startup = true;
    }
    const view = guest.view();
    if (!view || !guest.buffer.frames.length) continue;
    const self = view.entities.find(e => e.pid === 'guest');
    if (onset !== null && Math.abs(self.x - onsetX) > .01) { reactions.push(now - onset + dt); onset = null; }
    const remote = view.entities.find(e => e.pid === 'host');
    if (now > 2500 && previous !== undefined) {
      const jump = Math.abs(remote.y - previous); jumps.push(jump); if (jump < .001) repeated++; samples++;
    }
    previous = remote.y;
  }
  return { legacy, condition, inputLatencyMs: { samples: reactions.length, median: percentile(reactions, .5), p95: percentile(reactions, .95), max: Math.max(...reactions) },
    remote: { samples, repeatRatio: repeated / samples, jumpP95Px: percentile(jumps, .95) },
    correction: guest.prediction.diagnostics(), delayMs: guest.buffer.delay, hostSnapshots: host.snapshots, hostSeconds: host.now / 1000 };
}
export function latencyReport() { return CONDITIONS.map(condition => ({ before: measure(condition, true), after: measure(condition) })); }
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(latencyReport(), null, 2));
