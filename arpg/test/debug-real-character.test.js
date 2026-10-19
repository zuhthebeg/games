import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as debug from '../js/debug/index.js';
import { HubUI } from '../js/ui/hub.js';
import { CharacterStores } from '../js/meta/selected-character.js';
import { createSave, SAVE_KEY } from '../js/meta/save.js';
import { SLOT_SAVE_KEYS } from '../js/meta/character-slots.js';

const human = JSON.stringify(createSave({ name: 'HUMAN', answers: [0,1,2,3,0], createdAt: 1 }));
const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
function fixture(search = '?debug=1') {
  const data = new Map([[SAVE_KEY, human]]), writes = [];
  const storage = { getItem: k => data.get(k) ?? null, setItem(k,v) { writes.push(k); data.set(k,v); }, removeItem(k) { data.delete(k); } };
  const characters = new CharacterStores(storage);
  const hub = Object.assign(Object.create(HubUI.prototype), {
    save: characters.selectHuman(), name: '', answers: [],
    ready() {}, showInn() { this.page = 'inn'; }, showIntro() { this.page = 'intro'; }, showName() { this.page = 'name'; },
  });
  const location = { href: `https://game.cocy.io/arpg/${search}` };
  const boot = main.slice(main.indexOf('  hub.roomInvite ='), main.indexOf('  const debugQuery'));
  const setup = new Function('hub', 'characters', 'bootQuery', 'location', 'history', `let restoreKnightArt, world, running, tracker, roundSave, roundOwner; const legacyEntry = true, soloSelected = false; ${boot}`);
  setup(hub, characters, new URL(location.href).searchParams, location, { replaceState(_a,_b,url) { location.href = String(url); } });
  return { data, writes, characters, hub, location, input: { reset() {} }, running: false, undead: false, coop: false };
}
function select(context, slot) {
  assert.equal(typeof debug.switchRealCharacter, 'function', 'real character action must be available');
  return debug.switchRealCharacter(context, slot);
}
test('debug legacy boot exposes the same real character callbacks as normal selection', () => {
  const f = fixture();
  assert.equal(typeof f.hub.initialCharacters?.read, 'function');
  assert.equal(typeof f.hub.initialCharacters?.create, 'function');
  assert.equal(typeof f.hub.initialCharacters?.human, 'function');
  assert.equal(f.data.get(SAVE_KEY), human);
});
test('debug action creates only the real skeleton slot, persists/reloads and returns to unchanged human', () => {
  const f = fixture();
  select(f, 'skeleton_knight');
  assert.equal(f.hub.page, 'name');
  assert.equal(f.characters.active.slot, 'skeleton_knight');
  assert.equal(f.hub.save, null);
  assert.equal(f.data.has(SLOT_SAVE_KEYS.skeleton_knight), false);
  Object.assign(f.hub, { name: 'SKELETON', answers: [0,1,2,3,0] });
  f.hub.action('create', {});
  const skeleton = f.data.get(SLOT_SAVE_KEYS.skeleton_knight);
  assert.equal(f.hub.page, 'inn');
  assert.equal(JSON.parse(skeleton).lineage, 'skeleton_knight');
  assert.equal(f.data.get(SAVE_KEY), human);
  const reload = new CharacterStores({ getItem: k => f.data.get(k) ?? null, setItem(k,v) { f.data.set(k,v); } });
  assert.equal(reload.selectKnight().name, 'SKELETON');
  select(f, 'human');
  assert.equal(f.hub.save.name, 'HUMAN');
  select(f, 'skeleton_knight');
  assert.equal(f.hub.save.name, 'SKELETON');
  assert.equal(f.hub.page, 'inn');
  assert.equal(f.data.get(SLOT_SAVE_KEYS.skeleton_knight), skeleton);
  assert.equal(f.data.get(SAVE_KEY), human);
  assert.deepEqual(f.writes, [SLOT_SAVE_KEYS.skeleton_knight]);
});
test('both directions are blocked during a run, lobby or unsaved demo before any slot read/write', () => {
  for (const flag of ['running', 'coop', 'undead']) for (const slot of ['human','skeleton_knight']) {
    const f = fixture(), owner = f.characters.active;
    f[flag] = true;
    assert.throws(() => select(f, slot), /전투|로비|데모/);
    assert.equal(f.characters.active, owner);
    assert.equal(f.data.get(SAVE_KEY), human);
    assert.deepEqual(f.writes, []);
  }
});
test('corrupt or occupied skeleton is never replaced by debug selection', () => {
  const f = fixture(), owner = f.characters.active;
  f.data.set(SLOT_SAVE_KEYS.skeleton_knight, 'BROKEN');
  assert.throws(() => select(f, 'skeleton_knight'), /손상/);
  assert.equal(f.characters.active, owner);
  assert.equal(f.data.get(SLOT_SAVE_KEYS.skeleton_knight), 'BROKEN');
  assert.equal(f.data.get(SAVE_KEY), human);
  assert.deepEqual(f.writes, []);
});
