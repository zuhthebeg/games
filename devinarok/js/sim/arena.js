export const ARENA = {
  id: 'trial-room-v1',
  width: 16,
  depth: 24,
  bounds: { minX: -8, maxX: 8, minZ: -12, maxZ: 12 },
  playerSpawn: { x: 0, z: 8 },
  spawnPoints: [
    { x: -5.8, z: -8.5 },
    { x: 0, z: -9.4 },
    { x: 5.8, z: -8.5 },
    { x: -6.2, z: 2.3 },
    { x: 6.2, z: 2.3 },
    { x: 0, z: -2.8 },
  ],
  obstacles: [
    { id: 'pillar-nw', type: 'circle', x: -4.6, z: -4.1, radius: 0.72 },
    { id: 'pillar-ne', type: 'circle', x: 4.6, z: -4.1, radius: 0.72 },
    { id: 'pillar-sw', type: 'circle', x: -4.6, z: 4.1, radius: 0.72 },
    { id: 'pillar-se', type: 'circle', x: 4.6, z: 4.1, radius: 0.72 },
    { id: 'crate-west', type: 'rect', x: -6.15, z: -0.8, width: 1.35, depth: 1.2 },
    { id: 'crate-east', type: 'rect', x: 6.15, z: -0.8, width: 1.35, depth: 1.2 },
    { id: 'barrel-south', type: 'circle', x: 0, z: 10.2, radius: 0.58 },
  ],
};
