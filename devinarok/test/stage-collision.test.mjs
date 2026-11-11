import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { ALL_STAGE_LIST, HUB_ARENA, PROP_FOOTPRINTS } from '../js/content/stages.js';
import { createHubWorld, createStageWorld, step } from '../js/sim/world.js';

const PLAYER_RADIUS = 0.32;
const GRID_SIZE = 0.25;
const DOOR_INTERACTION_RANGE = 1.7;
const GRID_DIRECTIONS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

function overlapsObstacle(point, obstacle, radius = PLAYER_RADIUS) {
  if (obstacle.type === 'circle') {
    return Math.hypot(point.x - obstacle.x, point.z - obstacle.z) < radius + obstacle.radius;
  }
  const dx = Math.max(Math.abs(point.x - obstacle.x) - obstacle.width / 2, 0);
  const dz = Math.max(Math.abs(point.z - obstacle.z) - obstacle.depth / 2, 0);
  return dx * dx + dz * dz < radius * radius;
}

function roomObstacles(arena, room) {
  const passableDoors = new Set(
    arena.doors.filter((door) => door.fromRoom === room.id).map((door) => door.id),
  );
  return arena.obstacles.filter((obstacle) => (
    obstacle.roomId === room.id && !(obstacle.doorId && passableDoors.has(obstacle.doorId))
  ));
}

function gridReachability({ bounds, obstacles, room = null, start }) {
  const minX = Math.ceil((bounds.minX + PLAYER_RADIUS) / GRID_SIZE);
  const maxX = Math.floor((bounds.maxX - PLAYER_RADIUS) / GRID_SIZE);
  const minZ = Math.ceil(Math.max(bounds.minZ + PLAYER_RADIUS, room ? room.centerZ - 10.5 : -Infinity) / GRID_SIZE);
  const maxZ = Math.floor(Math.min(bounds.maxZ - PLAYER_RADIUS, room ? room.centerZ + 10.5 : Infinity) / GRID_SIZE);
  const isClear = (gridX, gridZ) => {
    if (gridX < minX || gridX > maxX || gridZ < minZ || gridZ > maxZ) return false;
    const point = { x: gridX * GRID_SIZE, z: gridZ * GRID_SIZE };
    return !obstacles.some((obstacle) => overlapsObstacle(point, obstacle));
  };
  const startX = Math.round(start.x / GRID_SIZE);
  const startZ = Math.round(start.z / GRID_SIZE);
  assert.ok(isClear(startX, startZ), `blocked BFS start at ${start.x},${start.z}`);

  const visited = new Set([`${startX},${startZ}`]);
  const queue = [[startX, startZ]];
  for (let head = 0; head < queue.length; head += 1) {
    const [x, z] = queue[head];
    for (const [dx, dz] of GRID_DIRECTIONS) {
      const nextX = x + dx;
      const nextZ = z + dz;
      const key = `${nextX},${nextZ}`;
      if (visited.has(key) || !isClear(nextX, nextZ)) continue;
      if (dx && dz && (!isClear(x + dx, z) || !isClear(x, z + dz))) continue;
      visited.add(key);
      queue.push([nextX, nextZ]);
    }
  }
  return {
    points: queue.map(([x, z]) => ({ x: x * GRID_SIZE, z: z * GRID_SIZE })),
    visited,
  };
}

function stageEntry(room, stage) {
  return room.index === 0
    ? stage.playerSpawn
    : { x: 0, z: room.centerZ + 7.75 };
}

function assertSpawnClear(point, obstacles, label) {
  const obstacle = obstacles.find((candidate) => overlapsObstacle(point, candidate));
  assert.equal(obstacle, undefined, `${label} overlaps ${obstacle?.id}`);
}

test('stage and hub props produce matching measured collision obstacles', () => {
  for (const arena of [...ALL_STAGE_LIST, HUB_ARENA]) {
    const collidableProps = arena.props.filter((prop) => (
      prop.solid !== false && PROP_FOOTPRINTS[prop.model]
    ));
    const obstaclesById = new Map(arena.obstacles.map((obstacle) => [obstacle.id, obstacle]));
    assert.equal(obstaclesById.size, arena.obstacles.length, `${arena.id} has unique obstacle IDs`);
    const collidableIds = new Set();
    for (const prop of collidableProps) {
      assert.ok(prop.id, `${arena.id} ${prop.model} has a prop ID`);
      assert.equal(prop.obstacleId, prop.id, `${arena.id} ${prop.model} links to its obstacle`);
      const obstacle = obstaclesById.get(prop.id);
      assert.ok(obstacle, `${arena.id} ${prop.id} has an obstacle`);
      assert.equal(obstacle.x, prop.x);
      assert.equal(obstacle.z, prop.z);
      collidableIds.add(prop.id);
    }
    for (const obstacle of arena.obstacles) {
      if (obstacle.doorId || /-front-wall-[lr]$/.test(obstacle.id)) continue;
      assert.ok(collidableIds.has(obstacle.id), `${arena.id} ${obstacle.id} has a solid prop`);
    }
  }

  const rotatedShelf = HUB_ARENA.props.find((prop) => prop.model === 'assets/env/shelf_large.glb');
  const shelfObstacle = HUB_ARENA.obstacles.find((obstacle) => obstacle.id === rotatedShelf.obstacleId);
  assert.deepEqual(
    { width: shelfObstacle.width, depth: shelfObstacle.depth },
    { width: 0.43, depth: 1.7 },
  );
});

test('every stage room and the hub keep spawns and NPCs clear of obstacles', () => {
  for (const stage of ALL_STAGE_LIST) {
    assertSpawnClear(stage.playerSpawn, stage.obstacles.filter((obstacle) => obstacle.roomId === stage.rooms[0].id), `${stage.id} player spawn`);
    for (const room of stage.rooms) {
      const obstacles = stage.obstacles.filter((obstacle) => obstacle.roomId === room.id);
      assertSpawnClear(stageEntry(room, stage), obstacles, `${stage.id} ${room.id} entry spawn`);
      for (const [index, point] of stage.spawnPoints[room.index].entries()) {
        assertSpawnClear(point, obstacles, `${stage.id} ${room.id} enemy${room.waves.some((wave) => wave.enemy === 'commander') ? '/boss' : ''} spawn ${index}`);
      }
    }
  }

  assertSpawnClear(HUB_ARENA.playerSpawn, HUB_ARENA.obstacles, 'hub player spawn');
  for (const npc of HUB_ARENA.npcs) assertSpawnClear(npc, HUB_ARENA.obstacles, `hub ${npc.id} NPC`);
});

test('each stage room reaches every enemy spawn and door on a 0.25 m grid', () => {
  for (const stage of ALL_STAGE_LIST) {
    for (const room of stage.rooms) {
      const reachable = gridReachability({
        bounds: stage.bounds,
        obstacles: roomObstacles(stage, room),
        room,
        start: stageEntry(room, stage),
      });
      const targets = [
        ...stage.spawnPoints[room.index].map((point, index) => ({
          ...point,
          label: `enemy spawn ${index}`,
        })),
        ...stage.doors
          .filter((door) => door.fromRoom === room.id)
          .map((door) => ({ ...door, label: `door ${door.id}` })),
      ];
      for (const target of targets) {
        if (target.fromRoom) {
          assert.ok(
            reachable.points.some((point) => Math.hypot(point.x - target.x, point.z - target.z) <= DOOR_INTERACTION_RANGE),
            `${stage.id} ${room.id} cannot reach ${target.label}`,
          );
          continue;
        }
        const key = `${Math.round(target.x / GRID_SIZE)},${Math.round(target.z / GRID_SIZE)}`;
        assert.ok(reachable.visited.has(key), `${stage.id} ${room.id} cannot reach ${target.label}`);
      }
    }
  }
});

test('every hub NPC has a reachable interaction cell on the 0.25 m grid', () => {
  const reachable = gridReachability({
    bounds: HUB_ARENA.bounds,
    obstacles: HUB_ARENA.obstacles,
    start: HUB_ARENA.playerSpawn,
  });
  for (const npc of HUB_ARENA.npcs) {
    const nearestCell = reachable.points.reduce((best, point) => (
      Math.hypot(point.x - npc.x, point.z - npc.z) < best.distance
        ? { point, distance: Math.hypot(point.x - npc.x, point.z - npc.z) }
        : best
    ), { point: null, distance: Infinity });
    assert.ok(nearestCell.distance <= GRID_SIZE / 2, `${npc.id} has no reachable interaction cell`);
  }
});

test('movement stops at the former ghost crates, stairs, and hub table', () => {
  const cases = [
    {
      world: createStageWorld({ seed: 901, stageId: 'C1' }),
      model: 'assets/env/crates_stacked.glb',
      roomId: 'c1-room-1',
      approach: -1,
    },
    {
      world: createStageWorld({ seed: 902, stageId: 'CB' }),
      model: 'assets/env/stairs_wide.glb',
      roomId: 'cb-room-1',
      approach: -1,
    },
    {
      world: createHubWorld({ seed: 903 }),
      model: 'assets/env/table_medium_decorated_A.glb',
      x: 7.5,
      z: -3.5,
      approach: 1,
    },
  ];

  for (const { world, model, roomId, x, z, approach } of cases) {
    if (world.mode === 'hub') {
      world.wave.initialized = true;
      world.wave.nextSpawnTick = Infinity;
    }
    const player = world.entities.find((entity) => entity.kind === 'player');
    const prop = world.arena.props.find((entry) => (
      entry.model === model
      && (roomId ? entry.roomId === roomId : entry.x === x && entry.z === z)
    ));
    const obstacle = world.arena.obstacles.find((entry) => entry.id === prop?.obstacleId);
    assert.ok(prop, `${model} is present in the test arena`);
    assert.ok(obstacle, `${model} has a generated obstacle`);

    const halfWidth = obstacle.type === 'circle' ? obstacle.radius : obstacle.width / 2;
    const edge = obstacle.x + approach * (halfWidth + player.radius);
    player.x = edge + approach * 0.4;
    player.z = obstacle.z;
    for (let seq = 1; seq <= 50; seq += 1) {
      step(world, {
        [player.playerId]: {
          seq,
          moveX: approach < 0 ? 127 : -127,
          moveZ: 0,
          aim: 0,
          buttons: 0,
        },
      });
    }
    assert.ok(Math.abs(player.x - edge) < 0.1, `${model} stopped at its collision edge`);
  }
});

test('boss charge stops at a prop and cannot hit through it', () => {
  const world = createStageWorld({ seed: 901, stageId: 'CB', playerId: 'hero', inputDriven: true });
  const boss = world.entities.find((entity) => entity.kind === 'enemy' && entity.boss);
  const player = world.entities.find((entity) => entity.kind === 'player');
  boss.x = 0;
  boss.z = 0;
  boss.spawnTicksLeft = 0;
  boss.invulnerable = false;
  boss.attackPhase = 'active';
  boss.attackPattern = 'charge';
  boss.attackRemaining = 9;
  boss.attackCooldownTicks = 0;
  boss.chargeAngle = 0;
  boss.lineTravelled = 0;
  boss.attackShape = { type: 'line', originX: 0, originZ: 0, angle: 0, length: 9, width: 1.6 };
  player.x = 4;
  player.z = 0;
  world.arena.obstacles.push({ id: 'test-charge-wall', type: 'rect', x: 2, z: 0, width: 0.5, depth: 4 });

  step(world, {});
  step(world, {});

  assert.equal(boss.x, 1);
  assert.equal(boss.lineTravelled, 1);
  assert.equal(boss.attackPhase, null);
  assert.equal(boss.recoverTicks, 18);
  assert.equal(
    world.events.some((event) => event.type === 'hit' && event.sourceId === boss.id && event.targetId === player.id),
    false,
  );
});

test('the inn board and CB clear explain forest-region progression', async () => {
  const main = await readFile(new URL('../js/main.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../css/game.css', import.meta.url), 'utf8');
  assert.match(main, /기사 전당 클리어 후 열려요/);
  assert.match(main, /1지역 · 무너진 지하묘지/);
  assert.match(main, /2지역 · 잿빛 숲/);
  assert.match(main, /const action = cleared \? '재도전' : unlocked \? '출정' : '잠김';/);
  assert.match(main, /class="hub-stage-name"/);
  assert.match(main, /selectableStages\.filter\(\(entry\) => isHost \? stageIsUnlocked\(entry\.id, difficulty\) : entry\.id === stage\)/);
  assert.match(main, /const selectableStages = difficulty === 'normal' \? \[\.\.\.STAGE_LIST, \.\.\.RIFT_STAGE_LIST\] : STAGE_LIST;/);
  assert.match(main, /data-board-tab="rift"/);
  assert.match(main, /해골 왕의 옥좌를 쓰러뜨리면 열려요/);
  assert.match(main, /const challengeReward = riftFirstClearReward\(challengeFloor\);/);
  assert.match(main, /riftFirstClearReward\(riftFloorOf\(stage\.id\)\)/);
  assert.match(main, /riftFloor !== null && !character\.clearedStages\.includes\(key\)/);
  assert.match(main, /const firstRiftClearMarkup = outcome === 'clear' && firstRiftClear/);
  assert.ok(main.includes('<p class="rift-first-clear">첫 돌파 보상 · 정수'));
  assert.ok(main.includes('firstRiftClear.soul > 0'));
  assert.match(main, /bestFloor >= RIFT_MAX_FLOOR/);
  assert.ok(main.includes('<div class="rift-next-floor is-complete"><strong>심연 균열 정복 완료</strong><small>30층을 모두 돌파했어요 · 아래에서 다시 도전할 수 있어요</small></div>'));
  assert.match(css, /\.hub-row button \{ flex: 0 0 88px;/);
  assert.match(css, /\.hub-stage-name \{[^}]*white-space: nowrap;/);
  assert.match(main, /firstForestUnlock = difficulty === 'normal' && stageId === 'CB'/);
  assert.match(main, /outcome === 'clear' && firstForestUnlock/);
  assert.match(main, /2지역 · 잿빛 숲이 열렸어요/);
  assert.match(main, /3지역 · 해골 왕의 성채가 열렸어요/);
  assert.match(main, /모든 지역을 정복했어요/);
  assert.doesNotMatch(main, /3지역은 준비 중/);
  assert.doesNotMatch(main, /2지역 · 준비 중/);
  assert.match(main, /function updateBossIntro\(stageId\)/);
  assert.match(main, /boss-intro-region/);
  assert.match(main, /boss-intro-name/);
});
