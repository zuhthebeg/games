import { ABILITIES } from '../content/combat.js';

// Render event copies only. Sim explode events deliberately have no owner. The
// host's shot journal + monotonically allocated projectile ids recover it exactly,
// including shots created and expired between the two guest snapshots.
export function presentSkillEvents(events, world, owners) {
  const newIds = [...new Set([...world.projectiles.map(p => p.id),
    ...events.filter(e => e.type === 'projectileEnd').map(e => e.id)])]
    .filter(id => !owners.has(id)).sort((a, b) => a - b);
  let index = 0;
  for (const event of events) if (event.type === 'projectile') {
    for (let i = 0; i < ABILITIES[event.ability].projectile.count; i++) {
      const id = newIds[index++];
      if (id !== undefined) owners.set(id, event.id);
    }
  }
  for (const p of world.projectiles) owners.set(p.id, p.ownerId);
  const out = events.map((event, i) => {
    if (event.type === 'act' || event.type === 'hit') {
      const source = world.entities.find(e => e.id === (event.type === 'act' ? event.id : event.src));
      const enemy = event.type === 'hit' && world.entities.find(e => e.id === event.dst)?.kind === 'monster';
      if (source?.kind === 'player') return { ...event, masteryPid: source.pid, ...(enemy ? { masteryEnemy: true } : {}) };
    }
    if (event.type !== 'explode') return event;
    const end = events.slice(i + 1).find(e => e.type === 'projectileEnd');
    return { ...event, presentationOwner: event.presentationOwner ?? owners.get(end?.id) };
  });
  for (const e of events) if (e.type === 'projectileEnd') owners.delete(e.id);
  return out;
}
