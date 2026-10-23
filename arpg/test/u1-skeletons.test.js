import {legacyPlacementStages} from './m2b-placement-trace.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { ABILITIES, MONSTERS, STAGES } from '../js/content/combat.js';
import * as combat from '../js/content/combat.js';
import { MONSTER_MODELS, MONSTER_NAMES, MONSTER_PALETTES, MONSTER_VARIANTS } from '../js/content/monsters.js';
import { ATLAS_IDS, atlasAnimation, atlasDirection, DIRECTIONS } from '../js/render/atlas-state.js';
import { createWorld, addPlayer, spawnMonster, step } from '../js/sim/world.js';
import { validateContent } from '../tools/validate-content.mjs';

const ids = ['skeleton_minion', 'skeleton_warrior', 'skeleton_rogue', 'skeleton_mage'];
const read = path => readFileSync(new URL(path, import.meta.url));
const json = path => JSON.parse(read(path));
const av1 = json('./fixtures/av1-source-sha256.json');
const manifest = json('../assets/sprites/manifest.json');
const proof = json('../tools/art/u1-skeletons/delivered-validation.json');
const ground = json('../tools/art/u1-skeletons/ground-anchor-validation.json');

test('U1 all four skeleton identities are hostile undead with neutral source-color palettes', () => {
  assert.deepEqual(validateContent(), []);
  for (const id of ids) {
    const variant = MONSTER_VARIANTS[id];
    assert.ok(MONSTER_MODELS.includes(id));
    assert.ok(MONSTER_NAMES[id].startsWith('해골'));
    assert.equal(MONSTERS[id].lifeState, 'undead');
    assert.equal(MONSTERS[id].heavyPoise, undefined);
    assert.equal(variant.lifeState, 'undead');
    assert.equal(variant.disposition, 'hostile');
    assert.equal(variant.baseArchetypeId, id);
    assert.equal(variant.baseModelId, id);
    assert.equal(variant.nameKey, id);
    assert.deepEqual(variant.speciesTags, ['skeleton', 'humanoid']);
    assert.deepEqual(MONSTER_PALETTES[variant.paletteId], [0xffffff]);
    assert.equal(ATLAS_IDS[id], id === 'skeleton_warrior' ? 'warrior-dagger' : id.replace('_', '-'));
  }
});

test('U1 warrior differs from minion only in increased HP, poise and kbResist', () => {
  const minion = structuredClone(MONSTERS.skeleton_minion);
  const warrior = structuredClone(MONSTERS.skeleton_warrior);
  for (const key of ['hp', 'poise', 'kbResist']) {
    assert.ok(warrior[key] > minion[key], key);
    delete minion[key]; delete warrior[key];
  }
  assert.deepEqual(warrior, minion);
});

test('U1 reuses existing melee, dash and projectile abilities without legacy stage placement', () => {
  assert.deepEqual(MONSTERS.skeleton_minion.abilities, ['goblin_slash']);
  assert.deepEqual(MONSTERS.skeleton_warrior.abilities, ['goblin_slash']);
  assert.deepEqual(MONSTERS.skeleton_rogue.abilities, ['goblin_hop', 'goblin_slash']);
  assert.deepEqual(MONSTERS.skeleton_mage.abilities, ['sling_stone']);
  assert.ok(ABILITIES.goblin_hop.dash);
  assert.ok(ABILITIES.sling_stone.projectile);
  for (const stage of Object.entries(STAGES).filter(([id])=>!/^S2[1-7]$/.test(id)).map(([,stage])=>stage))
    assert.ok(stage.spawns.every(spawn => !ids.includes(spawn.monster)));
  for (const id of ids) {
    const world = createWorld({ seed: 42 });
    addPlayer(world, { pid: 'a', x: 400, y: 400, mods: { maxHp: 10000 } });
    const monster = spawnMonster(world, id, 480, 400);
    monster.spawnLeft = 0;
    for (let tick = 0; tick < 150; tick++) step(world);
    assert.equal(monster.type, id);
    assert.ok(Number.isFinite(monster.hp));
    assert.ok(Number.isFinite(monster.x) && Number.isFinite(monster.y));
  }
});

test('U1 delivered bytes bind every source alpha and unchanged humanoid gates to 1504 fresh frames', () => {
  assert.equal(proof.ok, true);
  assert.equal(proof.total_frames, 1504);
  assert.equal(proof.results.length, 4);
  assert.equal(Object.keys(proof.file_sha256).length, 16);
  for (const [path, expected] of Object.entries(proof.file_sha256))
    assert.equal(createHash('sha256').update(read('../assets/sprites/' + path)).digest('hex'), expected, path);
  for (const id of ids) {
    // Historical U1 art is retained for the boss/legacy trial; keep its exact-byte proof.
    const kit = id.replace('_', '-');
    const entry = manifest.find(row => row.id === kit);
    const record = proof.results.find(row => row.name === kit);
    const anchor = ground.results.find(row => row.id === kit);
    assert.equal(record.pose_profile, 'humanoid');
    assert.equal(record.pose_checked_frames, record.frames);
    assert.equal(record.lossless_alpha_matches_pose_evidence, record.frames);
    assert.equal(record.t_pose_frames, 0); assert.equal(record.bind_pose_frames, 0);
    assert.equal(record.clipped_frames, 0);
    assert.ok(record.min_max_arm_degrees_from_bind > 10);
    assert.ok(record.min_skin_rms_from_bind_height > .015);
    assert.ok(record.alpha_coverage_percent[0] >= 5 && record.alpha_coverage_percent[1] <= 60);
    assert.ok(record.max_idle_center_drift_px < 6);
    assert.ok(record.total_bytes <= 1500000);
    assert.equal(entry.bytes, record.total_bytes);
    assert.deepEqual(entry.animations, ['idle', 'run', 'attack', 'hit', 'death']);
    assert.deepEqual(entry.animation_durations, { hit: .15, death: .6 });
    assert.equal(anchor.ok, true); assert.equal(anchor.frames_checked, record.frames);
    assert.deepEqual(anchor.metadata_anchor, entry.anchor);
    assert.ok(anchor.max_error_px < .001);
    assert.equal(anchor.states_directions.length, 40);
    assert.equal(anchor.baked_ground_shadow, false); assert.equal(anchor.light_shadows, false);
    for (const state of entry.animations) assert.equal(record.unique_direction_hashes[state], 8);
  }
});

test('U1 render-state helpers stay read-only for every state and octant', () => {
  for (const id of ids) for (const [i, direction] of DIRECTIONS.entries()) {
    const entity = Object.freeze({ type: id, facing: i * Math.PI / 4, dead: false, moving: false,
      act: null, dodge: Object.freeze({ dashLeft: 0 }) });
    const anim = Object.freeze({ hurt: 0 });
    assert.equal(atlasDirection(entity.facing), direction);
    assert.equal(atlasAnimation(entity, anim), 'idle');
    assert.equal(atlasAnimation(Object.freeze({ ...entity, moving: true }), anim), 'run');
    assert.equal(atlasAnimation(Object.freeze({ ...entity, act: Object.freeze({ elapsed: 4 }) }), anim), 'attack');
    assert.equal(atlasAnimation(entity, Object.freeze({ hurt: .1 })), 'hit');
    assert.equal(atlasAnimation(Object.freeze({ ...entity, dead: true }), anim), 'death');
  }
});

const sha = value => createHash('sha256').update(value).digest('hex');
const stable = value => typeof value === 'function' ? value.toString() : JSON.stringify(value);

test('U1 preserves all twelve main monster definitions, other combat exports and sim/boss-render bytes', () => {
  const evidence = json('../tools/art/u1-skeletons/regression-validation.json');
  assert.equal(evidence.ok, true);
  assert.equal(evidence.baseline, 'dc2a876d0ce367cc2b99c77b0b1cd0f7c8dceaf8');
  assert.equal(Object.keys(evidence.original_monster_sha256).length, 12);
  for (const [id, hash] of Object.entries(evidence.original_monster_sha256))
    assert.equal(sha(stable(MONSTERS[id])), hash, id);
  // U1's byte proof was pinned at dc2a876; later intentional main commits are exempt by name.
  const later = { ABILITIES: 'd143221 slash 16', 'arpg/js/sim/world.js': 'd143221 melee guard', 'arpg/index.html': 'cache stamps', 'arpg/tools/art/bake.py': 'M2a floating/winged rigs + fixed lift/material colors', 'arpg/tools/art/verify_atlases.py': 'M2a source-bound floating/winged gates' };
  for (const [key, hash] of Object.entries(evidence.other_combat_exports_sha256))
    if (!later[key]) assert.equal(sha(stable(key === 'STAGES' ? Object.fromEntries(Object.entries(legacyPlacementStages(STAGES)).filter(([id])=>!/^S2[1-7]$/.test(id))) : combat[key])), hash, key);
  for (const [path, hash] of Object.entries(evidence.unchanged_file_sha256))
    if (av1.files[path]) assert.equal(sha(read('../' + path.replace(/^arpg\//, ''))), av1.files[path], 'intentional AV1: '+path);
    else if (!later[path]) assert.equal(sha(read('../' + path.replace(/^arpg\//, ''))), hash, path);
  assert.deepEqual(Object.keys(MONSTERS).filter(id => !Object.hasOwn(evidence.original_monster_sha256, id) && !['ghoul','ghost','bat','demon','goleling','slime','succubus'].includes(id)), ids);
});

test('U1 preserves every main sprite byte and all thirteen main manifest descriptors', () => {
  const evidence = json('../tools/art/u1-skeletons/preservation-validation.json');
  assert.equal(evidence.after_ok, true);
  assert.equal(evidence.preserved_kits, 13);
  assert.deepEqual(manifest.slice(0, evidence.preserved_kits), evidence.manifest);
  assert.equal(Object.keys(evidence.files_sha256).length, evidence.preserved_files);
  for (const [path, hash] of Object.entries(evidence.files_sha256))
    assert.equal(sha(read('../assets/sprites/' + path)), hash, path);
  assert.deepEqual(manifest.slice(evidence.preserved_kits).filter(entry => !['ghoul','ghost','bat','demon','goleling','slime','succubus','player-death-knight'].includes(entry.id)).map(entry => entry.id), ids.map(id => ATLAS_IDS[id]));
});

test('U1 main-versus-definition host traces cover every stage and remain byte-identical', () => {
  const evidence = json('../tools/art/u1-skeletons/host-trace-validation.json');
  const before = read('../tools/art/u1-skeletons/host-trace-before.json');
  const after = read('../tools/art/u1-skeletons/host-trace-after.json');
  assert.equal(evidence.baseline, 'dc2a876d0ce367cc2b99c77b0b1cd0f7c8dceaf8');
  assert.equal(evidence.ok, true); assert.equal(evidence.cmp_equal, true);
  assert.deepEqual(evidence.stage_ids, Object.keys(STAGES).filter(id=>!/^S2[1-9]$|^S30$/.test(id)));
  assert.equal(evidence.traces, Object.keys(STAGES).filter(id=>!/^S2[1-9]$|^S30$/.test(id)).length * 9);
  assert.equal(JSON.parse(before).length, evidence.traces);
  assert.deepEqual(before, after);
  assert.equal(sha(before), evidence.before_sha256); assert.equal(sha(after), evidence.after_sha256);
});

test('U1 native CDP desktop/mobile smoke proves four live atlases and 320 state/octant samples without console errors', () => {
  const evidence = json('../tools/art/u1-skeletons/browser-validation.json');
  assert.equal(evidence.ok, true); assert.equal(evidence.consoleErrors, 0);
  assert.equal(evidence.cdpPort, 19911); assert.equal(evidence.httpPort, 8931);
  assert.equal(evidence.screenshots, 0);
  assert.deepEqual(evidence.results.map(row => row.viewport), [[1280,800],[390,844]]);
  for (const result of evidence.results) {
    assert.equal(result.consoleErrors, 0); assert.equal(result.gpu.contextLost, false);
    assert.deepEqual(result.live.map(row => row.key), ids);
    assert.equal(result.proof.length, 4);
    for (const kit of result.proof) {
      assert.equal(kit.heavyPoise, false); assert.equal(kit.frozenEntityUnchanged, true);
      assert.equal(kit.procedural, true); assert.equal(kit.samples.length, 40);
      for (const state of ['idle','run','attack','hit','death'])
        assert.deepEqual(kit.samples.filter(row => row.state === state).map(row => row.direction), DIRECTIONS);
      assert.ok(kit.samples.every(row => row.tint === 0xffffff));
    }
  }
});
