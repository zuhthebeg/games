export const OUTLINE_STYLES = Object.freeze({
  enemy: { color: 0xd9412e, widthPx: 2.5 },
  bounty: { color: 0xffcf4a, widthPx: 3.5 },
});

export function outlineKindFor(entity, world, targetId = null) {
  if (!entity || entity.dead || entity.state === 'dead' || entity.kind === 'loot') return null;
  if (entity.kind !== 'enemy') return null;
  const objective = world?.objective;
  const isHuntTarget = objective?.type === 'hunt'
    && objective.state === 'active'
    && objective.targetId === entity.id;
  if (entity.bounty || isHuntTarget) return 'bounty';
  return entity.id === targetId ? 'enemy' : null;
}

export const ENEMY_SILHOUETTES = Object.freeze({
  minion: [0.88, 0.86, 0.88],
  rogue: [0.9, 1.06, 0.9],
  bonearcher: [0.92, 1.04, 0.92],
  mage: [0.94, 1.14, 0.94],
  ashcaller: [1.1, 1.08, 1.1],
  brute: [1.15, 1.0, 1.15],
  shieldbearer: [1.14, 0.94, 1.14],
});

export function silhouetteScale(entity) {
  const base = entity.modelScale ?? 0.95;
  const multipliers = entity.kind === 'enemy' && !entity.boss
    ? ENEMY_SILHOUETTES[entity.enemyKind]
    : null;
  return multipliers ? multipliers.map((multiplier) => base * multiplier) : [base, base, base];
}

export function smoothOutlineNormals(positions, normals) {
  const output = new Float32Array(normals);
  const vertexCount = Math.min(Math.floor(positions.length / 3), Math.floor(normals.length / 3));
  const groups = new Map();

  for (let index = 0; index < vertexCount; index += 1) {
    const offset = index * 3;
    const key = [
      Math.round(positions[offset] * 1e4),
      Math.round(positions[offset + 1] * 1e4),
      Math.round(positions[offset + 2] * 1e4),
    ].join(',');
    let group = groups.get(key);
    if (!group) {
      group = { indices: [], x: 0, y: 0, z: 0 };
      groups.set(key, group);
    }
    group.indices.push(index);
    group.x += normals[offset];
    group.y += normals[offset + 1];
    group.z += normals[offset + 2];
  }

  for (const group of groups.values()) {
    if (group.indices.length < 2) continue;
    const length = Math.hypot(group.x, group.y, group.z);
    if (length <= 1e-12) continue;
    const normal = [group.x / length, group.y / length, group.z / length];
    for (const index of group.indices) output.set(normal, index * 3);
  }

  return output;
}
