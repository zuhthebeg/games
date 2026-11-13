import test from 'node:test';
import assert from 'node:assert/strict';
import { HubUI } from '../js/ui/hub.js';
import { createSave, validateSave } from '../js/meta/save.js';
import { createSkeletonSave } from '../js/meta/character-creation.js';
import { CharacterStores } from '../js/meta/selected-character.js';
import { SLOT_SAVE_KEYS } from '../js/meta/character-slots.js';
import { unlockedThreat, selectThreat } from '../js/meta/run.js';

// Synthetic, schema-valid progress. Only Storage and presentation/round boundaries
// are replaced: public menu actions, HTML, selection, commit and SaveStore are real.
function profile(slot, stage = 'S2', unlocked = 1) {
  const options = { name: slot === 'human' ? 'human' : 'skeleton', answers: [0, 0, 0, 0, 0], weapon: 'blade', createdAt: slot === 'human' ? 1 : 2 };
  const save = slot === 'human' ? createSave(options) : createSkeletonSave({ ...options, lineage: slot });
  save.cleared.S1 = true;
  if (stage === 'S3') save.cleared.S2 = true;
  if (unlocked > 1) { save.cleared[stage] = true; save.stageThreat = { [stage]: unlocked - 1 }; }
  assert.ok(validateSave(save));
  assert.equal(unlockedThreat(save, stage), unlocked);
  return save;
}
function harness({ human = profile('human', 'S2', 3), knight = profile('skeleton_knight'), active = 'human' } = {}) {
  const data = new Map(Object.entries({ human, skeleton_knight: knight }).filter(([, save]) => save)
    .map(([slot, save]) => [SLOT_SAVE_KEYS[slot], JSON.stringify(save)]));
  const writes = [], removes = [], starts = [], parties = [];
  const storage = { getItem: key => data.get(key) ?? null,
    setItem(key, value) { writes.push(key); data.set(key, value); },
    removeItem(key) { removes.push(key); data.delete(key); } };
  const chars = new CharacterStores(storage);
  globalThis.matchMedia = () => ({ matches: false });
  const h = Object.assign(Object.create(HubUI.prototype), {
    save: active === 'human' ? chars.selectHuman() : chars.selectKnight(),
    initialCharacters: { human: () => chars.selectHuman(), read: () => chars.selectKnight(), create: options => chars.createKnight(options) },
    root: { hidden: false, querySelector: () => ({ checked: false, focus() {} }) },
    persist: save => chars.persist(save), resetSave: () => chars.reset(),
    startRound: (...args) => starts.push({ args, save: structuredClone(h.save) }),
    startCoop: (...args) => parties.push(args), recoverVitals() {},
    presentationHtml: () => '', // Sound probe needs a browser event target, unrelated to reset.
    show(html, page) { this.html = html; this.page = page; },
    mountSheet(html) { this.sheet = html; }, closeSheet() { this.sheet = null; },
  });
  return { h, chars, data, writes, removes, starts, parties };
}
const choose = (h, slot) => { h.action('inn', {}); h.action('character-choice', {}); h.action(slot === 'human' ? 'choose-human' : 'choose-skeleton', {}); if (h.save) h.action('board', {}); };
const sortie = (h, stage, threat) => { h.action('sortie', { stage }); if (threat) h.action('threat', { threat: String(threat) }); };
function selection(h, expected) {
  assert.equal(h.sortieThreat, expected);
  for (const tier of [1, 2, 3]) {
    const tag = h.html.match(new RegExp('<button[^>]*data-action="threat"[^>]*data-threat="' + tier + '"[^>]*>'))?.[0];
    assert.ok(tag, 'real threat button exists');
    assert.match(tag, new RegExp('aria-pressed="' + (tier === expected) + '"'));
    if (tier > unlockedThreat(h.save, h.sortieStage)) {
      assert.match(tag, /disabled/);
      assert.match(tag, /aria-pressed="false"/);
    }
  }
}
function launchedOnce(ctx, slot, threat, untouchedBytes) {
  const { h, starts, writes, chars, data } = ctx;
  h.action('launch', {});
  assert.equal(starts.length, 1);
  assert.deepEqual(starts[0].args, [h.sortieStage, false, null]);
  assert.equal(starts[0].save.threat, threat);
  assert.equal(writes.length, 1);
  assert.equal(writes[0], SLOT_SAVE_KEYS[slot]);
  assert.ok(validateSave(JSON.parse(data.get(SLOT_SAVE_KEYS[slot]))));
  assert.equal(chars.active.raw, data.get(SLOT_SAVE_KEYS[slot]));
  assert.equal(data.get(SLOT_SAVE_KEYS[slot === 'human' ? 'skeleton_knight' : 'human']), untouchedBytes);
}

test('CT1 audit route: human S2 threat3 -> inn -> skeleton -> board -> S2 launches tier1 once', () => {
  const ctx = harness(), { h, data, writes } = ctx;
  const raw = JSON.stringify([...data]), humanBytes = data.get(SLOT_SAVE_KEYS.human);
  sortie(h, 'S2', 3); choose(h, 'skeleton_knight'); sortie(h, 'S2');
  selection(h, 1);
  assert.equal(JSON.stringify([...data]), raw); assert.equal(writes.length, 0);
  launchedOnce(ctx, 'skeleton_knight', 1, humanBytes);
});

for (const from of ['human', 'skeleton_knight']) for (const stage of ['S2', 'S3']) {
  for (const [prior, unlocked, expected] of [[2, 1, 1], [3, 1, 1], [3, 2, 1], [2, 2, 2]]) {
    test('switch ' + from + ' ' + stage + ' tier' + prior + ' -> unlocked' + unlocked + ' selects ' + expected, () => {
      const to = from === 'human' ? 'skeleton_knight' : 'human';
      const saves = { [from]: profile(from, stage, 3), [to]: profile(to, stage, unlocked) };
      const ctx = harness({ human: saves.human, knight: saves.skeleton_knight, active: from });
      const { h, data, writes } = ctx, raw = JSON.stringify([...data]), fromBytes = data.get(SLOT_SAVE_KEYS[from]);
      sortie(h, stage, prior); choose(h, to); sortie(h, stage); selection(h, expected);
      assert.equal(JSON.stringify([...data]), raw); assert.equal(writes.length, 0);
      if (unlocked < 3) assert.throws(() => h.action('threat', { threat: '3' }), /위협도가 잠겨/);
      launchedOnce(ctx, to, expected, fromBytes);
    });
  }
}

for (const slot of ['human', 'skeleton_knight']) test(slot + ' valid same-map selection survives inn, board and cancelled/reselected chooser', () => {
  const ctx = harness({ human: profile('human', 'S2', 3), knight: profile('skeleton_knight', 'S2', 3), active: slot });
  const { h, data } = ctx, raw = JSON.stringify([...data]);
  sortie(h, 'S2', 3); h.action('inn', {}); h.action('board', {}); sortie(h, 'S2'); selection(h, 3);
  h.action('character-choice', {}); h.action('inn', {}); sortie(h, 'S2'); selection(h, 3);
  choose(h, slot); sortie(h, 'S2'); selection(h, 3);
  assert.equal(JSON.stringify([...data]), raw); assert.equal(ctx.writes.length, 0);
});

test('different open map starts at1 and S1 always selects only1', () => {
  const { h, writes } = harness();
  sortie(h, 'S2', 3); sortie(h, 'S3'); selection(h, 1);
  sortie(h, 'S2', 3); sortie(h, 'S1'); selection(h, 1);
  assert.throws(() => h.action('threat', { threat: '2' }), /위협도가 잠겨/);
  assert.equal(writes.length, 0);
});

test('new character locked map keeps mapUnlocked rejection and both saved slots unchanged', () => {
  const ctx = harness(), { h, data, starts, writes } = ctx;
  const raw = JSON.stringify([...data]);
  sortie(h, 'S3'); choose(h, 'skeleton_knight');
  assert.throws(() => sortie(h, 'S3'), /아직 잠긴 맵/);
  assert.throws(() => h.action('launch', {}), /아직 잠긴 맵/);
  assert.equal(starts.length, 0); assert.equal(writes.length, 0); assert.equal(JSON.stringify([...data]), raw);
});

test('cancel fresh skeleton creation preserves human valid threat and never writes either slot', () => {
  const ctx = harness({ knight: null }), { h, data } = ctx, raw = JSON.stringify([...data]);
  sortie(h, 'S2', 3); choose(h, 'skeleton_knight'); assert.equal(h.page, 'name');
  h.action('character-choice', {}); h.action('choose-human', {}); sortie(h, 'S2'); selection(h, 3);
  assert.equal(JSON.stringify([...data]), raw); assert.equal(ctx.writes.length, 0);
});

test('fresh skeleton creation cannot inherit human threat after the same map becomes open', () => {
  const ctx = harness({ knight: null }), { h, data } = ctx, human = data.get(SLOT_SAVE_KEYS.human);
  sortie(h, 'S2', 3); choose(h, 'skeleton_knight');
  h.name = 'new skeleton'; for (let i = 0; i < 5; i++) h.action('answer', { choice: '0' });
  h.action('create', {});
  assert.equal(ctx.writes.length, 1); assert.equal(ctx.starts.length, 0);
  assert.throws(() => sortie(h, 'S2'), /아직 잠긴 맵/);
  // Synthetic post-S1 progression via the actual validated commit, not a threat stub.
  h.commit({ ...h.save, cleared: { ...h.save.cleared, S1: true } });
  const raw = JSON.stringify([...data]), writes = ctx.writes.length;
  sortie(h, 'S2'); selection(h, 1);
  assert.equal(JSON.stringify([...data]), raw); assert.equal(ctx.writes.length, writes);
  assert.equal(data.get(SLOT_SAVE_KEYS.human), human);
});

test('reset and recreate skeleton normalizes stale same-map threat without touching human', () => {
  const ctx = harness({ knight: profile('skeleton_knight', 'S2', 3), active: 'skeleton_knight' });
  const { h, data } = ctx, human = data.get(SLOT_SAVE_KEYS.human);
  sortie(h, 'S2', 3); h.action('settings', {}); h.action('reset-first', {}); h.action('reset-second', {}); h.action('reset-final', {});
  assert.equal(h.page, 'character-choice'); assert.equal(data.has(SLOT_SAVE_KEYS.skeleton_knight), false);
  h.action('choose-skeleton', {}); h.name = 'reborn'; for (let i = 0; i < 5; i++) h.action('answer', { choice: '0' });
  h.action('create', {}); assert.throws(() => sortie(h, 'S2'), /아직 잠긴 맵/);
  h.commit({ ...h.save, cleared: { ...h.save.cleared, S1: true } });
  const raw = JSON.stringify([...data]), count = ctx.writes.length;
  sortie(h, 'S2'); selection(h, 1);
  assert.equal(JSON.stringify([...data]), raw); assert.equal(ctx.writes.length, count);
  assert.equal(data.get(SLOT_SAVE_KEYS.human), human); assert.equal(ctx.starts.length, 0);
});

test('no-potion confirmation uses normalized tier and commits once only on confirm', () => {
  const knight = profile('skeleton_knight'); knight.stacks.potion = 0;
  const ctx = harness({ knight }), { h, data } = ctx, human = data.get(SLOT_SAVE_KEYS.human);
  sortie(h, 'S2', 3); choose(h, 'skeleton_knight'); sortie(h, 'S2'); selection(h, 1);
  h.action('launch', {}); assert.match(h.sheet, /launch-without-potion/);
  assert.equal(ctx.writes.length, 0); assert.equal(ctx.starts.length, 0);
  h.action('launch-without-potion', {});
  assert.equal(ctx.starts.length, 1); assert.equal(ctx.writes.length, 1); assert.equal(h.save.threat, 1);
  assert.ok(validateSave(JSON.parse(data.get(SLOT_SAVE_KEYS.skeleton_knight))));
  assert.equal(data.get(SLOT_SAVE_KEYS.human), human);
});

test('sortie co-op button receives normalized tier without committing or launching solo (callback regression only)', () => {
  const ctx = harness(), { h, data } = ctx, raw = JSON.stringify([...data]);
  sortie(h, 'S2', 3); choose(h, 'skeleton_knight'); sortie(h, 'S2');
  assert.match(h.html, /data-action="coop"/); h.action('coop', {});
  assert.deepEqual(ctx.parties, [['S2', 1]]);
  assert.equal(ctx.starts.length, 0); assert.equal(ctx.writes.length, 0); assert.equal(JSON.stringify([...data]), raw);
});

test('normalization never weakens selectThreat or CharacterStores owner and save validation', () => {
  const ctx = harness(), { h, data } = ctx;
  sortie(h, 'S2', 3); choose(h, 'skeleton_knight'); sortie(h, 'S2');
  assert.throws(() => selectThreat(h.save, 'S2', 3), /위협도가 잠겨/);
  const key = SLOT_SAVE_KEYS.skeleton_knight, original = data.get(key);
  data.set(key, original + ' ');
  assert.throws(() => h.action('launch', {}), /저장 슬롯이 변경/);
  assert.equal(ctx.starts.length, 0); assert.equal(ctx.writes.length, 0);
  data.set(key, original); h.save.name = '';
  assert.throws(() => h.action('launch', {}), /저장 데이터 검증/);
  assert.equal(ctx.starts.length, 0); assert.equal(ctx.writes.length, 0); assert.equal(data.get(key), original);
});
