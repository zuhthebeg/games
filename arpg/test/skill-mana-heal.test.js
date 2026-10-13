import test from 'node:test';
import { trained } from './fixtures/trained.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ABILITIES, WEAPONS, MONSTERS, PLAYER_BASE } from '../js/content/combat.js';
import { createWorld, addPlayer, spawnMonster, step, emptyInput } from '../js/sim/world.js';
import { ticks } from '../js/sim/core.js';
import { createSave, SaveStore, validateSave } from '../js/meta/save.js';
import { learnSkill, equipSkill, BOOKS } from '../js/meta/skills.js';
import { buildRoundMods, createTracker, trackRound } from '../js/meta/run.js';
import { CoopSession } from '../js/net/session.js';
import { createMemoryTransport } from '../js/net/loopback.js';
import { healingFeedback } from '../js/render/healing-feedback.js';

const costs = { lunge: 16, volley: 16, ember_bolt: 14, whirl: 20, heavy_cleave: 26,
  pierce_shot: 18, blast_arrow: 24, frost_lance: 12, flame_ring: 18, healing_light: 28 };
const before = JSON.parse(readFileSync(new URL('./fixtures/combat-before-mana-heal.json', import.meta.url)));
const input = (edges = {}) => ({ ...emptyInput(), aimX: 1, ...edges });
const fixture = (id = 'healing_light') => {
  const world = createWorld();
  const p = addPlayer(world, { pid: 'caster', weapon: ABILITIES[id].family, x: 500, y: 400,
    mods: { skill: id, mpRegen: 0 } });
  return { world, p };
};
// blast_arrow gets 54 (not 52) so its rounded 60% splash is still >= 2x the old 16.
const boosted = (id, dmg) => id === 'blast_arrow' ? 54 : dmg * 2;
const advance = (world, count, inputs = {}) => Array.from({ length: count }, () => step(world, inputs)).flat();

test('nine damage values, six mana costs and R1 area sizes change; basics, monsters, kits and counter data untouched', () => {
  for (const [id, old] of Object.entries(before.ABILITIES)) {
    const expected = structuredClone(old);
    if (Object.hasOwn(costs, id)) { expected.damage = boosted(id, old.damage); expected.manaCost = costs[id]; }
    // R1 only expands these four hit dimensions; all other content remains exact.
    if (id === 'whirl') expected.shape.radius = 136.5;
    if (id === 'heavy_cleave') expected.shape.range = 168.75;
    if (id === 'blast_arrow') expected.projectile.explode.radius = 108;
    if (id === 'flame_ring') expected.shape.radius = 169;
    assert.deepEqual(ABILITIES[id], expected, id);
  }
  assert.deepEqual(WEAPONS, before.WEAPONS);
  // D0 adds only the stationary S1 sample; the historical nine remain exact.
  const { gargoyle, training_dragon, throne_dragon, ...previousMonsters } = MONSTERS;
  // Heavy-poise flag (10-13) is the only addition to the historical archetypes.
  const unflagged = Object.fromEntries(Object.entries(previousMonsters).map(([id, { heavyPoise, ...rest }]) => [id, rest]));
  assert.deepEqual(unflagged, before.MONSTERS);
  assert.deepEqual(PLAYER_BASE, before.PLAYER_BASE);
  assert.equal(ABILITIES.healing_light.damage, 0);
});

test('every skill charges once on accepted cast; insufficient MP leaves act, cooldown and MP unchanged', () => {
  for (const [id, cost] of Object.entries(costs)) {
    const { world, p } = fixture(id);
    p.mp = cost - 1;
    step(world, { caster: input({ skillEdge: true }) });
    assert.equal(p.act, null, id); assert.deepEqual(p.cds, {}); assert.equal(p.mp, cost - 1);
    p.mp = cost;
    step(world, { caster: input({ skillEdge: true }) });
    assert.equal(p.act.id, id); assert.equal(p.mp, 0);
    advance(world, 70, { caster: input({ skillEdge: true }) });
    assert.equal(p.mp, 0); assert.equal(p.act, null); assert.ok(p.cds[id] > 0);
    assert.equal(world.projectiles.filter(pr => pr.ownerId === p.id).length <= (ABILITIES[id].projectile?.count || 0), true);
  }
});

test('all basic attacks remain free; AUTO never casts any equipped skill including heal', () => {
  for (const id of Object.keys(costs)) {
    const { world, p } = fixture(id); p.mp = 0; p.hp = 10;
    const target = spawnMonster(world, 'scarecrow', 555, 400); target.spawnLeft = 0;
    const events = advance(world, 100, { caster: input({ autoAttack: true }) });
    assert.equal(p.mp, 0); assert.equal(p.hp, 10);
    assert.ok(events.some(e => e.type === 'act' && e.ability === WEAPONS[p.weapon].basic));
    assert.equal(events.some(e => e.ability === id), false);
  }
});

test('nine doubled skills deliver exact neutral damage per actual hit/projectile; explosions match area hits', () => {
  for (const id of Object.keys(costs).filter(id => id !== 'healing_light')) {
    const def = ABILITIES[id];
    const angles = def.projectile?.count > 1 ? Array.from({ length: def.projectile.count }, (_, i) =>
      ((i / (def.projectile.count - 1)) - .5) * def.projectile.spreadDeg * Math.PI / 180) : [0];
    for (const angle of angles) {
      const { world, p } = fixture(id);
      const distance = def.delivery === 'shape' ? 60 : def.delivery === 'dash' ? 95 : 170;
      const target = spawnMonster(world, 'scarecrow', p.x + Math.cos(angle) * distance, p.y + Math.sin(angle) * distance);
      target.spawnLeft = 0;
      const events = [...step(world, { caster: input({ skillEdge: true }) }), ...advance(world, 50)];
      const hits = events.filter(e => e.type === 'hit' && e.dst === target.id);
      assert.equal(hits.length, 1, `${id} angle ${angle}`);
      assert.equal(hits[0].dmg, boosted(id, before.ABILITIES[id].damage), id);
      assert.equal(events.filter(e => e.type === 'act' && e.ability === id).length, 1);
    }
    if (def.projectile?.explode) {
      const { world, p } = fixture(id);
      const targets = [spawnMonster(world, 'scarecrow', p.x + 170, p.y), spawnMonster(world, 'scarecrow', p.x + 170, p.y + 50)];
      targets.forEach(t => { t.spawnLeft = 0; });
      const events = [...step(world, { caster: input({ skillEdge: true }) }), ...advance(world, 50)];
      assert.equal(events.filter(e => e.type === 'explode').length, 1);
      for (const target of targets) {
        const hits = events.filter(e => e.type === 'hit' && e.dst === target.id);
        assert.equal(hits.length, 1);
        assert.equal(hits[0].dmg, Math.round(def.damage * (target === targets[0] ? 1 : .6)));
      }
    }
  }
});

test('healing uses each living allied target max HP once, inclusive 160px range, capped; no enemy/dead/terminal heals', () => {
  const { world, p } = fixture(); p.hp = 10;
  const ally = addPlayer(world, { pid: 'ally', x: 660, y: 400, mods: { maxHp: 200 } }); ally.hp = 50;
  const capped = addPlayer(world, { pid: 'cap', x: 500, y: 500 }); capped.hp = 95;
  const full = addPlayer(world, { pid: 'full', x: 500, y: 450 });
  const outside = addPlayer(world, { pid: 'outside', x: 660.01, y: 400 }); outside.hp = 10;
  const dead = addPlayer(world, { pid: 'dead', x: 520, y: 400 }); dead.hp = 0; dead.dead = true;
  const zero = addPlayer(world, { pid: 'zero', x: 520, y: 400 }); zero.hp = 0;
  const returned = addPlayer(world, { pid: 'returned', x: 520, y: 400 }); returned.hp = 10; returned.terminal = 'return_scroll';
  const enemy = addPlayer(world, { pid: 'enemy', x: 520, y: 400 }); enemy.hp = 10; enemy.team = 2;
  const monster = spawnMonster(world, 'scarecrow', 530, 400); monster.team = p.team; monster.hp = 1;
  const events = [...step(world, { caster: input({ skillEdge: true }) }), ...advance(world, 80)];
  assert.deepEqual([p.hp, ally.hp, capped.hp, full.hp, outside.hp, dead.hp, zero.hp, returned.hp, enemy.hp, monster.hp],
    [40, 110, 100, 100, 10, 0, 0, 10, 10, 1]);
  assert.equal(events.filter(e => e.type === 'healCast').length, 1);
  assert.deepEqual(events.filter(e => e.type === 'heal').map(e => [e.dst, e.heal]), [[p.id, 30], [ally.id, 60], [capped.id, 5]]);
  assert.equal(p.mp, 72);
});

test('heal phases are observable and completion CD is 10s; windup dodge cancels without heal/refund/recast exploit', () => {
  const { world, p } = fixture(); p.hp = 10;
  step(world, { caster: input({ skillEdge: true }) });
  assert.equal(p.act.phase, 'windup'); assert.equal(p.hp, 10); assert.equal(p.mp, 72);
  const phases = new Set([p.act.phase]); let events = [];
  while (p.act) { events.push(...step(world)); if (p.act) phases.add(p.act.phase); }
  assert.deepEqual([...phases], ['windup', 'lock', 'active', 'recovery']);
  assert.equal(p.hp, 40); assert.equal(p.cds.healing_light, ticks(10000));
  assert.equal(events.filter(e => e.type === 'heal').length, 1);
  step(world, { caster: input({ skillEdge: true }) }); assert.equal(p.act, null); assert.equal(p.mp, 72);
  const canceled = fixture(); canceled.p.hp = 10;
  step(canceled.world, { caster: input({ skillEdge: true }) });
  const cancel = step(canceled.world, { caster: input({ dodgeEdge: true }) });
  assert.ok(cancel.some(e => e.type === 'actCancel' && e.ability === 'healing_light'));
  assert.equal(canceled.p.act, null); assert.equal(canceled.p.mp, 72);
  assert.equal(canceled.p.cds.healing_light, ticks(10000));
  assert.equal(advance(canceled.world, 70, { caster: input({ skillEdge: true }) }).some(e => e.type === 'heal'), false);
  assert.equal(canceled.p.hp, 10); assert.equal(canceled.p.mp, 72);
});

test('heal book learn/equip/save/load works without schema changes; one focus slot and mods preserve it', () => {
  const original = trained(createSave({ name: '힐러', answers: [0,0,0,0,0], weapon: 'focus', createdAt: 1 })); original.gold = 500;
  const learned = learnSkill(original, 'healing_light');
  assert.equal(original.gold, 500); assert.equal(learned.gold, 300); assert.equal(BOOKS.healing_light.price, 200);
  assert.throws(() => learnSkill(learned, 'healing_light'));
  const equipped = equipSkill(learned, 'focus', 'healing_light');
  // Fresh focus save: slot 1 ember_bolt, the learned heal goes to the first empty slot.
  assert.deepEqual(buildRoundMods(equipped).skills, ['ember_bolt', 'healing_light', null]);
  assert.throws(() => equipSkill(original, 'focus', 'healing_light'), /배우지/);
  const storage = new Map(); const store = new SaveStore({ getItem: k => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k) });
  store.save(equipped); assert.deepEqual(store.load(), equipped); assert.ok(validateSave(store.load()));
  const replaced = equipSkill(equipSkill(learnSkill(equipped, 'frost_lance'), 'focus', 'frost_lance'), 'focus', 'healing_light');
  assert.deepEqual(replaced.loadout, ['ember_bolt', 'healing_light', 'frost_lance']); assert.equal(replaced.version, original.version);
});

test('co-op guest cast uses host only, HP/MP personal snapshots and heal journal arrive once through dropped/repeated packets', () => {
  const network = createMemoryTransport(), sessions = {}, received = { host: [], guest: [] }, saves = {}, trackers = {};
  for (const uid of ['host', 'guest']) {
    saves[uid] = createSave({ name: uid, answers: [0,0,0,0,0], weapon: 'focus', createdAt: 1 });
    trackers[uid] = createTracker(1);
    const transport = network.connect(uid, (from, packet) => packet.t === 'action' ? sessions[uid].action(packet.action) : sessions[uid].rt(from, packet));
    sessions[uid] = new CoopSession({ uid, host: 'host', players: ['host', 'guest'], config: { stageId: 'S1', seed: 1, threat: 1 },
      profile: { name: uid, level: 1, weapon: 'focus', mods: { skill: 'healing_light', mpRegen: 0 }, threats: { S1: 1 } }, ...transport,
      onFrame: (view, events) => { received[uid].push(...events); trackers[uid] = trackRound(saves[uid], trackers[uid], events).tracker; } });
  }
  sessions.guest.update(34, emptyInput());
  const world = sessions.host.world;
  const host = world.entities.find(e => e.pid === 'host'), guest = world.entities.find(e => e.pid === 'guest');
  host.hp = 10; guest.hp = 20;
  const send = sessions.host.sendRt; sessions.host.sendRt = () => {};
  sessions.guest.update(34, input({ skillEdge: true }));
  for (let i = 0; i < 40; i++) sessions.host.update(34, emptyInput());
  assert.equal(host.hp, 40); assert.equal(guest.hp, 50); assert.equal(guest.mp, 72);
  assert.equal(received.guest.some(e => e.type === 'heal'), false);
  sessions.host.sendRt = send; sessions.host.broadcast(); world.tick++; sessions.host.broadcast();
  const view = sessions.guest.view();
  assert.equal(view.entities[0].pid, 'guest'); assert.equal(view.entities[0].hp, 50); assert.equal(view.entities[0].mp, 72);
  assert.equal(view.entities.find(e => e.pid === 'host').hp, 40);
  assert.equal(received.guest.filter(e => e.type === 'heal').length, 2);
  assert.equal(received.guest.filter(e => e.type === 'healCast').length, 1);
  assert.equal(sessions.guest.world, null);
  assert.equal(trackers.guest.killIndex, 0); assert.equal(trackers.host.killIndex, 0);
  assert.equal(saves.guest.gold, 30); assert.equal(saves.guest.xp, 0);
});

test('minimal healing feedback consumes only heal events; no combat mutation or hit-stop', () => {
  const calls = [], renderer = { effect: (...args) => calls.push(['effect', ...args]), number: (...args) => calls.push(['number', ...args]) };
  assert.equal(healingFeedback(renderer, { type: 'healCast', x: 1, y: 2, radius: 160 }), true);
  assert.equal(healingFeedback(renderer, { type: 'heal', x: 3, y: 4, heal: 5 }), true);
  assert.equal(healingFeedback(renderer, { type: 'hit' }), false);
  assert.deepEqual(calls, [['effect', 1, 2, 160, 0x79dca0, .4], ['number', '+5', 3, 4, 0x79dca0]]);
});
