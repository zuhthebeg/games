import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, addPlayer, spawnMonster, step, emptyInput, getTelegraphs } from '../js/sim/world.js';
import { ticks, shapeHitsCircle } from '../js/sim/core.js';
import { ABILITIES } from '../js/content/combat.js';

const run = (world, count) => {
  const events = [];
  for (let tick = 0; tick < count; tick++) events.push(...step(world, { a: emptyInput() }));
  return events;
};
function puddle(phase = 'active') {
  const world = createWorld({ seed: 7 });
  const player = addPlayer(world, { pid: 'a', x: 400, y: 400 });
  const spider = spawnMonster(world, 'poison_spider', 460, 400);
  spider.spawnLeft = 0;
  spider.thinkLeft = 0;
  spider.cds.spider_bite = 9999;
  step(world, { a: emptyInput() });
  assert.equal(spider.act.id, 'spider_puddle');
  while (spider.act.phase !== phase) step(world, { a: emptyInput() });
  assert.equal(player.hp, player.maxHp, 'no attack before active');
  return { world, player, spider };
}

test('puddle origin is frozen at lock, even if the source is displaced before active', () => {
  const { world, player, spider } = puddle('lock');
  const locked = getTelegraphs(world)[0];
  spider.x += 200; spider.y += 200;
  while (spider.act.phase !== 'active') step(world, { a: emptyInput() });
  const active = getTelegraphs(world)[0];
  assert.equal(active.ox, locked.ox);
  assert.equal(active.oy, locked.oy);
  assert.equal(active.facing, locked.facing);
  step(world, { a: emptyInput() });
  assert.equal(player.hp, 96);
});

test('puddle locks origin/facing, and active telegraph is exactly the persistent hit shape', () => {
  const { world, player, spider } = puddle();
  const before = getTelegraphs(world)[0];
  assert.equal(before.shape, ABILITIES.spider_puddle.shape);
  assert.equal(before.phase, 'active');
  const facing = spider.act.facing;
  spider.x += 200; spider.y += 200; // displaced source must not drag a locked puddle
  const after = getTelegraphs(world)[0];
  assert.deepEqual(after, before);
  assert.ok(shapeHitsCircle(after.shape, after.ox, after.oy, after.facing, player.x, player.y, player.r));
  step(world, { a: emptyInput() });
  assert.equal(spider.act.facing, facing);
  assert.equal(player.hp, 96);
  assert.ok(player.poison);
});

test('leaving before active avoids both zone damage and poison; dodging contact avoids application', () => {
  const safe = puddle();
  safe.player.x = 100;
  run(safe.world, 90);
  assert.equal(safe.player.hp, 100);
  assert.equal(safe.player.poison, undefined);
  const dodge = puddle();
  dodge.player.dodge.iframeLeft = 5;
  step(dodge.world, { a: emptyInput() });
  assert.equal(dodge.player.hp, 100);
  assert.equal(dodge.player.poison, undefined);
});

test('poison has four deterministic one-second pulses, no stacking, and expires after leaving', () => {
  const { world, player } = puddle();
  step(world, { a: emptyInput() });
  player.x = 100;
  player.dodge.iframeLeft = 999;
  player.hurtInvuln = 999;
  run(world, 29);
  assert.equal(player.hp, 96);
  run(world, 1);
  assert.equal(player.hp, 93, 'already-applied poison is not avoided by dodge/hurt invulnerability');
  const events = run(world, 90);
  assert.equal(player.hp, 84);
  assert.equal(player.poison, null);
  assert.equal(events.filter((event) => event.type === 'hit').length, 3);
  run(world, 10);
  assert.equal(player.hp, 84);
});

test('puddle repeats once per second; reapplication refreshes duration without delaying DoT or stacking', () => {
  const { world, player } = puddle();
  const events = run(world, 91);
  assert.equal(events.filter((event) => event.type === 'poison').length, 1);
  assert.equal(events.filter((event) => event.type === 'hit' && event.dmg === 4).length, 4);
  assert.equal(events.filter((event) => event.type === 'hit' && event.dmg === 3).length, 3);
  assert.equal(player.hp, 75);
  assert.equal(player.poison.next, ticks(1000));
  player.x = 100;
  run(world, 120);
  assert.equal(player.hp, 63);
  assert.equal(player.poison, null);
});

test('poison breaks return channel without consuming scroll and records exact DoT death cause', () => {
  const { world, player } = puddle();
  step(world, { a: emptyInput() });
  player.x = 100;
  step(world, { a: { ...emptyInput(), scrollEdge: true } });
  assert.ok(player.channel > 0);
  const events = run(world, 29);
  assert.ok(events.some((event) => event.type === 'channelBroken'));
  assert.equal(player.scrolls, 1);
  player.hp = 3;
  run(world, 30);
  assert.equal(player.terminal, 'death');
  assert.equal(player.deathCause.ability, 'spider_puddle');
  assert.equal(player.deathCause.by, 'poison_spider');
  assert.deepEqual(player.deathCause.shape, ABILITIES.spider_puddle.shape);
  assert.equal(player.poison, null);
});

test('poison stops on terminal return/clear, and interrupted source removes its puddle telegraph', () => {
  for (const terminal of ['clear', 'return_scroll']) {
    const { world, player, spider } = puddle();
    step(world, { a: emptyInput() });
    player.x = 100;
    player.terminal = terminal;
    const hp = player.hp;
    run(world, 60);
    assert.equal(player.hp, hp);
    spider.dead = true;
    assert.equal(getTelegraphs(world).length, 0);
  }
});

test('poison+puddle simulation remains deterministic with seeded inputs', () => {
  const play = () => {
    const { world } = puddle();
    run(world, 240);
    return JSON.stringify(world);
  };
  assert.equal(play(), play());
});
