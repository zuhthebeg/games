import { ENEMIES } from '../content/enemies.js';
import { attackShapeHit } from '../sim/world.js';

const MAX_PREDICTED_HIT_KEYS = 512;

function rememberBounded(set, key) {
  set.add(key);
  while (set.size > MAX_PREDICTED_HIT_KEYS) set.delete(set.values().next().value);
}

export function motionStrikes(motion) {
  return [
    ...(motion?.skillStrikes?.length
      ? motion.skillStrikes
      : motion?.skillStrike ? [motion.skillStrike] : []),
    motion?.counterStrike,
    motion?.attackStrike,
  ].filter(Boolean);
}

export function predictStrikeHits(motion, viewEntities, { activeEnemyIds = null, hitKeys }) {
  const activeIds = activeEnemyIds === null ? null : new Set(activeEnemyIds);
  const hits = [];
  for (const strike of motionStrikes(motion)) {
    if (!strike.castId || !strike.shape) continue;
    let candidates = (viewEntities ?? []).filter((entity) => (
      entity.kind === 'enemy'
      && !entity.dead
      && entity.state !== 'dead'
      && !entity.invulnerable
      && (entity.spawnTicksLeft ?? 0) <= 0
      && (!activeIds || activeIds.has(entity.id))
      && attackShapeHit(
        strike.shape,
        entity,
        Number.isFinite(entity.radius) ? entity.radius : ENEMIES[entity.enemyKind]?.radius ?? 0,
      )
    ));
    if (Number.isFinite(strike.maxTargets) && strike.shape.type === 'line') {
      candidates.sort((a, b) => {
        const project = (entity) => (
          (entity.x - strike.shape.originX) * Math.cos(strike.shape.angle)
          + (entity.z - strike.shape.originZ) * Math.sin(strike.shape.angle)
        );
        return project(a) - project(b) || a.id - b.id;
      });
    }
    let hitCount = 0;
    for (const target of candidates) {
      const key = `${strike.castId}|${target.id}`;
      if (hitKeys.has(key)) continue;
      rememberBounded(hitKeys, key);
      hits.push({
        castId: strike.castId,
        targetId: target.id,
        skill: strike.skillId ?? 0,
      });
      hitCount += 1;
      if (hitCount >= strike.maxTargets) break;
    }
  }
  return hits;
}
