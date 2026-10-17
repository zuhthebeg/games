import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {MONSTERS,STAGES} from '../js/content/combat.js';
import {MONSTER_MODELS,MONSTER_VARIANTS} from '../js/content/monsters.js';
import {SPECIES_AUDIO,PROFILE_FILES,eventCues} from '../js/audio-profile.js';
import {AUDIO_FILES} from '../js/audio.js';
const dir=new URL('../assets/audio/',import.meta.url);
const json=async name=>JSON.parse(await readFile(new URL(name,dir),'utf8'));

test('all archetypes, variants, model IDs and authored spawns resolve real hit and death assets',async()=>{
 const ids=new Set([...Object.keys(MONSTERS),...Object.keys(MONSTER_VARIANTS),...MONSTER_MODELS,...Object.values(STAGES).flatMap(s=>s.spawns.map(row=>row.monster))]);
 assert.deepEqual(new Set(Object.keys(SPECIES_AUDIO)),ids);
 for(const id of ids){
  const profile=SPECIES_AUDIO[id];assert.ok(profile,`missing ${id}`);
  for(const kind of ['hit','death']){
   const name=profile[kind];assert.ok(PROFILE_FILES.includes(name),`${id}: ${name} registered`);
   assert.equal((await readFile(new URL(`${name}.ogg`,dir))).subarray(0,4).toString(),'OggS');
  }
  assert.equal(eventCues({type:'hit',src:1,dst:2},1,[{id:2,kind:'monster',type:id}])[0].name,profile.hit);
  // Entity has already disappeared: authoritative kill species still selects its own file.
  assert.equal(eventCues({type:'kill',id:2,monster:id},1,[])[0].name,profile.death);
 }
});

test('biological/stone families have independently generated cues, not generic beast pitch substitutions',()=>{
 const families=['wolf','iron_boar','bat','poison_spider','goblin_grunt','rune_guardian'];
 for(const kind of ['hit','death'])assert.equal(new Set(families.map(id=>SPECIES_AUDIO[id][kind])).size,families.length);
 for(const [id,family] of Object.entries({wolf:'wolf',iron_boar:'boar',bat:'bat',poison_spider:'spider',goblin_grunt:'goblin',rune_guardian:'stone'}))
  assert.deepEqual([SPECIES_AUDIO[id].hit,SPECIES_AUDIO[id].death],[family+'-hit',family+'-death']);
 for(const id of ['throne_dragon','training_dragon'])assert.deepEqual([SPECIES_AUDIO[id].hit,SPECIES_AUDIO[id].death],['dragon-hit','dragon-death']);
 assert.equal(SPECIES_AUDIO.slime.hit,'slime-hit');assert.equal(SPECIES_AUDIO.demon.hit,'demon-hit');
 for(const id of ['goleling','gargoyle','rune_guardian'])assert.deepEqual([SPECIES_AUDIO[id].hit,SPECIES_AUDIO[id].death],['stone-hit','stone-death']);
 for(const id of ['goblin_grunt','goblin_slinger','goblin_chief'])assert.equal(SPECIES_AUDIO[id].death,'goblin-death');
 assert.ok(!PROFILE_FILES.includes('beast-death'));assert.ok(!PROFILE_FILES.includes('goleling-death'));
});

test('every runtime Ogg (excluding the historical standalone battle preview) has one matching manifest entry, exact encoded hash and byte length',async()=>{
 const base=await json('generation.json'),profiles=await json('profiles-manifest.json');
 const entries=[...base,...profiles.clips];
 const files=(await readdir(dir)).filter(n=>n.endsWith('.ogg')&&n!=='battle-preview-1014.ogg').sort();
 assert.deepEqual(entries.map(e=>e.name).sort(),files);
 assert.deepEqual(AUDIO_FILES.map(n=>n+'.ogg').sort(),files);
 for(const e of entries){const data=await readFile(new URL(e.name,dir));assert.equal(e.bytes,data.length,e.name);assert.equal(e.outputSha256,createHash('sha256').update(data).digest('hex'),e.name);}
});

test('species metric ledger guards onset/tail/loudness, 30 cross-family comparisons and source independence',async()=>{
 const ledger=await json('species-audit.json'),manifest=await json('profiles-manifest.json');
 assert.match(ledger.auditoryJudgement,/NOT machine-verified/);
 for(const [name,m]of Object.entries(ledger.clips)){
  assert.ok(m.duration>.1&&m.duration<=1.2,name);assert.ok(m.decodedPeak>.02&&m.decodedPeak<.85,name);assert.ok(m.decodedRms>.015&&m.decodedRms<=.18,name);
  assert.ok(m.onsetMs<=30&&m.trailingSilenceMs<=65,name);assert.ok(m.centroidHz>100&&m.bandwidthHz>0,name);
  const entry=manifest.clips.find(e=>e.name===name);assert.equal(entry.outputSha256,m.outputSha256);assert.equal(entry.decodedRms,m.decodedRms);
 }
 assert.equal(Object.keys(ledger.clips).length,16);
 assert.equal(new Set(Object.values(ledger.clips).map(m=>m.outputSha256)).size,16);
 const generated=manifest.clips.filter(m=>Object.hasOwn(ledger.clips,m.name));
 assert.equal(new Set(generated.map(m=>m.sourceSha256)).size,16);
 assert.equal(new Set(generated.map(m=>m.settings.seed)).size,16);
 assert.equal(ledger.comparisons.length,30);
 for(const row of ledger.comparisons){
  assert.equal(row.passed,true,JSON.stringify(row));
  assert.ok([row.relativeCentroidDifference>=.08,row.durationDifference>=.06,row.meanEnvelopeDifference>=.08].filter(Boolean).length>=2,JSON.stringify(row));
  const a=manifest.clips.find(e=>e.name===row.a+'.ogg'),b=manifest.clips.find(e=>e.name===row.b+'.ogg');assert.notEqual(a.sourceSha256,b.sourceSha256);assert.notEqual(a.settings.seed,b.settings.seed);
  if(row.a.startsWith('wolf-')&&row.b.startsWith('stone-'))assert.ok(row.relativeCentroidDifference>=.15&&(row.durationDifference>=.12||row.meanEnvelopeDifference>=.12));
 }
});
