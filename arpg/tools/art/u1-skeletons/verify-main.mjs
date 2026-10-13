// Run from repo root: node arpg/tools/art/u1-skeletons/verify-main.mjs <git-archive-directory> <main-commit>
// Archive contains main's arpg/ tree and a copy of host-trace.mjs; traces must already be complete.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const [directory, revision] = process.argv.slice(2);
assert.ok(directory && revision, 'main archive directory and commit required');
const base = execFileSync('git', ['rev-parse', revision], { encoding: 'utf8' }).trim();
const art = 'arpg/tools/art/u1-skeletons/';
const digest = value => createHash('sha256').update(value).digest('hex');
const stable = value => typeof value === 'function' ? value.toString() : JSON.stringify(value);
const source = path => execFileSync('git', ['show', base + ':' + path]);
const before = await import(pathToFileURL(resolve(directory, 'arpg/js/content/combat.js')));
const after = await import('../../../js/content/combat.js');
const monsterHashes = {};
for (const [id, value] of Object.entries(before.MONSTERS)) {
  assert.deepEqual(after.MONSTERS[id], value, id); monsterHashes[id] = digest(stable(value));
}
assert.deepEqual(Object.keys(after.MONSTERS).filter(id => !Object.hasOwn(before.MONSTERS, id)),
  ['skeleton_minion', 'skeleton_warrior', 'skeleton_rogue', 'skeleton_mage']);
const exportHashes = {};
for (const [key, value] of Object.entries(before)) if (key !== 'MONSTERS') {
  assert.equal(stable(after[key]), stable(value), key); exportHashes[key] = digest(stable(value));
}
const bm = await import(pathToFileURL(resolve(directory, 'arpg/js/content/monsters.js')));
const am = await import('../../../js/content/monsters.js');
const identities = {};
for (const [key, value] of Object.entries(bm)) {
  if (Array.isArray(value)) {
    assert.deepEqual(am[key].slice(0, value.length), value, key);
    identities[key] = { prefix_length: value.length, sha256: digest(stable(value)) };
  } else {
    identities[key] = { entries: {} };
    for (const [id, entry] of Object.entries(value)) {
      assert.deepEqual(am[key][id], entry, key + ' ' + id);
      identities[key].entries[id] = digest(stable(entry));
    }
  }
}
const ba = await import(pathToFileURL(resolve(directory, 'arpg/js/render/atlas-state.js')));
const aa = await import('../../../js/render/atlas-state.js');
for (const [key, value] of Object.entries(ba)) {
  if (key === 'ATLAS_IDS') for (const [id, entry] of Object.entries(value)) assert.equal(aa[key][id], entry, id);
  else assert.equal(stable(aa[key]), stable(value), key);
}
const files = ['arpg/index.html', 'arpg/tools/art/bake.py', 'arpg/tools/art/verify_atlases.py',
  'arpg/js/render/atlas-visual.js', 'arpg/js/render/renderer.js',
  ...execFileSync('git', ['ls-tree', '-r', '--name-only', base, 'arpg/js/sim'], { encoding: 'utf8' }).trim().split('\n')];
const unchanged = {};
for (const path of files) {
  const original = source(path); assert.deepEqual(readFileSync(path), original, path); unchanged[path] = digest(original);
}
const regression = { ok: true, baseline: base, original_monsters: Object.keys(monsterHashes).length,
  new_monsters: 4, original_monster_sha256: monsterHashes, other_combat_exports_sha256: exportHashes,
  identity_baseline: identities, other_combat_data_exports_unchanged: true, old_identity_entries_unchanged: true,
  sim_unchanged: true, index_unchanged: true, boss_render_unchanged: true, bake_unchanged: true,
  humanoid_verifier_unchanged: true, unchanged_file_sha256: unchanged };
const mainManifest = JSON.parse(source('arpg/assets/sprites/manifest.json'));
const manifest = JSON.parse(readFileSync('arpg/assets/sprites/manifest.json'));
assert.deepEqual(manifest.slice(0, mainManifest.length), mainManifest);
const spriteFiles = execFileSync('git', ['ls-tree', '-r', '--name-only', base, 'arpg/assets/sprites'],
  { encoding: 'utf8' }).trim().split('\n').filter(path => path !== 'arpg/assets/sprites/manifest.json');
const sha = {};
for (const path of spriteFiles) {
  const original = source(path); assert.deepEqual(readFileSync(path), original, path);
  sha[path.replace('arpg/assets/sprites/', '')] = digest(original);
}
const preservation = { baseline: base, manifest: mainManifest, files_sha256: sha, after_ok: true,
  preserved_kits: mainManifest.length, preserved_files: spriteFiles.length,
  new_kits: ['skeleton-minion', 'skeleton-warrior', 'skeleton-rogue', 'skeleton-mage'] };
const beforeBytes = readFileSync(art + 'host-trace-before.json');
const afterBytes = readFileSync(art + 'host-trace-after.json');
const traces = JSON.parse(beforeBytes);
assert.equal(traces.length, Object.keys(before.STAGES).length * 9);
assert.deepEqual(beforeBytes, afterBytes);
const hash = digest(beforeBytes);
const trace = { ok: true, baseline: base, stage_ids: Object.keys(before.STAGES), stages: Object.keys(before.STAGES).length,
  seeds: [1, 42, 999], weapons: ['blade', 'bow', 'focus'], ticks: 900, traces: traces.length,
  before_sha256: hash, after_sha256: digest(afterBytes), cmp_equal: true };
for (const [name, data] of Object.entries({ 'regression-validation': regression,
  'preservation-validation': preservation, 'host-trace-validation': trace }))
  writeFileSync(art + name + '.json', JSON.stringify(data, null, 2) + '\n');
console.log(JSON.stringify({ main: base, original_monsters: Object.keys(monsterHashes).length,
  preserved_kits: mainManifest.length, preserved_files: spriteFiles.length,
  stages: trace.stages, traces: trace.traces, trace_sha256: hash }, null, 2));
