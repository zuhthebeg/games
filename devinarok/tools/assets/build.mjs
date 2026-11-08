import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, resample, weld } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { HUB_ARENA, STAGES } from '../../js/content/stages.js';
import { ARENA } from '../../js/sim/arena.js';

const toolsDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const gameDir = resolve(toolsDir, '..');
const repoRoot = resolve(gameDir, '..');
const cacheDir = join(gameDir, '.cache/sources');
const assetDir = join(gameDir, 'assets');
const now = new Date().toISOString().slice(0, 10);
const budgetBytes = 5 * 1024 * 1024;
const natureArchiveSha256 = 'fa7974a0d342bfe63c38664ba9f8ec1a4aab8ea25f099bdc56870e33588c4d9d';
const natureArchivePath = join(cacheDir, 'kenney-nature-kit-2.1.zip');

const repos = {
  adventures: {
    name: 'KayKit-Character-Pack-Adventures-1.0',
    url: 'https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0',
    commit: '672074b73ba276876a19e8816ecdc5241817ab47',
    license: { path: 'LICENSE.txt', blob: '877e44735b5869c10e17a59e3b757905aa390626' },
    licenseOutput: 'assets/licenses/kaykit-adventures-LICENSE.txt',
  },
  skeletons: {
    name: 'KayKit-Character-Pack-Skeletons-1.0',
    url: 'https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0',
    commit: '15b62b9bad122f72926c10fb14d622c73819fa54',
    license: { path: 'LICENSE.txt', blob: '5de5a1e35003680bd6b97b4c247eed71d51a9fb7' },
    licenseOutput: 'assets/licenses/kaykit-skeletons-LICENSE.txt',
  },
  dungeon: {
    name: 'KayKit-Dungeon-Remastered-1.0',
    url: 'https://github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0',
    commit: 'b0ca9bd96a8072ab36a3a5464f00ed1e06a16d07',
    license: { path: 'LICENSE.txt', blob: '686cf4ee3931b75d4ecfac6308f9d3287553748c' },
    licenseOutput: 'assets/licenses/kaykit-dungeon-LICENSE.txt',
  },
  nature: {
    name: 'Nature Kit 2.1',
    url: 'https://kenney.nl/assets/nature-kit',
    commit: natureArchiveSha256,
    license: { path: 'License.txt' },
    licenseOutput: 'assets/licenses/kenney-nature-kit-LICENSE.txt',
  },
  halloween: {
    name: 'KayKit-Halloween-Bits-1.0',
    url: 'https://github.com/KayKit-Game-Assets/KayKit-Halloween-Bits-1.0',
    commit: '6dc69bf6b2fa766a985754f35ec6a0324090e6c6',
    license: {
      path: 'addons/kaykit_halloween_bits/Assets/LICENSE.txt',
      blob: '1c10d234eb090aa374f7fb3c23a7da71e74197e3',
    },
    licenseOutput: 'assets/licenses/kaykit-halloween-bits-LICENSE.txt',
  },
};

const characters = [
  ['adventures', 'Knight', 'addons/kaykit_character_pack_adventures/Characters/gltf/Knight.glb', '717b56ca2b5ff5392679774725201ba03a3eefab'],
  ['adventures', 'Barbarian', 'addons/kaykit_character_pack_adventures/Characters/gltf/Barbarian.glb', '66d312ab6dc02b35fb648e7585bfdddb4e02eeef'],
  ['adventures', 'Mage', 'addons/kaykit_character_pack_adventures/Characters/gltf/Mage.glb', 'c89f19f6e707f6e07e4632a08876bd6d0172b082'],
  ['adventures', 'Rogue_Hooded', 'addons/kaykit_character_pack_adventures/Characters/gltf/Rogue_Hooded.glb', '5d2b1403240d5f9ffff12e02c007572038eca2a8'],
  ['skeletons', 'Skeleton_Minion', 'addons/kaykit_character_pack_skeletons/Characters/gltf/Skeleton_Minion.glb', '3b7e7ee4f1c8dd6dd99ddad27824ef1dc52ff12d'],
  ['skeletons', 'Skeleton_Warrior', 'addons/kaykit_character_pack_skeletons/Characters/gltf/Skeleton_Warrior.glb', '769e85c9e4cee8d1bd0952ddb3e9d26293144581'],
  ['skeletons', 'Skeleton_Mage', 'addons/kaykit_character_pack_skeletons/Characters/gltf/Skeleton_Mage.glb', '5f85aea26b4f33b88080d6eb57d25d1ae5d84d14'],
  ['skeletons', 'Skeleton_Rogue', 'addons/kaykit_character_pack_skeletons/Characters/gltf/Skeleton_Rogue.glb', '182403932e4d4e00aa4182f2ac882ac27326dd19'],
].map(([repo, name, path, blob]) => ({
  kind: 'character',
  repo,
  path,
  blob,
  output: `assets/chars/${name}.glb`,
}));

const animations = [
  {
    repo: 'adventures',
    path: 'addons/kaykit_character_pack_adventures/Characters/gltf/Knight.glb',
    blob: '717b56ca2b5ff5392679774725201ba03a3eefab',
    output: 'assets/anims/humanoid.glb',
    kind: 'animation',
    clips: [
      'Idle',
      'Running_A',
      'Walking_A',
      '1H_Melee_Attack_Slice_Diagonal',
      '1H_Melee_Attack_Slice_Horizontal',
      '1H_Melee_Attack_Chop',
      '1H_Melee_Attack_Stab',
      '2H_Ranged_Shoot',
      '1H_Ranged_Shoot',
      'Spellcast_Shoot',
      'Spellcast_Long',
      'Dodge_Forward',
      'Block',
      'Hit_A',
      'Death_A',
      'Death_A_Pose',
      'Cheer',
      'Interact',
      'Unarmed_Idle',
    ],
  },
  {
    repo: 'skeletons',
    path: 'addons/kaykit_character_pack_skeletons/Characters/gltf/Skeleton_Warrior.glb',
    blob: '769e85c9e4cee8d1bd0952ddb3e9d26293144581',
    output: 'assets/anims/skeleton.glb',
    kind: 'animation',
    clips: [
      'Idle_Combat',
      'Walking_D_Skeletons',
      'Running_C',
      '1H_Melee_Attack_Chop',
      '1H_Melee_Attack_Slice_Diagonal',
      'Spellcast_Shoot',
      'Hit_A',
      'Death_C_Skeletons',
      'Spawn_Ground_Skeletons',
      'Taunt',
    ],
  },
];

const environment = [
  ['floor_tile_large', '953468a2f75ae10a673f7f064ccea4b088628f53'],
  ['floor_tile_large_rocks', '5c1379a202cb5caf95eee3b114d44036fd68481b'],
  ['floor_tile_small', '18fd07c66d68c040f3f24f0095fc63334307d865'],
  ['wall', '5bb502fe4392ee9813760794b583acbfa71814a3'],
  ['wall_corner', 'e594aa8ebfedf0bb92ebc5d1603cd4a18ef3f637'],
  ['wall_half', 'e1bfabe58ee53c21b6a18ad37fa04c496c07cb1d'],
  ['wall_doorway', 'bce214e25088ec62599bde0c18569b2d26a22e7a'],
  ['pillar', '3b228d747c4ef1f9552743880906fc647dabcec3'],
  ['torch_lit', '7976a030114d40da7e46ca719f35d973d9d9f55c'],
  ['candle_lit', 'b79333506e47e0288472b770a11c2e4b5ded93cc'],
  ['barrel_large', '7a88d9bcca79d21b2033a1681b71577fe06e8717'],
  ['crates_stacked', '7f273be5ebd143b58135ecc1d061d22a633cad92'],
  ['banner_red', 'aa438c0140ed09f613e3334264d0df58e83f0575'],
  ['banner_patternA_red', 'e7185427cdfadf0c560b162bd5147acba99d8174'],
  ['banner_patternB_blue', '6c3e364454cd882307bf2cf94e9d51c363c1f58e'],
  ['banner_shield_red', '7e81382d8c57efce6fa89a0c8785eab15ab9576b'],
  ['column', 'a4b5779f50f006cb49524742d489b49ae2249c66'],
  ['chair', 'd714e3eace33b64d3a2190025a57dd9762e50a6f'],
  ['chest', '534c76a794d4b531a91619871845e92e3ca6e432'],
  ['chest_gold', '8dd05d691d4954009c94b9bb052e56db5c4f3432'],
  ['floor_dirt_large', '9e0cd900a8fe185ab171279d075e374ce2549c2c'],
  ['floor_dirt_large_rocky', '280dd6f91bef8de1f60b1d5cab0e887bd1c43635'],
  ['floor_tile_small_broken_A', '11bcf371ced6a99a8011fce08b9d180af8946c62'],
  ['floor_wood_large', '8a883f18915f071f9057a46a21844140019ed968'],
  ['floor_wood_large_dark', '613aa0855869461836c3b6c12fcb45aee070e9a1'],
  ['keg', '47a84fa90788c644a022c2394fe16c2b4e912706'],
  ['keg_decorated', '6420a0e39f8d76005cdbf3471e6de799099937b3'],
  ['rubble_half', '4a4c48135629764469ab6570a2f118cb92df532c'],
  ['rubble_large', '4ddb08100ba5203d1ef7427c54d0ceb3868f170c'],
  ['shelf_large', 'e1b7e9752aa4b2b7cc14106bbfb417a33396e432'],
  ['shelf_small_candles', '8d4603c8fbeb547052f11458b82e0e7afb49700f'],
  ['stairs_wide', '71189ad7b883e8a9a218280c79d843b887dd68b8'],
  ['stool', 'cbac1e0ebbafad7dbc9761fbbeedc3cef801eb3e'],
  ['table_long_decorated_A', 'ad1b253c1e159203c260fa8568109a1dd5ee49f2'],
  ['table_medium_decorated_A', '7f03c5737c14557db5ceaf8fcb032011482490f1'],
  ['table_small_decorated_A', 'b9cc0649c28efca90df08cfd0ab1dbc8310bffe8'],
  ['torch_mounted', '5c3892703d75e029192aa63b9cbfb1c1f11efa01'],
  ['wall_arched', 'd049ace889b606edb5d638b9996aeb580f095387'],
  ['wall_archedwindow_open', '14621d09869ab624bbfdd63e251cd55a0fa58097'],
  ['wall_broken', 'c67687c36ed383eed5708580cd7c80977f6ace3f'],
  ['wall_corner_gated', 'd83efd31ce75306473647086960a6fd68bbdc410'],
  ['wall_cracked', '13440aaa23012aa42554c683e92b5c31ed319352'],
  ['wall_shelves', 'a9c0c666da9a5b1815fd47d8529bbf14907fb3e7'],
].map(([name, blob]) => ({
  kind: 'environment',
  repo: 'dungeon',
  path: `addons/kaykit_dungeon_remastered/Assets/gltf/${name}${['wall_doorway', 'chest', 'chest_gold'].includes(name) ? '.glb' : '.gltf.glb'}`,
  blob,
  output: `assets/env/${name}.glb`,
}));

const forestEnvironment = [
  'tree_default_fall',
  'tree_oak_fall',
  'tree_pineTallA',
  'tree_pineTallB',
  'rock_largeA',
  'rock_largeD',
  'rock_smallB',
  'stump_old',
  'stump_round',
  'log',
  'log_large',
  'mushroom_redGroup',
  'mushroom_tanGroup',
  'plant_bushLarge',
  'fence_planks',
  'fence_gate',
  'campfire_logs',
  'ground_pathStraight',
  'ground_grass',
].map((name) => ({
  kind: 'environment',
  repo: 'nature',
  path: `Models/GLTF format/${name}.glb`,
  output: `assets/env/forest/${name}.glb`,
}));

const halloweenEnvironment = [
  ['grave_A', '076cfd9e4ec165af2c7fa978bf1ea38e352fa909'],
  ['gravestone', '7dd75f961293be878d6396873ece88801b8b5dd6'],
  ['fence', '0dafdc846c869b195e5143f0751f566e0d074c21'],
  ['bone_A', '3d4ddb16756b6068208999650a39fd540afa7583'],
  ['bone_B', '52d5ed955c86a4c216ae135c03597df340e4b6a1'],
  ['bone_C', '375500d9bf301fe6318efc84e3cbf308bec34e4f'],
  ['ribcage', '8c737852082a2213a44e0bf4404ae343dea82f9a'],
  ['skull', 'c045e51034bf3d51fe2021fe6c5be7eeed917a3d'],
  ['coffin', '74b92de704805235c33e1446db9cfefe760df371'],
  ['candle_triple', 'd72e8f75f52921c3b45fb2b041044f890deefddb'],
].map(([name, blob]) => ({
  kind: 'environment',
  repo: 'halloween',
  path: `addons/kaykit_halloween_bits/Assets/gltf/${name}.gltf`,
  blob,
  output: `assets/env/castle/${name}.glb`,
}));

const jobs = [...characters, ...animations, ...environment, ...forestEnvironment, ...halloweenEnvironment];
const sourceByKey = new Map();
for (const job of jobs) sourceByKey.set(`${job.repo}/${job.path}`, job);
for (const [repoId, repo] of Object.entries(repos)) {
  sourceByKey.set(`${repoId}/${repo.license.path}`, {
    kind: 'license',
    repo: repoId,
    path: repo.license.path,
    ...(repo.license.blob ? { blob: repo.license.blob } : {}),
    output: repo.licenseOutput,
  });
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function gitBlobSha1(bytes) {
  return createHash('sha1')
    .update(`blob ${bytes.byteLength}\0`)
    .update(bytes)
    .digest('hex');
}

function disposeAnimation(animation) {
  for (const channel of [...animation.listChannels()]) {
    animation.removeChannel(channel);
    channel.dispose();
  }
  for (const sampler of [...animation.listSamplers()]) {
    animation.removeSampler(sampler);
    sampler.dispose();
  }
  animation.dispose();
}

function removeDefaultAnimationChannels(document) {
  let removed = 0;
  for (const animation of document.getRoot().listAnimations()) {
    for (const channel of [...animation.listChannels()]) {
      const sampler = channel.getSampler();
      const input = sampler.getInput();
      const output = sampler.getOutput();
      const target = channel.getTargetNode();
      const path = channel.getTargetPath();
      if (!input || !output || !target || sampler.getInterpolation() === 'CUBICSPLINE') continue;

      const stride = output.getElementSize();
      const values = output.getArray();
      if (!values || values.length !== input.getCount() * stride) continue;

      const defaults = path === 'translation'
        ? target.getTranslation()
        : path === 'rotation'
          ? target.getRotation()
          : path === 'scale'
            ? target.getScale()
            : null;
      if (!defaults || defaults.length !== stride) continue;

      let matchesDefault = true;
      for (let frame = 0; frame < input.getCount() && matchesDefault; frame += 1) {
        for (let component = 0; component < stride; component += 1) {
          if (Math.abs(values[frame * stride + component] - defaults[component]) > 1e-5) {
            matchesDefault = false;
            break;
          }
        }
      }
      if (matchesDefault) {
        animation.removeChannel(channel);
        channel.dispose();
        removed += 1;
      }
    }
    const usedSamplers = new Set(animation.listChannels().map((channel) => channel.getSampler()));
    for (const sampler of animation.listSamplers()) {
      if (!usedSamplers.has(sampler)) {
        animation.removeSampler(sampler);
        sampler.dispose();
      }
    }
  }
  return removed;
}

async function sourceBytes(job) {
  const repo = repos[job.repo];
  const cachePath = join(cacheDir, repo.commit, job.path);
  await mkdir(dirname(cachePath), { recursive: true });
  let bytes;
  try {
    bytes = await readFile(cachePath);
  } catch {
    if (job.repo === 'nature') {
      let archive;
      try {
        archive = await readFile(natureArchivePath);
      } catch {
        const linkResponse = await fetch('https://kenney.nl/download-link/6173736574732f6e61747572652d6b6974');
        if (!linkResponse.ok) throw new Error(`Nature Kit download link failed (${linkResponse.status})`);
        const { url } = await linkResponse.json();
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Nature Kit archive download failed (${response.status})`);
        archive = Buffer.from(await response.arrayBuffer());
        if (sha256(archive) !== natureArchiveSha256) throw new Error('Nature Kit archive SHA-256 mismatch');
        await mkdir(dirname(natureArchivePath), { recursive: true });
        await writeFile(natureArchivePath, archive);
      }
      if (sha256(archive) !== natureArchiveSha256) throw new Error('Cached Nature Kit archive SHA-256 mismatch');
      bytes = execFileSync('python3', [
        '-c',
        'import sys,zipfile; sys.stdout.buffer.write(zipfile.ZipFile(sys.argv[1]).read(sys.argv[2]))',
        natureArchivePath,
        job.path,
      ], { maxBuffer: 32 * 1024 * 1024 });
    } else {
      const url = `https://raw.githubusercontent.com/KayKit-Game-Assets/${repo.name}/${repo.commit}/${job.path}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Source download failed (${response.status}): ${url}`);
      bytes = Buffer.from(await response.arrayBuffer());
    }
    await mkdir(dirname(cachePath), { recursive: true });
    await writeFile(cachePath, bytes);
  }
  if (job.blob) {
    const actualBlob = gitBlobSha1(bytes);
    if (actualBlob !== job.blob) throw new Error(`Pinned Git blob mismatch for ${job.path}: ${actualBlob}`);
  }
  return { bytes, sha256: sha256(bytes) };
}

await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const sourceRecords = new Map();
for (const [key, job] of sourceByKey) sourceRecords.set(key, await sourceBytes(job));
const natureLicenseText = sourceRecords.get('nature/License.txt').bytes.toString('utf8');
if (!/Creative Commons Zero, CC0/i.test(natureLicenseText)) {
  throw new Error('Nature Kit archive License.txt does not confirm CC0');
}
const halloweenLicenseText = sourceRecords.get(`halloween/${repos.halloween.license.path}`).bytes.toString('utf8');
if (!/Creative Commons Zero, CC0/i.test(halloweenLicenseText)) {
  throw new Error('KayKit Halloween Bits license does not confirm CC0');
}

for (const repo of Object.values(repos)) {
  const key = Object.entries(repos).find(([, entry]) => entry === repo)?.[0];
  const license = sourceRecords.get(`${key}/${repo.license.path}`).bytes;
  await mkdir(dirname(join(gameDir, repo.licenseOutput)), { recursive: true });
  await writeFile(join(gameDir, repo.licenseOutput), license);
}

const outputRecords = new Map();
async function writeDocument(output, document) {
  await document.transform(prune(), dedup(), weld(), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
  const bytes = Buffer.from(await io.writeBinary(document));
  const outputPath = join(gameDir, output);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, bytes);
  const record = { bytes: bytes.byteLength, sha256: sha256(bytes) };
  outputRecords.set(output, record);
  console.log(`${output} ${record.bytes} bytes ${record.sha256}`);
}

async function readEnvironmentDocument(job) {
  const source = sourceRecords.get(`${job.repo}/${job.path}`).bytes;
  if (!job.path.endsWith('.gltf')) return io.readBinary(source);
  const json = JSON.parse(source.toString('utf8'));
  const references = [...(json.buffers ?? []), ...(json.images ?? [])]
    .map((entry) => entry.uri)
    .filter((uri) => typeof uri === 'string' && !uri.startsWith('data:'));
  const resources = {};
  for (const uri of new Set(references)) {
    const path = join(dirname(job.path), uri);
    const key = `${job.repo}/${path}`;
    if (!sourceRecords.has(key)) sourceRecords.set(key, await sourceBytes({ repo: job.repo, path }));
    resources[uri] = sourceRecords.get(key).bytes;
  }
  return io.readJSON({ json, resources });
}

for (const job of characters) {
  const input = sourceRecords.get(`${job.repo}/${job.path}`).bytes;
  const document = await io.readBinary(input);
  for (const animation of [...document.getRoot().listAnimations()]) disposeAnimation(animation);
  await writeDocument(job.output, document);
}

for (const job of animations) {
  const input = sourceRecords.get(`${job.repo}/${job.path}`).bytes;
  const document = await io.readBinary(input);
  const root = document.getRoot();
  const allowed = new Set(job.clips);
  const available = new Set(root.listAnimations().map((animation) => animation.getName()));
  const missing = job.clips.filter((name) => !available.has(name));
  if (missing.length) throw new Error(`Missing clips in ${job.path}: ${missing.join(', ')}`);
  for (const animation of [...root.listAnimations()]) {
    if (!allowed.has(animation.getName())) disposeAnimation(animation);
  }
  const removedChannels = removeDefaultAnimationChannels(document);
  for (const animation of root.listAnimations()) {
    if (animation.listChannels().length === 0) {
      throw new Error(`Animation became empty after removing bind-pose tracks: ${animation.getName()}`);
    }
  }
  for (const node of root.listNodes()) node.setMesh(null).setSkin(null);
  for (const mesh of [...root.listMeshes()]) mesh.dispose();
  for (const skin of [...root.listSkins()]) skin.dispose();
  console.log(`${job.output}: removed ${removedChannels} bind-pose animation channels`);
  await document.transform(resample());
  await writeDocument(job.output, document);
}

for (const job of environment) {
  const input = sourceRecords.get(`${job.repo}/${job.path}`).bytes;
  const document = await io.readBinary(input);
  await writeDocument(job.output, document);
}

for (const job of forestEnvironment) {
  const input = sourceRecords.get(`${job.repo}/${job.path}`).bytes;
  const document = await io.readBinary(input);
  await writeDocument(job.output, document);
}

for (const job of halloweenEnvironment) {
  const document = await readEnvironmentDocument(job);
  await writeDocument(job.output, document);
}

const m1AudioFiles = [
  'assets/audio/sword-swing.ogg',
  'assets/audio/impact.ogg',
  'assets/audio/enemy-death.ogg',
  'assets/audio/door-open.ogg',
  'assets/audio/coins.ogg',
  'assets/audio/boss-roar-substitute.ogg',
  'assets/audio/footstep.ogg',
  'assets/audio/ui-click.ogg',
  'assets/audio/potion.ogg',
  'assets/audio/confirm.ogg',
  'assets/audio/hub-bgm.ogg',
  'assets/audio/combat-bgm.ogg',
  'assets/audio/fire-crackle.ogg',
  'assets/audio/crossbow-shot.ogg',
  'assets/audio/spell-cast.ogg',
  'assets/audio/spell-fire.ogg',
  'assets/audio/spell-frost.ogg',
  'assets/audio/spell-blink.ogg',
  'assets/audio/spell-summon.ogg',
  'assets/audio/shield-clang.ogg',
  'assets/audio/boss-telegraph.ogg',
  'assets/audio/level-up.ogg',
  'assets/audio/forest-bgm.ogg',
  'assets/audio/castle-bgm.ogg',
  'assets/audio/sanctuary-bgm.ogg',
];
for (const file of m1AudioFiles) {
  const bytes = await readFile(join(gameDir, file));
  outputRecords.set(file, { bytes: bytes.byteLength, sha256: sha256(bytes) });
}

const vendorDir = join(gameDir, 'vendor/three-0.187.0');
const threeFiles = [
  'three.module.min.js',
  'three.core.min.js',
  'addons/loaders/GLTFLoader.js',
  'addons/utils/SkeletonUtils.js',
  'addons/utils/BufferGeometryUtils.js',
  'addons/libs/meshopt_decoder.module.js',
  'LICENSE',
];
const vendorRecords = [];
for (const file of threeFiles) {
  const bytes = await readFile(join(vendorDir, file));
  vendorRecords.push({ file: `vendor/three-0.187.0/${file}`, bytes: bytes.byteLength, sha256: sha256(bytes) });
}

const m0LoadedFiles = [
  'assets/chars/Knight.glb',
  'assets/chars/Barbarian.glb',
  'assets/chars/Rogue_Hooded.glb',
  'assets/chars/Mage.glb',
  'assets/anims/humanoid.glb',
  ...HUB_ARENA.props.map((prop) => prop.model),
  ...(HUB_ARENA.npcs ?? []).map((npc) => `assets/chars/${npc.model === 'knight' ? 'Knight' : npc.model}.glb`),
].filter((file, index, files) => files.indexOf(file) === index);
const m0LoadedBytes = m0LoadedFiles.reduce((sum, file) => sum + outputRecords.get(file).bytes, 0);
if (m0LoadedBytes > budgetBytes) {
  throw new Error(`M0 assets exceed budget: ${m0LoadedBytes} > ${budgetBytes}`);
}
const m1CommonFiles = [
  'assets/chars/Knight.glb',
  'assets/chars/Barbarian.glb',
  'assets/chars/Rogue_Hooded.glb',
  'assets/chars/Mage.glb',
  'assets/chars/Skeleton_Minion.glb',
  'assets/chars/Skeleton_Warrior.glb',
  'assets/chars/Skeleton_Mage.glb',
  'assets/chars/Skeleton_Rogue.glb',
  'assets/anims/humanoid.glb',
  'assets/anims/skeleton.glb',
];
const m1StageArenas = { 'inn-hub': HUB_ARENA, ...STAGES };
const m1SharedAudioFiles = m1AudioFiles.filter((file) => !file.endsWith('-bgm.ogg'));
const m1MusicFile = (stageId, arena) => `assets/audio/${
  stageId === 'inn-hub' ? 'hub-bgm'
    : arena.region === 2 ? 'forest-bgm'
      : arena.region === 3 ? 'castle-bgm' : 'combat-bgm'
}.ogg`;
const m1StageLoadedFiles = Object.fromEntries(Object.entries(m1StageArenas).map(([stageId, arena]) => [
  stageId,
  stageId === 'inn-hub'
    ? [...new Set([...m0LoadedFiles, ...m1SharedAudioFiles, m1MusicFile(stageId, arena)])]
    : [...new Set([
      ...m1CommonFiles,
      ...arena.props.map((prop) => prop.model),
      ...m1SharedAudioFiles,
      m1MusicFile(stageId, arena),
    ])],
]));
const m1LoadedFiles = [...new Set(Object.values(m1StageLoadedFiles).flat())];
const m1StageLoadedBytes = Object.fromEntries(Object.entries(m1StageLoadedFiles).map(([stageId, files]) => [
  stageId,
  files.reduce((sum, file) => sum + outputRecords.get(file).bytes, 0),
]));
const m1AssetBudgetBytes = 4.5 * 1024 * 1024;
if (Math.max(...Object.values(m1StageLoadedBytes)) > m1AssetBudgetBytes) {
  throw new Error(`M1 assets exceed budget: ${JSON.stringify(m1StageLoadedBytes)}`);
}
const forestStageIds = Object.values(STAGES).filter((stage) => stage.region === 2).map((stage) => stage.id);
const forestAssetBudgetBytes = 4.5 * 1024 * 1024;
const forestStageLoadedBytes = Object.fromEntries(forestStageIds.map((stageId) => [stageId, m1StageLoadedBytes[stageId]]));
if (Math.max(...Object.values(forestStageLoadedBytes)) > forestAssetBudgetBytes) {
  throw new Error(`M3b forest assets exceed budget: ${JSON.stringify(forestStageLoadedBytes)}`);
}
const castleStageIds = Object.values(STAGES).filter((stage) => stage.region === 3).map((stage) => stage.id);
const castleAssetBudgetBytes = 4.5 * 1024 * 1024;
const castleStageLoadedBytes = Object.fromEntries(castleStageIds.map((stageId) => [stageId, m1StageLoadedBytes[stageId]]));
if (Math.max(...Object.values(castleStageLoadedBytes)) > castleAssetBudgetBytes) {
  throw new Error(`M3c castle assets exceed budget: ${JSON.stringify(castleStageLoadedBytes)}`);
}

const manifestFiles = Object.fromEntries(
  [...outputRecords.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([file, record]) => [file, record.bytes]),
);
const manifestHashes = Object.fromEntries(
  [...outputRecords.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([file, record]) => [file, record.sha256]),
);
await writeFile(
  join(assetDir, 'manifest.json'),
  `${JSON.stringify({
    generatedAt: now,
    files: manifestFiles,
    sha256: manifestHashes,
    m0LoadedFiles,
    m0LoadedBytes,
    m0BudgetBytes: budgetBytes,
    m1LoadedFiles,
    m1StageLoadedFiles,
    m1StageLoadedBytes,
    m1AssetBudgetBytes,
    forestStageLoadedBytes,
    forestAssetBudgetBytes,
    castleStageLoadedBytes,
    castleAssetBudgetBytes,
  }, null, 2)}\n`,
);

const ledgerSections = [];
for (const [repoId, repo] of Object.entries(repos)) {
  const licenseRecord = sourceRecords.get(`${repoId}/${repo.license.path}`);
  const licenseText = licenseRecord.bytes.toString('utf8')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+$/u, ''))
    .join('\n')
    .trim();
  const rows = jobs
    .filter((job) => job.repo === repoId)
    .map((job) => {
      const source = sourceRecords.get(`${job.repo}/${job.path}`);
      const output = outputRecords.get(job.output);
      const modifications = job.kind === 'character'
        ? 'Removed all embedded animations; pruned unused data; quantized and EXT_meshopt-compressed.'
        : job.kind === 'environment'
          ? 'Pruned unused data; quantized and EXT_meshopt-compressed.'
          : `Kept only ${job.clips.length} allowlisted clips; removed meshes and skins; resampled, pruned, and EXT_meshopt-compressed.`;
      return `| \`${job.path}\` | \`${source.sha256}\` | \`${job.output}\` | \`${output.sha256}\` | ${output.bytes} | ${modifications} |`;
    });
  ledgerSections.push([
    `## ${repo.name}`,
    `- Repository: ${repo.url}`,
    `- ${repoId === 'nature' ? 'Pinned source archive SHA-256' : 'Pinned default-branch commit'}: \`${repo.commit}\``,
    ...(repoId === 'nature' ? ['- License evidence: the Nature Kit asset page lists Creative Commons CC0, and the pinned archive `License.txt` states “Creative Commons Zero, CC0”.'] : []),
    ...(repoId === 'halloween' ? ['- License evidence: the official KayKit Halloween Bits asset page lists CC0; the pinned official GitHub archive `Assets/LICENSE.txt` states “License: (Creative Commons Zero, CC0).”'] : []),
    `- Download date: ${now}`,
    `- License copy: [\`${repo.licenseOutput}\`](./${repo.licenseOutput})`,
    `- Source license SHA-256: \`${licenseRecord.sha256}\``,
    '',
    '```text',
    licenseText,
    '```',
    '',
    '| Source path | Source SHA-256 | Output path | Output SHA-256 | Bytes | Modifications |',
    '| --- | --- | --- | --- | ---: | --- |',
    ...rows,
  ].join('\n'));
}

const threeTarballUrl = 'https://registry.npmjs.org/three/-/three-0.187.0.tgz';
const threeTarballSha256 = 'ff540832ded0cfe919764d24a3d88f3e2a05f23303f876423e4f893841e90728';
const existingLedger = await readFile(join(gameDir, 'assets-ledger.md'), 'utf8').catch(() => '');
const preservedM1Ledger = existingLedger.includes('\n## Vendored M1 audio')
  ? `\n## Vendored M1 audio${existingLedger.split('\n## Vendored M1 audio')[1].split('\n## M1 stage asset budget')[0]}`
  : '';
const preservedM3cAudioLedger = existingLedger.includes('\n## M3c sanctuary audio')
  ? `\n## M3c sanctuary audio${existingLedger.split('\n## M3c sanctuary audio')[1]}`
  : '';
const ledger = [
  '# Asset ledger',
  '',
  'Runtime assets are vendored locally; there are no hotlinks or runtime fetches outside this origin. Only CC0 and MIT assets are used. Quaternius QAL content is not used.',
  '',
  ...ledgerSections,
  '## Three.js',
  '- License: MIT (license text at [`vendor/three-0.187.0/LICENSE`](./vendor/three-0.187.0/LICENSE)).',
  '- Version: `0.187.0`.',
  `- Tarball: ${threeTarballUrl}`,
  `- Tarball SHA-256: \`${threeTarballSha256}\``,
  `- Download date: ${now}. Build minified the npm ` + '`three.module.js`' + ' and `three.core.js` with Terser, rewrote the core relative import, and copied the four required addons unchanged.',
  '',
  '| Output path | SHA-256 | Bytes |',
  '| --- | --- | ---: |',
  ...vendorRecords.map((record) => `| \`${record.file}\` | \`${record.sha256}\` | ${record.bytes} |`),
  '',
  '## M0 arena load budget',
  '',
  `The M0 GLB load set totals **${m0LoadedBytes.toLocaleString('en-US')} bytes** (${(m0LoadedBytes / 1024 / 1024).toFixed(2)} MiB) against a 5 MiB budget.`,
  '',
  ...m0LoadedFiles.map((file) => `- \`${file}\`: ${outputRecords.get(file).bytes.toLocaleString('en-US')} bytes`),
  '',
  '',
  '## M1 stage asset budget',
  '',
  `Loaded runtime assets: ${Object.entries(m1StageLoadedBytes).map(([stageId, bytes]) => `${stageId} ${bytes.toLocaleString('en-US')} bytes`).join('; ')}. The per-stage limit is ${m1AssetBudgetBytes.toLocaleString('en-US')} bytes.`,
  '',
  '## M3b forest stage asset budget',
  '',
  `Loaded runtime assets: ${Object.entries(forestStageLoadedBytes).map(([stageId, bytes]) => `${stageId} ${bytes.toLocaleString('en-US')} bytes`).join('; ')}. The per-stage limit is ${(forestAssetBudgetBytes / 1024 / 1024).toFixed(1)} MiB.`,
].join('\n') + preservedM1Ledger + preservedM3cAudioLedger;
await writeFile(join(gameDir, 'assets-ledger.md'), ledger);

console.log(`M0 loaded assets: ${m0LoadedBytes} / ${budgetBytes} bytes`);
console.log(`M1 stage assets: ${JSON.stringify(m1StageLoadedBytes)} / ${m1AssetBudgetBytes} bytes each`);
