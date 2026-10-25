import {isBossType} from '../js/content/boss-tuning.js';
import { BALANCE } from '../js/content/balance.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { validateContent } from '../tools/validate-content.mjs';
import { ABILITIES, MONSTERS, STAGES } from '../js/content/combat.js';
import { DANGER_COLORS, MONSTER_PALETTES, MONSTER_VARIANTS } from '../js/content/monsters.js';
import { NEW_MONSTER_DROPS } from '../js/content/loot.js';
import { ITEMS, RECIPES, CONSUMABLES, craft, equip, dismantle, dismantleMaterial, rollDrops } from '../js/meta/items.js';
import { enchant } from '../js/meta/enchant.js';
import { createSave, validateSave, SaveStore, SAVE_KEY } from '../js/meta/save.js';
import { STAGE_XP, stageXp, deathLoss, addXp } from '../js/meta/progression.js';
import { settleRound } from '../js/meta/run.js';
import { HubUI } from '../js/ui/hub.js';
import { ATLAS_IDS } from '../js/render/atlas-state.js';

const oldSave = () => JSON.parse(readFileSync(new URL('./fixtures/save-v1-s4.json', import.meta.url)));
const courseSave = () => ['S1','S2','S3','S4'].reduce((save,stageId) => settleRound(save,{stageId,terminal:'clear'}).save,fresh());
const fresh = () => createSave({ name: '콘텐츠 시험', answers: [0, 0, 0, 0, 0], createdAt: 1 });

test('§11.4 content CLI is a failing-build gate integrated into node tests', () => {
  assert.deepEqual(validateContent(), []);
  const result = spawnSync(process.execPath, [new URL('../tools/validate-content.mjs', import.meta.url).pathname]);
  assert.equal(result.status, 0, result.stderr.toString());
  assert.match(result.stdout.toString(), /52 monsters, 58 stages/);
});

test('validator rejects missing ability/archetype/model/palette/name/spawn/drop/recipe references', () => {
  const monsters = structuredClone(MONSTERS);
  monsters.wolf.abilities.push('unknown_attack');
  assert.match(validateContent({ monsters }).join('\n'), /unknown_attack/);
  for (const [field, value] of Object.entries({
    baseArchetypeId: 'absent_archetype', baseModelId: 'absent_model', paletteId: 'absent_palette', nameKey: 'absent_name',
  })) {
    const variants = structuredClone(MONSTER_VARIANTS);
    variants.wolf[field] = value;
    assert.ok(validateContent({ variants }).some((error) => error.includes(value)));
  }
  const stages = structuredClone(STAGES);
  stages.S5.spawns[0].monster = 'missing_monster';
  assert.match(validateContent({ stages }).join('\n'), /missing_monster/);
  const drops = structuredClone(NEW_MONSTER_DROPS);
  drops.wolf.stacks[0].id = 'missing_loot';
  assert.match(validateContent({ drops }).join('\n'), /missing_loot/);
  assert.match(validateContent({ recipes: { rune_blade: { missing_material: 1, gold: 1 } } }).join('\n'), /missing_material/);
});

test('validator enforces simple ≥400ms / elite ≥800ms and rejects danger palettes', () => {
  for (const [id, minimum] of [['wolf_bite', 400], ['guardian_crush', 800]]) {
    const abilities = structuredClone(ABILITIES);
    abilities[id].windupMs = minimum - 1;
    abilities[id].lockMs = 0;
    assert.match(validateContent({ abilities }).join('\n'), /telegraph/);
    abilities[id].windupMs = minimum;
    assert.deepEqual(validateContent({ abilities }), []);
  }
  for (const color of Object.values(DANGER_COLORS)) {
    const palettes = { ...MONSTER_PALETTES, wolf: [color] };
    assert.match(validateContent({ palettes }).join('\n'), /collides/);
    palettes.wolf = [color + 1];
    assert.match(validateContent({ palettes }).join('\n'), /collides/);
  }
});

test('new monsters keep explicit orthogonal identity; verified atlas ids are explicit', () => {
  for (const id of ['throne_dragon','wolf','gargoyle','rune_guardian','spirit','poison_spider']) {
    const variant = MONSTER_VARIANTS[id];
    assert.equal(variant.disposition, 'hostile');
    assert.ok(variant.speciesTags.length);
    assert.equal(ATLAS_IDS[variant.baseModelId], {gargoyle:'gargoyle',wolf:'wolf',poison_spider:'poison-spider',throne_dragon:'throne-dragon',rune_guardian:'rune-guardian',spirit:'spirit'}[id]);
    assert.ok(MONSTERS[id].abilities.some((ability) => ABILITIES[ability].recoveryMs >= (id==='throne_dragon'?1500:2500)));
  }
  assert.deepEqual(MONSTER_VARIANTS.wolf.speciesTags, ['wolf', 'beast']);
  assert.equal(MONSTER_VARIANTS.spirit.lifeState, 'spirit');
});

test('S5~S7 exact first-clear XP, repeat rewards and half death loss preserve valid v2 receipts', () => {
  let save = courseSave();
  for (const id of ['S5', 'S6', 'S7']) {
    assert.equal(stageXp(save, id), STAGE_XP[id]);
    const settled = settleRound(save, { stageId: id, terminal: 'clear' });
    assert.equal(settled.receipt.stageXp, STAGE_XP[id]);
    assert.ok(settled.receipt.firstClear);
    assert.ok(validateSave(settled.save));
    assert.equal(stageXp(settled.save, id), Math.round(STAGE_XP[id] / 4));
    assert.equal(deathLoss({ ...save, xp: 100 }, id), deathLoss({ ...save, xp: 100 }, 'S4'));
    const death = settleRound(save, { stageId: id, terminal: 'death', depositedXp: 20,
      tempLoot: { gold: 10, stacks: { rune_shard: 2 }, items: [] } });
    assert.equal(death.receipt.xpForfeited, 20);
    assert.equal(death.receipt.goldGained, 0);
    assert.deepEqual(death.receipt.lootKept.stacks, {});
    assert.ok(validateSave(death.save));
    save = settled.save;
  }
  assert.deepEqual([STAGE_XP.S5, STAGE_XP.S6, STAGE_XP.S7], [340, 480, 520]);
});

test('static old v1 save resets with backup; current course save unlocks S5 and accepts later clear', () => {
  const fixture = oldSave();
  assert.equal(fixture.cleared.S5, undefined);
  assert.equal(validateSave(fixture), false);
  const upgraded = courseSave();
  assert.ok(validateSave(upgraded));
  const data = new Map([[SAVE_KEY, JSON.stringify(fixture)]]);
  const store = new SaveStore({ getItem: (id) => data.get(id) ?? null,
    setItem: (id, value) => data.set(id, value), removeItem: (id) => data.delete(id) }, () => 1);
  assert.equal(store.load(), null);
  assert.equal(data.get(`${SAVE_KEY}.corrupt.1`), JSON.stringify(fixture));
  const next = settleRound(upgraded, { stageId: 'S5', terminal: 'clear' }).save;
  store.save(next);
  assert.deepEqual(store.load(), next);
  for (const value of ['yes', 1, null]) {
    const invalid = structuredClone(next);
    invalid.cleared.S6 = value;
    assert.equal(validateSave(invalid), false);
  }
});

test('real board discovers S4 → S5 → S6 → S7 frontier and recommended levels', () => {
  const hub = Object.create(HubUI.prototype);
  hub.save = oldSave();
  hub.showInnPanel = (_title, html) => { hub.html = html; };
  const buttonFor = (id) => hub.html.match(new RegExp(`<button[^>]*data-stage="${id}"[^>]*>`))[0];
  hub.showBoard();
  assert.doesNotMatch(buttonFor('S5'), /disabled/);
  assert.doesNotMatch(hub.html, /data-stage="S6"/);
  assert.doesNotMatch(hub.html, /data-stage="S7"/);
  hub.save.cleared.S5 = true;
  hub.showBoard();
  assert.doesNotMatch(buttonFor('S6'), /disabled/);
  assert.doesNotMatch(hub.html, /data-stage="S7"/);
  hub.save.cleared.S6 = true;
  hub.showBoard();
  assert.doesNotMatch(buttonFor('S7'), /disabled/);
  assert.doesNotMatch(hub.html, /undefined/);
});

test('craft-first seeded tables raise basic quantities, make premium materials rare and never add antidotes', () => {
  assert.deepEqual(CONSUMABLES, ['potion', 'mana_potion', 'return_scroll']);
  assert.equal(ITEMS.antidote, undefined);
  assert.ok(Object.values(ITEMS).filter((item) => item.kind === 'material').length <= 20);
  for (const [id, table] of Object.entries(NEW_MONSTER_DROPS)) {
    for (let seed = 0; seed < 100; seed++) {
      const result = rollDrops(id, seed);
      assert.deepEqual(result, rollDrops(id, seed));
      assert.ok(result.gold >= Math.floor(table.gold[0] * (isBossType(id)?1:BALANCE.normalGold)) && result.gold <= Math.ceil(table.gold[1] * (isBossType(id)?1:BALANCE.normalGold)));
      for (const stack of table.stacks.filter((entry) => entry.chance === undefined)) {
        if (['scrap','hide','wood','web','fang'].includes(stack.id)) assert.ok(result.stacks[stack.id] >= Math.floor(stack.count * 1.5) && result.stacks[stack.id] <= Math.ceil(stack.count * 1.5));
        else if (['rune_shard','frost_shard'].includes(stack.id)) assert.ok(!result.stacks[stack.id] || result.stacks[stack.id] === 1 || isBossType(id) && result.stacks[stack.id] === 2);
        else assert.equal(result.stacks[stack.id], stack.count);
      }
      assert.ok(result.items.every((item) => Object.hasOwn(ITEMS, item.id)));
    }
  }
});

test('four next-tier recipes equip/enhance/salvage with a loss and v2 instances', () => {
  const base = addXp(fresh(), 1200);
  base.gold = 10000;
  // rune_blade asks STR 34 (old 9), woven_armor 28 (old 8): spend the needed points on STR.
  { const need = 34 - base.stats.str; base.stats = { ...base.stats, str: 34 }; base.statPoints -= need; }
  base.stacks = { ...base.stacks, scrap: 1000, wood: 100, hide: 100, fang: 100, rune_shard: 100, frost_shard: 100, web: 100, enhance_stone_1: 100 };
  for (const id of ['rune_blade', 'pack_bow', 'altar_staff', 'woven_armor']) {
    assert.equal(ITEMS[id].huntTier, 2);
    assert.equal(ITEMS[id].requiredLevel, 1); // no level gates (cocy 10-11)
    let save = craft(base, id);
    const item = save.items.find((entry) => entry.id === id);
    assert.deepEqual(Object.keys(item).sort(), ['affixes', 'enhance', 'id', 'rolledAt', 'uid']);
    assert.ok(validateSave(equip(save, item.uid)));
    save = enchant({ ...save, stacks: { ...save.stacks, enhance_stone_1: 5 } }, item.uid, 'enhance_stone_1').save;
    const salvage = dismantle(save, item.uid);
    const primary = dismantleMaterial(item);
    assert.equal(salvage.stacks[primary], base.stacks[primary] - RECIPES[id][primary] + Math.floor(RECIPES[id][primary] / 4));
    assert.ok(salvage.gold < base.gold);
    assert.ok(validateSave(salvage));
    assert.ok(equip({ ...save, level: 1 }, item.uid)); // level never gates
    const need = ITEMS[id].requiredStr;
    if (need) assert.throws(() => equip({ ...save, stats: { ...save.stats, str: need - 1 } }, item.uid), new RegExp(`힘 ${need}`));
  }
});
