export const SKILL_ICON_CELLS = Object.freeze({
  spin: 0,
  dash: 1,
  guard: 2,
  quake: 3,
  deadBurst: 4,
  pierce: 5,
  vault: 6,
  volley: 7,
  poisonArrow: 8,
  rain: 9,
  flame: 10,
  frost: 11,
  cursedHands: 12,
  blink: 13,
  meteor: 14,
  'basic:sword': 15,
  'basic:crossbow': 16,
  'basic:staff': 17,
});

export function skillIconPosition(skillKey) {
  const cell = SKILL_ICON_CELLS[skillKey];
  if (!Number.isInteger(cell)) return null;
  const column = cell % 8;
  const row = Math.floor(cell / 8);
  return `${(column / 7) * 100}% ${(row / 2) * 100}%`;
}
