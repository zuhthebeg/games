export function hitReactionOffset(elapsedMs, directionX, directionZ, distance = 0.12) {
  if (elapsedMs < 0 || elapsedMs >= 180) return { x: 0, z: 0 };
  const length = Math.hypot(directionX, directionZ) || 1;
  const progress = Math.min(1, elapsedMs / 60);
  const eased = elapsedMs <= 60
    ? 1 - (1 - progress) ** 2
    : (1 - Math.min(1, (elapsedMs - 60) / 120)) ** 2;
  const amount = distance * eased;
  return {
    x: directionX / length * amount,
    z: directionZ / length * amount,
  };
}
