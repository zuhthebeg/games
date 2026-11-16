export function emitHitSparks(vfx, target, critical, extrasOnly = false) {
  if (!target || target.kind !== 'enemy') return false;
  const y = Math.max(0.65, (target.height ?? 1.7) * 0.68);
  vfx?.burst({
    preset: 'spark',
    count: extrasOnly ? 4 : critical ? 12 : 6,
    x: target.x,
    y,
    z: target.z,
    spreadRadius: extrasOnly ? 0.16 : 0.12,
    speed: critical ? [1.2, 4] : [0.65, 2.6],
    upward: critical ? [0.8, 3.4] : [0.4, 2],
    colors: critical ? [0xffa13c, 0xffdb7a, 0xfff2c4] : [0xfff1cb, 0xffd987],
    startSize: critical ? 0.32 : 0.22,
    sizeScale: 1.4,
    lifeMs: critical ? [380, 680] : [300, 520],
  });
  if (critical) {
    vfx?.emit('star', target.x, y, target.z, {
      cell: 'flare_01',
      color: 0xffbd62,
      startSize: 0.9,
      endSize: 0.1,
      lifeMs: 180,
      alpha: 0.9,
    });
  }
  return true;
}

export function emitPredictedHitSparks(vfx, event, world) {
  if (event?.type !== 'predictedHit') return null;
  const target = world?.entities.find((entity) => entity.id === event.targetId);
  if (!target) return null;
  emitHitSparks(vfx, target, false);
  return target;
}

export function emitCriticalConfirmationSparks(vfx, event, target) {
  if (!event?.predictedLocally || !event.critical) return false;
  return emitHitSparks(vfx, target, true, true);
}
