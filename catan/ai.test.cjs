const test = require('node:test');
const assert = require('node:assert/strict');
const AI = require('./ai.js');

function baseState() {
  return {
    robber: 99,
    hexes: [
      { index: 0, type: 'grain', number: 6, vertices: [0, 1, 2] },
      { index: 1, type: 'ore', number: 8, vertices: [0, 3, 4] },
      { index: 2, type: 'brick', number: 3, vertices: [5, 6, 7] }
    ],
    vertices: [
      { index: 0, hexes: [0, 1], owner: null, building: null },
      { index: 1, hexes: [0], owner: null, building: null },
      { index: 2, hexes: [0], owner: null, building: null },
      { index: 3, hexes: [1], owner: null, building: null },
      { index: 4, hexes: [1], owner: null, building: null },
      { index: 5, hexes: [2], owner: null, building: null },
      { index: 6, hexes: [2], owner: null, building: null },
      { index: 7, hexes: [2], owner: null, building: null }
    ],
    edges: [
      { index: 0, a: 0, b: 1 },
      { index: 1, a: 0, b: 3 },
      { index: 2, a: 2, b: 5 }
    ],
    players: [
      { resources: { brick: 1, lumber: 1, wool: 1, grain: 2, ore: 3 } },
      { resources: { brick: 2, lumber: 2, wool: 0, grain: 0, ore: 0 } },
      { resources: { brick: 4, lumber: 0, wool: 0, grain: 0, ore: 0 } }
    ]
  };
}

test('pickBestVertex prefers high probability + mixed resources', () => {
  const s = baseState();
  const pick = AI.pickBestVertex(s, [1, 5, 0]);
  assert.equal(pick, 0);
});

test('pickBestRoadFromVertex extends toward stronger next spot', () => {
  const s = baseState();
  const pick = AI.pickBestRoadFromVertex(s, [0, 1], 0);
  assert.equal(pick, 1);
});

test('pickRobberTarget chooses productive enemy hex and victim', () => {
  const s = baseState();
  s.vertices[0].owner = 1;
  s.vertices[0].building = 'city';
  s.vertices[3].owner = 2;
  s.vertices[3].building = 'settlement';
  s.robber = 2;

  const res = AI.pickRobberTarget(s, 0);
  assert.equal(res.hexIndex, 1);
  assert.equal(res.victimIdx, 1);
});

test('chooseBuildAction follows city > settlement > road priority', () => {
  const s = baseState();
  let act = AI.chooseBuildAction(s, 0, {
    cityCount: 1,
    settlementCount: 3,
    roadCount: 4,
    costs: {
      city: { grain: 2, ore: 3 },
      settlement: { brick: 1, lumber: 1, wool: 1, grain: 1 },
      road: { brick: 1, lumber: 1 }
    }
  });
  assert.equal(act, 'city');

  s.players[0].resources.ore = 0;
  act = AI.chooseBuildAction(s, 0, {
    cityCount: 1,
    settlementCount: 3,
    roadCount: 4,
    costs: {
      city: { grain: 2, ore: 3 },
      settlement: { brick: 1, lumber: 1, wool: 1, grain: 1 },
      road: { brick: 1, lumber: 1 }
    }
  });
  assert.equal(act, 'settlement');
});

test('getTurnBudget scales by difficulty', () => {
  assert.equal(AI.getTurnBudget('easy', 6), 1);
  assert.equal(AI.getTurnBudget('normal', 6), 2);
  assert.equal(AI.getTurnBudget('hard', 9), 4);
});

test('shouldStopBuilding is more conservative on easy', () => {
  assert.equal(AI.shouldStopBuilding('easy', 0, 5), true);
  assert.equal(AI.shouldStopBuilding('normal', 0, 5), false);
  assert.equal(AI.shouldStopBuilding('hard', 1, 2), true);
});
