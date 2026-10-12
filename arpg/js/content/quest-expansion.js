// Side contracts layered on the W2 map. Main S1~S20 progression and stage data stay untouched.
// QF1 only observes existing wolf kills; it spawns nothing and pays no gold or gear.
export const SIDE_QUESTS = Object.freeze({
  QF1: Object.freeze({
    id: 'QF1', name: '사냥꾼의 가죽 보급', kind: 'collect',
    item: 'hide', monster: 'wolf', maps: Object.freeze(['S5', 'S11', 'S16']),
    target: 150, offer: 'S5', regions: Object.freeze(['forest', 'swamp']),
    // A full S5 clear banks ~56 hides (28 wolves x2), so 150 is about three sorties.
    // One-time contract fee in XP only (2x S5 first clear); no repeat, no gold/gear.
    rewardXp: 680,
  }),
});
export const SIDE_QUEST_STATES = Object.freeze(['active', 'done']);

// Independent map adapter: distinct quest/map IDs, explicit S12 reward/size anchor.
export const OBJECTIVE_QUESTS = Object.freeze({
  QM1: Object.freeze({ id: 'QM1', mapId: 'M_MINE_CART', name: '광산 장부 회수', mapName: '수레 적재장',
    regionId: 'mine', requires: ['S10'], anchor: 'S12', firstXp: 910, rec: 11, huntTier: 3,
    objective: Object.freeze({ kind: 'carry-return', questId: 'QM1', token: [.78,.30], entry: [.18,.5], radius: 64, dwellMs: 500 }),
    spawns: Object.freeze([{monster:'iron_boar',at:0,fx:.56,fy:.50},
      {monster:'goblin_slinger',at:0,fx:.80,fy:.72}, {monster:'goblin_grunt',at:2000,fx:.68,fy:.28}]),
  }),
  QS1: Object.freeze({ id: 'QS1', mapId: 'M_MARSH_MARKERS', name: '안개 속 길 표식', mapName: '늪 우회길',
    regionId: 'swamp', requires: ['S11'], anchor: 'S13', firstXp: 510, rec: 12, huntTier: 3,
    objective: Object.freeze({ kind: 'visit-markers', questId: 'QS1', entry: [.18,.5],
      markers: [[.40,.25],[.52,.75],[.78,.5]], radius: 64, dwellMs: 500 }),
    spawns: Object.freeze([{monster:'poison_spider',at:0,fx:.62,fy:.70},
      {monster:'spirit',at:0,fx:.74,fy:.28}, {monster:'wolf',at:0,fx:.42,fy:.42}]),
  }),
});
