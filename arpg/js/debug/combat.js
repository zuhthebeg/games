export function queueVisibleKills(world, renderer) {
  const player = world.entities.find(entity => entity.kind === 'player');
  if (!player || player.terminal) return 0;
  let count = 0;
  for (const monster of world.entities) {
    if (monster.kind !== 'monster' || monster.dead || monster.type === 'scarecrow') continue;
    const x = monster.x * renderer.scale + renderer.root.x;
    const y = monster.y * renderer.scale + renderer.root.y;
    if (x < 0 || y < 0 || x > renderer.app.screen.width || y > renderer.app.screen.height) continue;
    monster.hp = 1;
    monster.spawnLeft = 0;
    // Existing arrow collision/applyHit path emits real hit + kill; trackRound owns drops.
    world.projectiles.push({ id: world.nextId++, team: player.team, ownerId: player.id,
      ownerKind: 'player', ownerType: player.weapon, abilityId: 'arrow',
      x: monster.x, y: monster.y, vx: 0, vy: 0, r: monster.r + 2,
      travelled: 0, range: 1, pierce: 0, hit: [], dmgMult: 100, poiseMult: 1 });
    count++;
  }
  return count;
}
export function requestClear(world) {
  // Let stepRound emit the normal terminal/clear events on the following tick.
  world.round.goal = 'timer';
  world.round.timerTicks = world.round.t + 1;
}
export function createCombatController() {
  const state = { god: false, oneHit: false, mana: false, speed: 1 };
  const baseDamage = new WeakMap();
  const queue = [];
  return {
    state,
    enqueue(action) { queue.push(action); },
    beforeTick(world, renderer) {
      const player = world?.entities.find(entity => entity.kind === 'player');
      if (!player || player.terminal || world.round.state !== 'running') { queue.length = 0; return; }
      if (!baseDamage.has(player)) baseDamage.set(player, { ...player.dmgMult });
      for (const [family, value] of Object.entries(baseDamage.get(player))) player.dmgMult[family] = value * (state.oneHit ? 100 : 1);
      if (state.god) { player.hp = player.maxHp; player.hurtInvuln = Math.max(2, player.hurtInvuln); player.poison = null; }
      if (state.mana) player.mp = player.maxMp;
      for (const action of queue.splice(0)) action(world, renderer);
    },
  };
}
