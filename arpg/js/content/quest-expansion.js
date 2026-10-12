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
