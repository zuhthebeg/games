import test from 'node:test';
import assert from 'node:assert/strict';
import { createSave, validateSave, SaveStore } from '../js/meta/save.js';
import { createTracker, trackRound, settleRound } from '../js/meta/run.js';
import { acceptQuest, questGain, validQuests } from '../js/meta/quest-progress.js';
import { SIDE_QUESTS } from '../js/content/quest-expansion.js';
import { STAGE_XP } from '../js/meta/progression.js';
import { STAGES } from '../js/content/combat.js';
import { HubUI } from '../js/ui/hub.js';

const QF1 = SIDE_QUESTS.QF1;
const fresh = () => {
  const save = createSave({ name: '가죽', answers: [0, 0, 0, 0, 0], weapon: 'blade', createdAt: 7 });
  for (const id of ['S1', 'S2', 'S3', 'S4']) save.cleared[id] = true;
  save.flags.chiefPity = true;
  return save;
};
const kill = (monster, stageId, i = 0) => ({ type: 'kill', id: 100 + i, monster, stageId, threat: 1, elite: false, xp: 0, x: 500, y: 400 });
const sortie = (save, stageId, events, terminal = 'clear', seed = 41) => {
  const { tracker } = trackRound(save, createTracker(seed), events);
  return { tracker, ...settleRound(save, { stageId, terminal, depositedXp: tracker.depositedXp, tempLoot: tracker.tempLoot }) };
};
globalThis.matchMedia ??= () => ({ matches: false });
const hubFor = save => Object.assign(Object.create(HubUI.prototype), { save, persist: () => {}, show: () => {}, lootState: {}, revealed: 0, closeSheet: () => {} });

test('QF1 data stays on existing wolf maps and adds no stage', () => {
  for (const id of QF1.maps) assert.ok(STAGES[id].spawns.some(s => s.monster === 'wolf'), id);
  assert.equal(Object.keys(STAGE_XP).filter(id => !id.startsWith('M_') && !/^S2[1-9]$|^S3[0-6]$/.test(id)).length, 21);
  assert.ok(!Object.hasOwn(STAGES, 'QF1'));
});

test('offer opens with S5, accept is once, older saves without a ledger stay valid', () => {
  const locked = createSave({ name: '가죽', answers: [0, 0, 0, 0, 0], weapon: 'blade', createdAt: 7 });
  assert.throws(() => acceptQuest(locked, 'QF1'), /받을 수 없는/);
  const save = fresh();
  assert.ok(validateSave(save) && save.quests === undefined);
  const accepted = acceptQuest(save, 'QF1');
  assert.deepEqual(accepted.quests, { QF1: { state: 'active', progress: 0 } });
  assert.ok(validateSave(accepted));
  assert.throws(() => acceptQuest(accepted, 'QF1'), /이미/);
  assert.equal(save.quests, undefined, 'accept is pure');
});

test('only hides from wolves on QF1 maps after acceptance count; other monsters and maps do not', () => {
  const before = fresh();
  assert.equal(sortie(before, 'S5', [kill('wolf', 'S5')]).receipt.quests, undefined, 'not accepted yet');
  const save = acceptQuest(fresh(), 'QF1');
  save.cleared.S6 = true;
  assert.deepEqual(questGain(save, kill('iron_boar', 'S5'), ['hide', 'hide']), {});
  assert.deepEqual(questGain(save, kill('wolf', 'S6'), ['hide', 'hide']), {});
  assert.deepEqual(questGain(save, kill('wolf', 'S11'), ['hide', 'fang', 'hide']), { QF1: 2 });
  const result = sortie(save, 'S5', [kill('wolf', 'S5', 0)]);
  assert.deepEqual(result.receipt.quests, [{ id: 'QF1', gained: 2, progress: 2, target: QF1.target, done: false, rewardXp: 0 }]);
  assert.equal(result.save.quests.QF1.progress, 2);
  assert.equal(result.save.stacks.hide, (save.stacks.hide || 0) + 2, 'hides are kept, not consumed');
  assert.equal(result.receipt.lootKept.quest, undefined, 'quest provenance never enters the loot ledger');
  assert.ok(validateSave(result.save));
});

test('existing bag hides, bag overflow and death never count', () => {
  let save = acceptQuest(fresh(), 'QF1');
  save.stacks.hide = 40;
  const dead = sortie(save, 'S5', [kill('wolf', 'S5')], 'death');
  assert.equal(dead.save.quests.QF1.progress, 0);
  assert.equal(dead.receipt.quests, undefined);
  // A full bag rejects the hide units: nothing was accepted, nothing counts.
  const full = structuredClone(save);
  full.stacks.potion = 5000;
  const { tracker } = trackRound(full, createTracker(3), [kill('wolf', 'S5')]);
  assert.equal(tracker.tempLoot.stacks.hide || 0, 0);
  assert.equal(tracker.tempLoot.quest, undefined);
});

test('return keeps progress, completion caps at the target, pays one-time XP and never re-counts', () => {
  let save = acceptQuest(fresh(), 'QF1');
  const first = sortie(save, 'S5', [kill('wolf', 'S5', 0), kill('wolf', 'S5', 1)], 'return_scroll', 51);
  assert.equal(first.save.quests.QF1.progress, 4);
  first.save.quests.QF1.progress = QF1.target - 1; // fast-forward earlier sorties
  assert.equal(first.receipt.xpGained, 0, 'return still forfeits the hunt deposit');
  const second = sortie(first.save, 'S5', [kill('wolf', 'S5', 0), kill('wolf', 'S5', 1)], 'clear', 52);
  assert.deepEqual(second.save.quests.QF1, { state: 'done', progress: QF1.target, last: 52 });
  const [entry] = second.receipt.quests;
  assert.equal(entry.gained, 1);
  assert.ok(entry.done && entry.rewardXp === QF1.rewardXp);
  assert.equal(second.receipt.xpGained, STAGE_XP.S5 + QF1.rewardXp, 'first clear XP plus the one-time contract fee');
  assert.ok(validateSave(second.save));
  const later = sortie(second.save, 'S5', [kill('wolf', 'S5')], 'clear', 53);
  assert.equal(later.receipt.quests, undefined);
  assert.deepEqual(later.save.quests.QF1, second.save.quests.QF1);
});

test('the same sortie settled twice counts once', () => {
  const save = acceptQuest(fresh(), 'QF1');
  const { tracker } = trackRound(save, createTracker(77), [kill('wolf', 'S5')]);
  const args = { stageId: 'S5', terminal: 'return_scroll', depositedXp: 0, tempLoot: tracker.tempLoot };
  const once = settleRound(save, args).save;
  const twice = settleRound(once, args).save;
  assert.equal(once.quests.QF1.progress, 2);
  assert.equal(twice.quests.QF1.progress, 2);
});

test('ledger validation rejects malformed state and survives storage reload', () => {
  assert.ok(validQuests({ QF1: { state: 'active', progress: 3 } }));
  const t = QF1.target;
  for (const bad of [{ QF9: { state: 'active', progress: 0 } }, { QF1: { state: 'done', progress: 3 } },
    { QF1: { state: 'active', progress: t } }, { QF1: { state: 'active', progress: t + 1 } }, { QF1: { state: 'x', progress: 0 } }, []]) {
    assert.ok(!validQuests(bad), JSON.stringify(bad));
  }
  const save = sortie(acceptQuest(fresh(), 'QF1'), 'S5', [kill('wolf', 'S5')]).save;
  const data = new Map();
  const store = new SaveStore({ getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) });
  store.save(save);
  assert.deepEqual(store.load().quests, save.quests);
});

test('map shows offer → progress → done, sortie and receipt show the counter', () => {
  const h = hubFor(fresh());
  h.showInnPanel = (title, html) => { h.html = html; };
  h.mapRegion = 'forest';
  h.showBoard();
  assert.match(h.html, /data-action="quest-accept" data-quest="QF1"/);
  assert.equal((h.html.match(/data-stage="(?:S(?:[1-9]|1\d|20)|TD1)"/g) || []).length, 5, 'only completed S1-S4 and frontier S5 disclosed');
  h.action('quest-accept', { quest: 'QF1' });
  assert.equal(h.save.quests.QF1.state, 'active');
  assert.match(h.html, /side-contract active" data-quest="QF1"/);
  assert.match(h.html, new RegExp(`가죽 0 / ${QF1.target}`));
  h.showSortie('S5');
  assert.match(h.html, new RegExp(`side-quest-line" data-quest="QF1">사냥꾼의 가죽 보급 <b>0 / ${QF1.target}</b>`));
  h.showSortie('S2');
  assert.doesNotMatch(h.html, /side-quest-line/);
  const html = h.questReceiptHtml({ quests: [{ id: 'QF1', gained: 1, progress: 5, target: 5, done: true, rewardXp: 340 }] });
  assert.match(html, /가죽 \+1 · <b>5 \/ 5<\/b> · 완료 · XP \+340/);
  h.save = { ...h.save, quests: { QF1: { state: 'done', progress: QF1.target } } };
  h.showBoard();
  assert.match(h.html, /side-contract clear" data-quest="QF1"/);
  h.mapRegion = 'pass';
  h.showBoard();
  assert.equal(h.mapRegion, 'forest', 'undiscovered selection falls back to current frontier');
  h.save.cleared.S7 = true;
  h.mapRegion = 'pass';
  h.showBoard();
  assert.match(h.html, /<section class="map-quests" data-region="pass"[^>]*>(?:(?!<\/section>).)*<h3 id="map-heading-pass">잿빛 고개<\/h3>(?:(?!<\/section>).)*<\/section>/s);
});
