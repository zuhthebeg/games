import { createHash } from 'node:crypto';
import { createWorld, addPlayer, startStage, step, emptyInput } from '../../../js/sim/world.js';
export function trace(party = false, register = () => {}) {
  const digest = createHash('sha256');
  for (const seed of [3, 72, 99]) {
    const world = createWorld({ seed });
    addPlayer(world, { pid: 'host', mods: { maxHp: 2000 } });
    if (party) { addPlayer(world, { pid: 'guest', x: 850, mods: { maxHp: 2000 } }); register(world, 'guest'); }
    startStage(world, 'S2');
    for (let t = 0; t < 900; t++) {
      const input = { ...emptyInput(), mx: Math.sin(t / 45), my: Math.cos(t / 60), attack: t % 31 < 20,
        dodgeEdge: t % 47 === 0, skillEdge: t % 79 === 0, potionEdge: t % 173 === 0, viewTick: Math.max(0, t - 6) };
      step(world, { host: input, guest: { ...input, viewTick: undefined, mx: -input.mx } });
      digest.update(JSON.stringify(world));
    }
  }
  return digest.digest('hex');
}
