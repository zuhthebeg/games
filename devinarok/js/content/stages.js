const FLOOR_MODELS = {
  stone: 'assets/env/floor_tile_large.glb',
  broken: 'assets/env/floor_tile_large_rocks.glb',
};

function floorForRoom(room, width, depth) {
  const props = [];
  const columns = Math.ceil(width / 4);
  const rows = Math.ceil(depth / 4);
  for (let column = 0; column < columns; column += 1) {
    for (let row = 0; row < rows; row += 1) {
      const x = -width / 2 + 2 + column * 4;
      const z = room.centerZ - depth / 2 + 2 + row * 4;
      const broken = room.theme === 'ossuary'
        ? (column + row) % 2 === 0
        : room.theme === 'collapsed'
          ? (column * 3 + row) % 4 === 0
          : room.theme === 'corridor'
            ? column % 3 === 1
            : (column + row * 2) % 7 === 0;
      props.push({
        model: broken ? FLOOR_MODELS.broken : FLOOR_MODELS.stone,
        x,
        z,
        rotY: ((column + row) % 4) * Math.PI / 2,
        roomId: room.id,
      });
    }
  }
  return props;
}

function wallRow(room, xPositions, z, hasDoor, doors, obstacles, props) {
  for (const x of xPositions) {
    if (hasDoor && Math.abs(x) < 1) {
      props.push({ model: 'assets/env/wall_doorway.glb', x, z, rotY: 0, roomId: room.id });
      const door = {
        id: `${room.id}-door`,
        fromRoom: room.id,
        toRoom: room.nextRoomId,
        x,
        z,
        open: false,
      };
      doors.push(door);
      obstacles.push({ id: `${door.id}-gate`, type: 'rect', x, z, width: 2.6, depth: 0.55, doorId: door.id });
      props.push({ model: 'assets/env/wall.glb', x, z, rotY: 0, doorId: door.id, obstacleId: `${door.id}-gate`, roomId: room.id });
    } else {
      props.push({ model: 'assets/env/wall.glb', x, z, rotY: 0, roomId: room.id });
    }
  }
}

function buildRoomArt(room, { width, depth, lastRoom }) {
  const props = floorForRoom(room, width, depth);
  const obstacles = [];
  const doors = [];
  const xWalls = [];
  for (let x = -width / 2 + 2; x <= width / 2 - 2; x += 4) xWalls.push(x);
  xWalls.push(0);
  xWalls.sort((left, right) => left - right);

  for (let z = room.centerZ - depth / 2 + 2; z <= room.centerZ + depth / 2 - 2; z += 2) {
    props.push({ model: 'assets/env/wall_half.glb', x: -width / 2 - 0.5, z: z + 1, rotY: Math.PI / 2, wallSide: true, roomId: room.id });
    props.push({ model: 'assets/env/wall_half.glb', x: width / 2 + 0.5, z: z - 1, rotY: -Math.PI / 2, wallSide: true, roomId: room.id });
  }

  wallRow(room, xWalls, room.centerZ - depth / 2 - 0.5, !lastRoom && Boolean(room.nextRoomId), doors, obstacles, props);

  const columns = [
    [-width / 2 + 4.8, room.centerZ - depth / 2 + 5],
    [width / 2 - 4.8, room.centerZ - depth / 2 + 5],
    [-width / 2 + 4.8, room.centerZ + depth / 2 - 5],
    [width / 2 - 4.8, room.centerZ + depth / 2 - 5],
  ];
  columns.forEach(([x, z], index) => {
    const id = `${room.id}-pillar-${index}`;
    obstacles.push({ id, type: 'circle', x, z, radius: 0.72 });
    props.push({ model: 'assets/env/pillar.glb', x, z, rotY: 0, obstacleId: id, roomId: room.id });
  });

  const crates = room.theme === 'collapsed' || room.theme === 'ossuary';
  if (crates) {
    const x = room.index % 2 ? 3.6 : -3.6;
    const z = room.centerZ + 0.5;
    const id = `${room.id}-crates`;
    obstacles.push({ id, type: 'rect', x, z, width: 1.35, depth: 1.2 });
    props.push({ model: 'assets/env/crates_stacked.glb', x, z, rotY: room.index % 2 ? 0 : Math.PI, obstacleId: id, roomId: room.id });
  } else {
    const x = room.index % 2 ? -3.5 : 3.5;
    const z = room.centerZ + 1;
    const id = `${room.id}-barrel`;
    obstacles.push({ id, type: 'circle', x, z, radius: 0.58 });
    props.push({ model: 'assets/env/barrel_large.glb', x, z, rotY: 0, obstacleId: id, roomId: room.id });
  }

  const lantern = room.theme === 'ossuary' ? 'assets/env/candle_lit.glb' : 'assets/env/torch_lit.glb';
  for (const x of [-width / 2 + 1.4, width / 2 - 1.4]) {
    for (const z of [room.centerZ - depth / 2 + 1.8, room.centerZ + depth / 2 - 1.8]) {
      props.push({ model: lantern, x, z, rotY: x < 0 ? 0 : Math.PI, roomId: room.id });
    }
  }
  props.push({
    model: 'assets/env/banner_red.glb',
    x: 0,
    z: room.centerZ - depth / 2 + 0.8,
    rotY: Math.PI,
    roomId: room.id,
  });
  if (room.theme === 'corridor') {
    props.push({ model: 'assets/env/banner_red.glb', x: -5.8, z: room.centerZ - depth / 2 + 1, rotY: Math.PI / 2, roomId: room.id });
    props.push({ model: 'assets/env/banner_red.glb', x: 5.8, z: room.centerZ - depth / 2 + 1, rotY: -Math.PI / 2, roomId: room.id });
  }

  return { props, obstacles, doors };
}

function makeStage(id, name, stageLevel, recommendedLevel, rooms, { boss = false } = {}) {
  const width = boss ? 20 : 16;
  const depth = 20;
  const roomGap = depth;
  const arranged = rooms.map((room, index) => ({
    ...room,
    id: `${id.toLowerCase()}-room-${index + 1}`,
    index,
    centerZ: -index * roomGap,
    nextRoomId: rooms[index + 1] ? `${id.toLowerCase()}-room-${index + 2}` : null,
  }));
  const props = [];
  const obstacles = [];
  const doors = [];
  for (const [index, room] of arranged.entries()) {
    const art = buildRoomArt(room, { width, depth, lastRoom: index === arranged.length - 1 });
    props.push(...art.props);
    obstacles.push(...art.obstacles);
    doors.push(...art.doors);
  }
  const xMin = -width / 2;
  const xMax = width / 2;
  const minZ = arranged.at(-1).centerZ - depth / 2;
  const maxZ = depth / 2;
  const spawnPoints = arranged.map((room) => [
    { x: -width / 2 + 3, z: room.centerZ - 5 },
    { x: 0, z: room.centerZ - 7 },
    { x: width / 2 - 3, z: room.centerZ - 5 },
    { x: -width / 2 + 3, z: room.centerZ + 5 },
    { x: width / 2 - 3, z: room.centerZ + 5 },
  ]);
  return {
    id,
    name,
    stageLevel,
    recommendedLevel,
    boss,
    width,
    depth: arranged.length * depth,
    bounds: { minX: xMin, maxX: xMax, minZ, maxZ },
    playerSpawn: { x: 0, z: 7 },
    spawnPoints,
    rooms: arranged,
    doors,
    obstacles,
    props,
  };
}

export const STAGE_LIST = [
  makeStage('C1', '묘지 입구', 1, 1, [
    { theme: 'stone', waves: [{ enemy: 'minion', count: 6 }] },
    { theme: 'collapsed', waves: [{ enemy: 'minion', count: 5 }, { enemy: 'warrior', count: 2 }] },
  ]),
  makeStage('C2', '무너진 회랑', 3, 3, [
    { theme: 'corridor', waves: [{ enemy: 'minion', count: 5 }, { enemy: 'rogue', count: 2 }] },
    { theme: 'collapsed', waves: [{ enemy: 'minion', count: 4 }, { enemy: 'rogue', count: 3 }] },
    { theme: 'corridor', waves: [{ enemy: 'minion', count: 4 }, { enemy: 'mage', count: 2 }] },
  ]),
  makeStage('C3', '납골당', 5, 5, [
    { theme: 'ossuary', waves: [{ enemy: 'minion', count: 4 }, { enemy: 'rogue', count: 2 }] },
    { theme: 'collapsed', waves: [{ enemy: 'warrior', count: 3 }, { enemy: 'mage', count: 2 }] },
    { theme: 'ossuary', waves: [{ enemy: 'minion', count: 3 }, { enemy: 'rogue', count: 2 }, { enemy: 'warrior', count: 1 }, { enemy: 'mage', count: 1 }] },
  ]),
  makeStage('CB', '기사단장의 전당', 7, 7, [
    { theme: 'ossuary', waves: [{ enemy: 'commander', count: 1 }] },
  ], { boss: true }),
];

export const STAGES = Object.fromEntries(STAGE_LIST.map((stage) => [stage.id, stage]));

const hubProps = [];
for (let x = -8; x <= 8; x += 4) {
  for (let z = -8; z <= 8; z += 4) {
    hubProps.push({ model: (x === 0 && z % 8 === 0) ? FLOOR_MODELS.broken : FLOOR_MODELS.stone, x, z, rotY: 0 });
  }
}
hubProps.push(
  { model: 'assets/env/wall.glb', x: -6, z: -10.5, rotY: 0 },
  { model: 'assets/env/wall.glb', x: -2, z: -10.5, rotY: 0 },
  { model: 'assets/env/wall.glb', x: 2, z: -10.5, rotY: 0 },
  { model: 'assets/env/wall.glb', x: 6, z: -10.5, rotY: 0 },
  { model: 'assets/env/wall_half.glb', x: -10.5, z: -7, rotY: Math.PI / 2, wallSide: true },
  { model: 'assets/env/wall_half.glb', x: 10.5, z: -7, rotY: -Math.PI / 2, wallSide: true },
  { model: 'assets/env/banner_red.glb', x: 0, z: -9.5, rotY: Math.PI },
  { model: 'assets/env/torch_lit.glb', x: -8.8, z: -8.8, rotY: 0 },
  { model: 'assets/env/torch_lit.glb', x: 8.8, z: -8.8, rotY: 0 },
  { model: 'assets/env/candle_lit.glb', x: -8, z: 8, rotY: 0 },
  { model: 'assets/env/candle_lit.glb', x: 8, z: 8, rotY: 0 },
  { model: 'assets/env/crates_stacked.glb', x: -5, z: -1, rotY: 0, obstacleId: 'hub-crates' },
  { model: 'assets/env/barrel_large.glb', x: 5, z: 1, rotY: 0, obstacleId: 'hub-barrel' },
  { model: 'assets/env/pillar.glb', x: -5, z: -6, rotY: 0, obstacleId: 'hub-pillar-left' },
  { model: 'assets/env/pillar.glb', x: 5, z: -6, rotY: 0, obstacleId: 'hub-pillar-right' },
);

export const HUB_ARENA = {
  id: 'inn-hub',
  width: 20,
  depth: 20,
  bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
  playerSpawn: { x: 0, z: 3 },
  spawnPoints: [],
  rooms: [],
  doors: [],
  obstacles: [
    { id: 'hub-crates', type: 'rect', x: -5, z: -1, width: 1.6, depth: 1.2 },
    { id: 'hub-barrel', type: 'circle', x: 5, z: 1, radius: 0.65 },
    { id: 'hub-pillar-left', type: 'circle', x: -5, z: -6, radius: 0.72 },
    { id: 'hub-pillar-right', type: 'circle', x: 5, z: -6, radius: 0.72 },
  ],
  props: hubProps,
};
