import assert from 'node:assert/strict';
import test from 'node:test';
import { STAGE_LIST } from '../js/content/stages.js';
import { createStageWorld, step } from '../js/sim/world.js';

function prepareRoom(stage, roomIndex) {
  const world = createStageWorld({
    seed: 31907,
    stageId: stage.id,
    playerId: 'hero',
    character: { level: 20 },
  });
  world.entities = world.entities.filter((entity) => entity.kind !== 'enemy');
  world.roomIndex = roomIndex;
  world.roomEnemyIds = [];
  world.roomCleared = true;
  const player = world.entities.find((entity) => entity.kind === 'player');
  return { world, player, room: world.arena.rooms[roomIndex] };
}

test('front wall segments stop players beside every stage doorway', () => {
  const xPositions = [-6, -4, -2.5, 2.5, 4, 6];
  let checkedWalls = 0;
  for (const stage of STAGE_LIST) {
    for (const room of stage.rooms.slice(0, -1)) {
      const wallZ = room.centerZ - stage.depth / stage.rooms.length / 2 - 0.5;
      for (const x of xPositions) {
        const { world, player } = prepareRoom(stage, room.index);
        player.x = x;
        player.z = wallZ + 1.5;
        for (let seq = 1; seq <= 120; seq += 1) {
          step(world, {
            hero: { seq, moveX: 0, moveZ: -127, buttons: 0 },
          });
        }
        assert.ok(
          player.z >= wallZ,
          `${stage.id} ${room.id} x=${x} crossed front wall at z=${wallZ}: ${player.z}`,
        );
        checkedWalls += 1;
      }
    }
  }
  assert.ok(checkedWalls > 0);
});

test('an opened doorway remains passable through its gate gap', () => {
  for (const stage of STAGE_LIST) {
    for (const room of stage.rooms.slice(0, -1)) {
      const { world, player } = prepareRoom(stage, room.index);
      const door = world.arena.doors.find((entry) => entry.fromRoom === room.id);
      assert.ok(door, `${stage.id} ${room.id} has a door to its next room`);
      const wallZ = room.centerZ - world.arena.depth / stage.rooms.length / 2 - 0.5;
      world.openDoors[door.id] = true;
      player.x = door.x;
      player.z = wallZ + 1.5;
      for (let seq = 1; seq <= 120 && player.z >= wallZ - 0.5; seq += 1) {
        step(world, {
          hero: { seq, moveX: 0, moveZ: -127, buttons: 0 },
        });
      }
      assert.ok(
        player.z < wallZ - 0.5,
        `${stage.id} ${room.id} could not pass through opened door ${door.id}`,
      );
    }
  }
});
