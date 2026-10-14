import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CombatAudio, AUDIO_FILES } from '../js/audio.js';
import { SPECIES_AUDIO, PROFILE_FILES, eventCues } from '../js/audio-profile.js';
import { MONSTER_MODELS } from '../js/content/monsters.js';
import { FEEL } from '../js/render/feel.js';
import { createWorld, addPlayer, spawnMonster, step, emptyInput } from '../js/sim/world.js';
import { encodeSnapshot, decodeSnapshot } from '../js/net/protocol.js';
class Context {
  constructor(){this.state='suspended';this.currentTime=0;this.started=[];}
  createGain(){return {gain:{value:0},connect(){},disconnect(){}};}
  async resume(){this.state='running';}
  async decodeAudioData(bytes){return {bytes};}
  createBufferSource(){const v={playbackRate:{value:1},connect(){},disconnect(){},start:()=>this.started.push(v),stop:()=>v.onended?.()};return v;}
}
const entities=Object.freeze([Object.freeze({id:1,kind:'player',weaponForm:'sword'}),Object.freeze({id:2,kind:'monster',type:'skeleton_warrior'})]);
const hit={type:'hit',src:1,dst:2,ability:'slash'};
function audio(options={}) {return new CombatAudio({Context,storage:null,random:()=>.5,fetchAudio:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(1)}),...options});}
test('all species identities are exact current content IDs; skeleton pitch differs and missing guest metadata stays generic',()=>{
 assert.ok(Object.keys(SPECIES_AUDIO).every(id=>MONSTER_MODELS.includes(id)));
 assert.equal(new Set(['minion','warrior','rogue','mage'].map(s=>SPECIES_AUDIO['skeleton_'+s].pitch)).size,4);
 for(const type of ['skeleton_minion','skeleton_warrior','skeleton_rogue','skeleton_mage','ghoul','ghost']) {
  const result=eventCues(hit,1,[{id:2,kind:'monster',type}])[0];assert.equal(result.name,SPECIES_AUDIO[type].hit);assert.equal(result.pitch,SPECIES_AUDIO[type].pitch);
 }
 assert.equal(eventCues(hit,1)[0].name,'hit');
 assert.equal(eventCues({...hit,crit:true},1)[0].name,'critical');
 assert.equal(eventCues(hit,1,[{id:2,type:'skeleton_warrior'}])[0].name,'hit');
 assert.equal(eventCues({type:'kill',monster:'unknown_succubus'},1)[0].name,'kill');
 assert.equal(eventCues({type:'kill',monster:'ghost'},1)[0].name,'ghost-death');
});
test('six actual skill families, blunt form, launch/impact separation, no windup repeat',()=>{
 const kinds={slash:'blade',ground_slam:'blunt',arrow:'bow',ember_bolt:'fire',frost_lance:'ice',healing_light:'heal'};
 for(const [ability,family] of Object.entries(kinds)) {
  const ev=ability==='healing_light'?{type:'healCast',id:1,ability}:{type:'act',id:1,ability};
  assert.equal(eventCues(ev,1,entities)[0].name,family+'-cast');
  const he=family==='heal'?{type:'heal',src:1,dst:1,ability}:{...hit,ability};
  assert.ok(eventCues(he,1,entities).some(c=>c.name===family+'-impact'));
 }
 assert.equal(eventCues({type:'act',id:1,ability:'slash'},1,[{id:1,kind:'player',weaponForm:'blunt'}])[0].name,'blunt-cast');
 for(const type of ['windup','active','counter','miss'])assert.deepEqual(eventCues({type,id:1,ability:'slash'},1,entities),[]);
 assert.deepEqual(eventCues({type:'act',id:1,ability:'healing_light'},1,entities),[]);
 assert.deepEqual(eventCues({type:'act',id:3,ability:'slash'},1,entities),[]);
 assert.equal(eventCues({...hit,src:99},1,entities).length,1);
});
test('perfect dodge and confirmed local counter hit are independent; crit/exposed/remote/incoming are never payoff',()=>{
 assert.equal(eventCues({type:'perfectDodge',id:1},1)[0].name,'perfect-dodge');
 assert.equal(eventCues({...hit,counter:true},1,entities)[0].name,'counter-hit');
 for(const e of [{...hit,crit:true},{...hit,exposed:true},{...hit,counter:1},{...hit,counter:true,src:3},{...hit,counter:true,dst:1}])
  assert.ok(!eventCues(e,1,entities).some(c=>c.name==='counter-hit'));
});
test('mock AudioContext preserves cap/cooldown, counter priority, species pitch, current-time start, mute and fallback',async()=>{
 const a=audio();assert.equal(a.context,null);await a.unlock();
 a.events([hit,hit,hit],1,entities);assert.equal(a.context.started.length,2);
 assert.equal(a.context.started[0].playbackRate.value,.88);
 a.stop();for(let i=0;i<FEEL.audio.voices;i++){a.context.currentTime+=.03;a.play('hit');}
 assert.equal(a.voices.size,FEEL.audio.voices);a.events([{...hit,counter:true}],1,entities);
 assert.equal(a.voices.size,FEEL.audio.voices);assert.equal(a.context.started.at(-1).buffer,a.buffers.get('counter-hit'));
 const before=a.context.started.length;a.events([{...hit,counter:true}],1,entities);assert.equal(a.context.started.length,before);
 a.setMuted(true);assert.equal(a.voices.size,0);assert.equal(a.play('hit'),false);a.setMuted(false);
 a.buffers.delete('bone-hit');a.events([hit],1,entities);assert.equal(a.context.started.at(-2).buffer,a.buffers.get('hit'));
 const b=audio({fetchAudio:async()=>{throw Error('offline');}});await b.unlock();assert.equal(b.buffers.size,0);b.events([hit],1,entities);
 const c=audio({Context:class extends Context {async decodeAudioData(){throw Error('codec');}}});await c.unlock();assert.equal(c.buffers.size,0);
});
test('reads frozen entities without touching world RNG and derives exact solo/guest real counter events',async()=>{
 for(const weapon of ['blade','bow','focus']) {
  const w=createWorld({seed:72}),p=addPlayer(w,{pid:'a',weapon,x:400,y:400}),m=spawnMonster(w,'skeleton_warrior',610,400);
  w.round={stageId:'S1',state:'combat',t:0,goal:999,timerTicks:0,threat:0,pending:[]};
  m.spawnLeft=0;m.staggerLeft=9999;m.hp=m.maxHp=10000;
  w.projectiles.push({id:w.nextId++,team:m.team,ownerId:m.id,ownerKind:m.kind,ownerType:m.type,abilityId:'sling_stone',x:425,y:400,vx:0,vy:0,r:8,travelled:0,range:560,pierce:0,hit:[],dmgMult:1,poiseMult:1});
  const events=step(w,{a:{...emptyInput(),dodgeEdge:true,mx:1}});assert.ok(events.some(e=>e.type==='perfectDodge'));
  const rows=[];
  for(let i=0;i<60;i++) {const es=step(w);for(const e of es){const guest=decodeSnapshot(encodeSnapshot(w),'a');
    assert.deepEqual(eventCues(e,p.id,w.entities),eventCues(e,p.id,guest.entities));
    if(e.type==='hit'&&e.counter) rows.push(e);
  }}
  assert.equal(rows.length,1);assert.equal(eventCues(rows[0],p.id,w.entities)[0].name,'counter-hit');
  const rng=w.rng;const a=audio();await a.unlock();a.events(rows,p.id,Object.freeze(w.entities.map(e=>Object.freeze({id:e.id,kind:e.kind,type:e.type,weaponForm:e.weaponForm}))));assert.equal(w.rng,rng);
 }
 assert.doesNotThrow(()=>eventCues(hit,1,entities));
});
test('every profile clip is documented local Ogg with bounded peak/duration and fade, no synthetic CC0 claim',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../assets/audio/profiles-manifest.json',import.meta.url),'utf8'));
 assert.match(manifest.modelLicenseEvidence,/not asserted CC0/);assert.equal(manifest.clips.length,PROFILE_FILES.length);
 for(const name of PROFILE_FILES){const m=manifest.clips.find(e=>e.name===name+'.ogg');assert.ok(m.sourceSha256);assert.ok(m.decodedPeak<.85&&m.duration<=1.2&&m.duration>.1);assert.equal(m.sampleRate,48000);assert.equal(m.channels,1);assert.equal(m.endFadeMs,40);
  assert.equal((await readFile(new URL('../assets/audio/'+name+'.ogg',import.meta.url))).subarray(0,4).toString(),'OggS');}
 assert.equal(new Set(AUDIO_FILES).size,AUDIO_FILES.length);
 const counter=manifest.clips.find(c=>c.name==='counter-hit.ogg');const blunt=manifest.clips.find(c=>c.name==='blunt-impact.ogg');assert.ok(counter.decodedRms<=blunt.decodedRms*1.25);
});
