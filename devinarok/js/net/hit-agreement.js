export function scoreCastHitAgreement({
  clientWouldHit = [],
  serverHitSet = [],
  serverStrikeTicks = [],
  enemyDeathEvents = [],
} = {}) {
  const clientHits = new Set(clientWouldHit);
  const serverHits = new Set(serverHitSet);
  const lastServerStrikeTick = serverStrikeTicks.reduce(
    (last, strike) => Number.isFinite(strike?.tick) ? Math.max(last, strike.tick) : last,
    -Infinity,
  );
  const deathTicks = new Map();
  for (const event of enemyDeathEvents) {
    if (!Number.isFinite(event?.tick)) continue;
    deathTicks.set(
      event.entityId,
      Math.min(deathTicks.get(event.entityId) ?? Infinity, event.tick),
    );
  }
  const rawDisagreementTargets = [...new Set([...clientHits, ...serverHits])]
    .filter((id) => clientHits.has(id) !== serverHits.has(id));
  const excusedTargets = [...clientHits].filter((id) => (
    !serverHits.has(id) &&
    deathTicks.has(id) &&
    deathTicks.get(id) <= lastServerStrikeTick
  ));
  const excused = new Set(excusedTargets);
  const disagreementTargets = rawDisagreementTargets.filter((id) => !excused.has(id));

  return {
    lastServerStrikeTick: Number.isFinite(lastServerStrikeTick) ? lastServerStrikeTick : null,
    rawDisagreementTargets,
    excusedTargets,
    disagreementTargets,
    exactMatch: disagreementTargets.length === 0,
  };
}
