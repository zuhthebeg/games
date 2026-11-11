import test from 'node:test';
import assert from 'node:assert/strict';
import { canUseSkill, skillDamageShare } from '../js/content/combat.js';
import { lineageAllowsWeapon, normalizedWeaponForm } from '../js/content/player-lineages.js';
import { ITEMS } from '../js/meta/items.js';
import { BOOKS } from '../js/meta/skills.js';
import { weaponWarnHtml, skillWeaponNames } from '../js/ui/skill-view.js';

const saveFor = (lineage, evolved, id = 'short_bow') => ({
  lineage, level: evolved ? 30 : 20, permanentDeathKnight: evolved,
  items: [{ uid: 'held', id }], equipped: { weapon: 'held' },
});
const allowedText = (id, save) => weaponWarnHtml(id, save).match(/<dt>사용 가능 무기<\/dt><dd>([^<]*)<\/dd>/)[1];
const names = { sword: '검', blunt: '둔기', bow: '활', wand: '지팡이', staff: '지팡이' };
// Parse displayed labels independently; never derive expected labels from the UI helper.
function displayedShare(text, def) {
  const name = names[normalizedWeaponForm(def)];
  for (const entry of text.split(' · ')) {
    const match = entry.match(/^(?:(한손|양손) )?(검|둔기|활|지팡이) (\d+)%$/);
    if (match && match[2] === name && (!match[1] || def.handedness === (match[1] === '양손' ? 2 : 1))) return Number(match[3]) / 100;
  }
  return undefined;
}

test('skeleton holding a bow: dead explosion lists sword and blunt, not focus', () => {
  const s = saveFor('skeleton_knight', false);
  assert.equal(allowedText('dead_explosion', s), '검 100% · 둔기 100%');
  assert.equal(skillWeaponNames('dead_explosion', s), '검 · 둔기');
});

test('sword wave removes lineage-forbidden swords', () => {
  for (const lineage of ['skeleton_mage', 'skeleton_archer']) {
    assert.equal(allowedText('sword_wave', saveFor(lineage, false)), '');
    assert.equal(skillWeaponNames('sword_wave', saveFor(lineage, false)), '');
  }
});

for (const lineage of ['human', 'skeleton_knight', 'skeleton_mage', 'skeleton_archer']) {
  for (const evolved of [false, true]) test('warning forms and shares agree with combat: ' + lineage + '/' + evolved, () => {
    const representatives = Object.entries(ITEMS).filter(([, def]) => def.kind === 'weapon');
    const unique = new Map(representatives.map(([id, def]) => [normalizedWeaponForm(def) + '/' + def.handedness, [id, def]]));
    assert.ok(unique.size >= 7, 'five forms plus one/two-handed melee');
    for (const [held] of unique.values()) {
      const save = saveFor(lineage, evolved, held);
      for (const id of Object.keys(BOOKS)) {
        const text = allowedText(id, save);
        for (const [, def] of unique.values()) {
          const allowed = lineageAllowsWeapon(save, def) && canUseSkill(id, def.family, normalizedWeaponForm(def), lineage, def.handedness);
          const expected = allowed ? skillDamageShare(id, def.family, normalizedWeaponForm(def), lineage, def.handedness) : undefined;
          assert.equal(displayedShare(text, def), expected, [lineage, evolved, held, id, normalizedWeaponForm(def), def.handedness, text].join('/'));
        }
      }
    }
  });
}

test('cross-school percentages and legacy focus/blunt/shield labels remain', () => {
  const save = saveFor('human', false);
  assert.match(allowedText('lunge', save), /지팡이 35%/);
  assert.match(allowedText('ember_bolt', save), /검 60%/);
  assert.match(allowedText('ember_bolt', save), /활 60%/);
  assert.match(allowedText('ground_slam', save), /둔기 100%/);
  assert.match(allowedText('meteor', save), /지팡이 100%/);
  assert.doesNotMatch(allowedText('meteor', save), /검 60%|활 60%/);
  assert.match(allowedText('protective_shield', save), /100%/);
});
