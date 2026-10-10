import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { ATLAS_IDS, DIRECTIONS, atlasDirection, atlasAnimation, atlasFrame } from '../js/render/atlas-state.js';
import { AtlasLibrary } from '../js/render/atlas-library.js';

const base = new URL('../assets/sprites/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', base), 'utf8'));
function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}
function fixture({ failure = false } = {}) {
  const calls = [], unloaded = [];
  const library = new AtlasLibrary({
    baseUrl: new URL('https://local.test/assets/sprites/'),
    fetchManifest: async () => manifest,
    loadSheet: async (url) => {
      calls.push(url);
      if (failure) throw new Error('offline');
      const relative = url.split('/sprites/')[1];
      const data = JSON.parse(await readFile(new URL(relative, base), 'utf8'));
      return { animations: data.animations };
    },
    unloadSheet: async (url) => { unloaded.push(url); },
  });
  return { library, calls, unloaded };
}

test('atlas directions match screen-space simulation angles, wrap and half octants', () => {
  for (let index = 0; index < 8; index++) {
    assert.equal(atlasDirection(index * Math.PI / 4), DIRECTIONS[index]);
    assert.equal(atlasDirection(index * Math.PI / 4 - Math.PI * 2), DIRECTIONS[index]);
  }
  assert.equal(atlasDirection(Math.PI / 8 - 1e-6), 'E');
  assert.equal(atlasDirection(Math.PI / 8 + 1e-6), 'SE');
});

test('display-state priority and bounded frame indices never mutate frozen simulation', () => {
  const idle = deepFreeze({ dead: false, moving: false, facing: 0, dodge: { dashLeft: 0 }, act: null });
  const anim = deepFreeze({ hurt: 0 });
  assert.equal(atlasAnimation(idle, anim), 'idle');
  assert.equal(atlasAnimation(deepFreeze({ ...idle, moving: true }), anim), 'run');
  const attacking = deepFreeze({ ...idle, act: { elapsed: 4, def: { windupMs: 100, activeMs: 100, recoveryMs: 200 } } });
  assert.equal(atlasAnimation(attacking, anim), 'attack');
  assert.equal(atlasAnimation(attacking, deepFreeze({ hurt: .08 })), 'hit');
  assert.equal(atlasAnimation(deepFreeze({ ...attacking, staggerLeft: 3 }), anim), 'hit');
  assert.equal(atlasAnimation(deepFreeze({ ...attacking, dodge: { dashLeft: 3 } }), anim), 'dodge');
  assert.equal(atlasAnimation(deepFreeze({ ...attacking, dead: true, dodge: { dashLeft: 3 } }), anim), 'death');
  assert.equal(atlasFrame('idle', 11, 1.2, 10, idle), 1);
  assert.equal(atlasFrame('death', 8, 50, 10, idle), 7);
  assert.equal(atlasFrame('attack', 12, 0, 10, attacking), 4);
  assert.equal(atlasFrame('attack', 12, 0, 10, { act: { ...attacking.act, elapsed: 100 } }), 11);
});

test('every registered content key has eight-direction WebP clips and <=1.5MB kit; no PNG delivery', async () => {
  for (const [key, id] of Object.entries(ATLAS_IDS)) {
    const entry = manifest.find((candidate) => candidate.id === id);
    assert.ok(entry?.content_ids.includes(key), key);
    let bytes = 0;
    const animations = {};
    const files = await readdir(new URL(`${id}/`, base));
    assert.ok(files.every((filename) => !filename.endsWith('.png')), id);
    for (const filename of entry.sheets) {
      const url = new URL(`${id}/${filename}`, base);
      const data = JSON.parse(await readFile(url, 'utf8'));
      assert.ok(data.meta.image.endsWith('.webp'));
      assert.ok(data.meta.size.w <= 2048 && data.meta.size.h <= 2048);
      bytes += (await stat(url)).size + (await stat(new URL(`${id}/${data.meta.image}`, base))).size;
      for (const frame of Object.values(data.frames)) {
        assert.equal(frame.frame.w, 128);
        assert.equal(frame.frame.h, 128);
        assert.equal(frame.anchor.x, entry.anchor.x);
        assert.equal(frame.anchor.y, entry.anchor.y);
      }
      Object.assign(animations, data.animations);
    }
    for (const state of entry.animations)
      for (const direction of DIRECTIONS) assert.ok(animations[`${state}_${direction}`].length > 1);
    assert.ok(bytes <= 1_500_000, `${id}: ${bytes}`);
    assert.equal(bytes, entry.bytes);
  }
  assert.equal(ATLAS_IDS.iron_boar, 'skeleton', 'fallback must not rename the combat ID');
  assert.equal(ATLAS_IDS.scarecrow, undefined);
});

test('lazy loading deduplicates current kit and only loads monsters when requested', async () => {
  const { library, calls } = fixture();
  library.beginRound(['blade', 'scarecrow']);
  const [one, two] = await Promise.all([library.load('blade'), library.load('blade')]);
  assert.equal(one, two);
  assert.deepEqual(library.status().loaded, ['blade']);
  assert.ok(calls.every((url) => url.includes('/hero-sword/')));
  await library.load('goblin_grunt');
  assert.deepEqual(library.status().loaded, ['blade', 'goblin_grunt']);
  assert.ok(calls.every((url) => /hero-sword|goblin-grunt/.test(url)));
  const before = calls.length;
  assert.equal(await library.load('scarecrow'), null);
  assert.equal(calls.length, before);
});

test('round switch releases old kits and dead-round loads, sharing current assets safely', async () => {
  const { library, unloaded } = fixture();
  library.beginRound(['blade']);
  await library.load('blade');
  library.beginRound(['bow']);
  await library.load('bow');
  assert.deepEqual(library.status().loaded, ['bow']);
  assert.ok(unloaded.some((url) => url.includes('/hero-sword/')));
  const pending = library.load('focus');
  library.beginRound(['bow']);
  assert.equal(await pending, null);
  assert.deepEqual(library.status().loaded, ['bow']);
  assert.ok(unloaded.some((url) => url.includes('/hero-focus/')));
  library.beginRound(['blade']);
  const blade = await library.load('blade');
  assert.ok(blade);
  assert.deepEqual(library.status().loaded, ['blade']);
});

test('atlas failure returns a stable procedural fallback, not endless download attempts', async () => {
  const { library, calls } = fixture({ failure: true });
  library.beginRound(['blade']);
  assert.equal(await library.load('blade'), null);
  assert.equal(await library.load('blade'), null);
  assert.equal(calls.length, 1);
  assert.deepEqual(library.status().failed, { blade: 'offline' });
  assert.deepEqual(library.status().loading, []);
});
