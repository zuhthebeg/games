import { RITUAL_POINTS } from './state.js';

const chiao = RITUAL_POINTS.find((ritual) => ritual.id === 'chiao');
const incense = RITUAL_POINTS.find((ritual) => ritual.id === 'incense');
const burn = RITUAL_POINTS.find((ritual) => ritual.id === 'burn');

export const SANCTUARY_ARENA = {
  id: 'sanctuary',
  name: '법당',
  theme: 'sanctuary',
  width: 14,
  depth: 10,
  bounds: { minX: -7, maxX: 7, minZ: -5, maxZ: 5 },
  playerSpawn: { x: 0, z: 3.85 },
  spawnPoints: [],
  rooms: [{ id: 'sanctuary-hall', width: 14, centerZ: 0 }],
  doors: [],
  obstacles: [
    { type: 'rect', x: 0, z: -2.15, width: 2.2, depth: 0.9 },
    { type: 'rect', x: 0, z: -4.4, width: 1.3, depth: 0.62 },
    { type: 'circle', x: incense.target.x, z: incense.target.z, radius: 0.38 },
    { type: 'rect', x: burn.target.x, z: burn.target.z, width: 1.1, depth: 0.9 },
    ...[-5.7, 5.7].flatMap((x) => [-3.2, 0, 3.2].map((z) => (
      { type: 'circle', x, z, radius: 0.34 }
    ))),
  ],
  props: [
    { id: 'altar-table', procedural: 'altar', x: 0, z: -2.15, ritualId: chiao.id },
    { id: 'statue-niche', procedural: 'statue', x: 0, z: -4.55 },
    { id: 'incense-burner', procedural: 'incense-burner', x: incense.target.x, z: incense.target.z },
    { id: 'gold-paper-furnace', procedural: 'furnace', x: burn.target.x, z: burn.target.z },
  ],
  npcs: [],
};
