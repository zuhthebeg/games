import { CoopSession } from '../../js/net/session.js';
import { createMemoryTransport } from '../../js/net/loopback.js';
import { createSave, validateSave, SaveStore } from '../../js/meta/save.js';
import { allocateStats } from '../../js/meta/stats.js';
import { ITEMS, instance } from '../../js/meta/items.js';
import { equipmentVisual } from '../../js/render/paperdoll-state.js';
import { buildRoundMods, createTracker, trackRound, usedConsumables, settleRound, currentLoad } from '../../js/meta/run.js';
import { botInput } from '../../tools/balance/bot.js';
import { emptyInput } from '../../js/sim/world.js';

export function fixtureSave(name, weapon = 'blade') {
  let save = createSave({ name, answers: [0,0,0,0,0], weapon, createdAt: name === 'host' ? 111 : 222 });
  save.level = 12; save.statPoints = 11;
  save = allocateStats(save, { str: 4, agi: 4, wis: 3 });
  save.cleared.S1 = true; save.stageThreat.S1 = 1;
  const bases = { weapon: weapon === 'blade' ? 'warden_blade_epic' : 'frost_bow_epic', body: 'warden_plate_epic',
    head: 'head_medium_fine_t3_epic', hands: 'hands_medium_fine_t3_epic', feet: 'feet_medium_fine_t3_epic' };
  save.items = [];
  for (const [slot, id] of Object.entries(bases)) {
    if (!ITEMS[id]) throw new Error(`fixture item missing: ${id}`);
    const item = instance(`${name}:${slot}`, id, save.createdAt, []); item.enhance = 5;
    save.items.push(item); save.equipped[slot] = item.uid;
  }
  if (!validateSave(save)) throw new Error('invalid fixture save');
  return save;
}
export async function runRound({ count = 2, renderers = [], yieldFrame = async () => {} } = {}) {
  const uids = ['host', 'guest', 'third', 'fourth'].slice(0, count);
  const network = createMemoryTransport(), sessions = {}, saves = {}, trackers = {}, receipts = {}, loads = {}, stores = {};
  const evidence = { monsters: false, companion: false, telegraph: false, telegraphExact: false, guestInput: false,
    guestOwnsSim: false, independentLoot: false, renderedFrames: 0, consoleErrors: 0 };
  for (const [index, uid] of uids.entries()) {
    const storage = new Map(); stores[uid] = new SaveStore({ getItem: k => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k) });
    const save = fixtureSave(uid); stores[uid].save(save); saves[uid] = save; trackers[uid] = createTracker(index * 123456 + 11);
    loads[uid] = currentLoad(save, trackers[uid]).ratio;
    const renderer = renderers[index]; let initialized = false;
    const transport = network.connect(uid, (from, data) => data.t === 'action' ? sessions[uid]?.action(data.action) : sessions[uid]?.rt(from, data));
    sessions[uid] = new CoopSession({ uid, host: 'host', players: uids, profile: { name: uid, level: save.level, weapon: 'blade',
      mods: buildRoundMods(save), equipmentVisual: equipmentVisual(save), load: loads[uid], threats: { S2: 1 } },
      config: { stageId: 'S2', threat: 1, seed: 11 }, ...transport,
      onBeforeTick: view => renderer?.snapshot(view),
      onFrame(view, events) {
        if (renderer && !initialized) { renderer.reset(view, true); initialized = true; }
        const progress = trackRound(save, trackers[uid], events, usedConsumables(save, view.entities[0]));
        trackers[uid] = progress.tracker; loads[uid] = progress.load.ratio;
        renderer?.events(view, [...events, ...progress.fx]);
        if (view.entities[0].terminal && !receipts[uid]) {
          receipts[uid] = settleRound(save, { stageId: 'S2', terminal: view.entities[0].terminal,
            depositedXp: trackers[uid].depositedXp, tempLoot: trackers[uid].tempLoot, used: usedConsumables(save, view.entities[0]) });
          stores[uid].save(receipts[uid].save);
        }
      } });
  }
  for (const uid of uids.slice(1)) sessions[uid].update(34, emptyInput());
  const host = sessions.host, guest = sessions.guest;
  const gx = host.world.entities.find(e => e.pid === 'guest').x;
  guest.update(34, { ...emptyInput(), mx: 1, autoAttack: true }); host.update(34, emptyInput());
  evidence.guestInput = host.world.entities.find(e => e.pid === 'guest').x > gx;
  let ticks = 0;
  while (host.phase === 'running' && ticks++ < 12000) {
    for (const uid of uids.slice(1)) {
      const view = sessions[uid].view();
      sessions[uid].update(1000 / 30, view ? botInput(view, view.entities[0]) : emptyInput(), loads[uid]);
    }
    host.update(1000 / 30, botInput(host.view(), host.view().entities[0]), loads.host);
    if (guest.buffer.frames.length) {
      const view = guest.view(), latest = guest.buffer.frames.at(-1).world;
      evidence.monsters ||= view.entities.some(e => e.kind === 'monster');
      evidence.companion ||= view.entities.filter(e => e.kind === 'player').length === count;
      evidence.telegraph ||= latest.telegraphs.length > 0;
      if (latest.telegraphs.length) {
        // Packet geometry survives decoding/interpolation with unchanged phase and anchored origin.
        evidence.telegraphExact ||= JSON.stringify(view.telegraphs) === JSON.stringify(latest.telegraphs);
        if (renderers[1]) {
          renderers[1].snapshot(view); renderers[1].render(view, 1, 1 / 30);
          evidence.telegraphRendered ||= renderers[1].telegraphViews.some(v => v.visible);
        }
      }
    }
    if (ticks % 30 === 0) {
      for (const [i, uid] of uids.entries()) {
        const view = sessions[uid].view(); if (!view || !renderers[i]) continue;
        renderers[i].snapshot(view); renderers[i].render(view, 1, 1 / 30); renderers[i].app.render();
      }
      evidence.renderedFrames++;
      await yieldFrame();
    }
  }
  host.broadcast();
  evidence.guestOwnsSim = !!guest.world;
  evidence.independentLoot = JSON.stringify(trackers.host.tempLoot) !== JSON.stringify(trackers.guest.tempLoot);
  return { evidence, ticks: host.world.tick, state: host.world.round.state,
    receipts: Object.fromEntries(Object.entries(receipts).map(([id, r]) => [id, { ...r.receipt, validSave: validateSave(r.save), persisted: JSON.stringify(stores[id].load()) === JSON.stringify(r.save), name: r.save.name }])),
    bandwidth: { snapshots: host.snapshots, bytes: host.bytes, seconds: host.now / 1000,
      bytesPerSecond: Math.round(host.bytes / (host.now / 1000)), averageSnapshot: Math.round(host.bytes / host.snapshots),
      aggregateRelayEgress: Math.round(host.bytes / (host.now / 1000) * (count - 1)) } };
}
