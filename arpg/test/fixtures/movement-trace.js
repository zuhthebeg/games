import { createHash } from 'node:crypto';
import { createWorld, addPlayer, startStage, step, emptyInput, spawnMonster } from '../../js/sim/world.js';
export function movementTraces() {
  return ['blade', 'bow', 'focus'].flatMap(weapon => [1, 42, 999].map(seed => {
    const world = createWorld({ seed });
    addPlayer(world, { pid: 'a', weapon, x: 20, y: 30, mods: { speedMult: 1.13, maxHp: 10000, dodgeCdMult: .9 } });
    addPlayer(world, { pid: 'b', weapon: 'blade', x: 30, y: 30, mods: { maxHp: 10000 } });
    startStage(world, 'S3'); spawnMonster(world, 'goblin_grunt', 30, 40);
    const hash = createHash('sha256');
    for (let i = 0; i < 900; i++) {
      world.entities[0].loadRatio = [0, .9, 1.2][Math.floor(i / 100) % 3];
      step(world, { a: { ...emptyInput(), mx: Math.sin(i / 20), my: Math.cos(i / 31), aimX: i % 10 ? 0 : 1,
        attack: i % 50 < 30, dodgeEdge: i % 97 === 0, skillEdge: i % 160 === 0, potionEdge: i % 189 === 0,
        scrollEdge: i === 897 }, b: { ...emptyInput(), mx: i % 100 < 50 ? 1 : -1, my: .5, dodgeEdge: i % 89 === 0 } });
      hash.update(JSON.stringify(world, (key, v) => key === 'def' ? undefined : v));
    }
    return { weapon, seed, sha256: hash.digest('hex') };
  }));
}
