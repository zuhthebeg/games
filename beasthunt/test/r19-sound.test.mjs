import {VERSION} from '../js/net/protocol.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {WeaponSoundView} from '../js/weapon-sound.js';
import {Sim} from '../js/sim.js';
import {QUESTS,WTYPES} from '../js/data.js';
const player=(weapon,id='local')=>({id,weapon,state:'idle',t:0,x:0,z:0});
const recorder=()=>{const calls=[];return {calls,v:new WeaponSoundView((name,o)=>calls.push({name,...o}))};};
function stub(failDecode=false){
 const sources=[],oscillators=[];let serial=0;
 const param=()=>({value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}});
 const node=()=>({gain:param(),frequency:param(),Q:param(),playbackRate:param(),connect(){},disconnect(){this.disconnected=true;},start(){},stop(){this.stopped=true;}});
 class AC {constructor(){this.currentTime=0;this.state='running';this.sampleRate=24000;this.destination={};}
 createGain(){return node();}createOscillator(){const n=node();oscillators.push(n);return n;}
 createBuffer(){return {getChannelData:()=>new Float32Array(24000)};}
 createBufferSource(){const n=node();sources.push(n);return n;}createBiquadFilter(){return node();}
 async decodeAudioData(){if(failDecode)throw Error('decode failure');return {duration:.4,id:++serial};}}
 return {AC,sources,oscillators};
}
const settle=()=>new Promise(r=>setTimeout(r,0));
let importId=0;
async function fresh(st,fetcher){globalThis.window={AudioContext:st.AC};globalThis.fetch=fetcher;return import('../js/audio.js?r19test='+importId++);}
test('R19 boot and init fetch zero; each selection preloads only its own used approved pool',async()=>{
 for(const weapon of ['db','bow']){const requests=[],st=stub(),a=await fresh(st,async(u,o)=>{requests.push([u,o]);return {ok:true,arrayBuffer:async()=>new ArrayBuffer(4)};});
 assert.equal(requests.length,0);a.initAudio();assert.equal(requests.length,0);await a.preloadWeapon(weapon);
 assert.equal(requests.length,weapon==='db'?4:3);for(const [u,o] of requests){assert.ok(u.includes('/weapons/'+weapon+'_'));assert.equal(o.priority,'low');assert.ok(!u.includes('gs_'));assert.ok(!u.includes('db_clink'));}
 await a.preloadWeapon(weapon);assert.equal(requests.length,weapon==='db'?4:3);
 assert.deepEqual(Object.fromEntries(Object.entries(a.WEAPON_SAMPLES).map(([k,v])=>[k,v.length])),{db_swing:3,db_hit:1,db_clink:3,bow_release:1,bow_flight:1,bow_hit:1});}
});
test('R19 404 and decode failure immediately synthesize and cache failure once per URL',async()=>{
 for(const failure of ['404','decode']){const st=stub(failure==='decode');let fetches=0;const a=await fresh(st,async()=>{fetches++;return {ok:failure!=='404',status:404,arrayBuffer:async()=>new ArrayBuffer(4)};});a.initAudio();
 assert.equal(a.sfx('bow_release'),'fallback');assert.ok(st.oscillators.length>0,'fallback not awaiting fetch/decode');await settle();
 assert.equal(a.sfx('bow_release'),'fallback');await settle();assert.equal(fetches,1);a.stopAllGS();assert.ok(st.sources.every(s=>s.stopped));}
});
test('R19 mute, master zero, shared GS/DB/BOW budget, no repeat and stop all',async()=>{
 const st=stub(),a=await fresh(st,async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(4)}));a.initAudio();await a.preloadWeapon('db');await a.preloadWeapon('bow');await a.preloadGS();
 a.setMuted(true);assert.equal(a.sfx('db_swing'),'inactive');a.setMuted(false);a.setVolume(0);assert.equal(a.sfx('bow_release'),'inactive');assert.equal(st.sources.length,0);a.setVolume(.5);
 assert.equal(a.sfx('db_hit',{volume:0}),'inactive');const random=Math.random;Math.random=()=>0;
 try{for(let i=0;i<15;i++)assert.equal(a.sfx('db_swing'),'sample');}finally{Math.random=random;}
 for(let i=1;i<st.sources.length;i++)assert.notEqual(st.sources[i].buffer,st.sources[i-1].buffer);
 for(let i=0;i<12;i++){a.sfx('gs_hit');a.sfx('db_hit');a.sfx('bow_release');}
 assert.ok(st.sources.filter(s=>!s.stopped).length<=4,'one shared cap, not per weapon');a.setMuted(true);assert.ok(st.sources.every(s=>s.stopped));a.setMuted(false);a.sfx('bow_hit');a.stopAllGS();assert.ok(st.sources.every(s=>s.stopped));
});
test('R19 actual actor hit mapping, same-tick multi-hit dedup, no monster death sample, GS untouched',()=>{
 const {v,calls}=recorder(),db=Object.freeze(player('db','db')),bow=Object.freeze(player('bow','bow')),gs=Object.freeze(player('gs','gs'));
 const h1={type:'sound',name:'hit'},h2={type:'sound',name:'hitBig'},death={type:'sound',name:'hitBig'};
 v.begin([{type:'hit',playerId:'bow'},h1,{type:'hit',playerId:'db'},h2,death]);
 assert.equal(v.event(h1,[db,bow,gs],db,10),true);assert.equal(v.event(h2,[db,bow,gs],db,10),true);v.event(h2,[db,bow,gs],db,10);v.event(death,[db,bow,gs],db,10);
 assert.deepEqual(calls.map(c=>c.name),['bow_hit','db_hit','hitBig']);
 const e={type:'sound',name:'hit',playerId:'gs'};assert.equal(v.event(e,[db,bow,gs],db,11),false);
 v.hit({...db,x:32},db,11);assert.equal(calls.length,3);v.hit({...bow,x:10},db,12);assert.equal(calls.at(-1).volume,.5);
});
test('R19 one release/flight per real projectile identity; no draw or fabricated guard',()=>{
 const {v,calls}=recorder(),bow={...player('bow'),state:'atk',cur:WTYPES.bow.light[0],t:.22},e={type:'sound',name:'shot'};
 for(let i=0;i<20;i++)v.event(e,[bow],bow,20,[{owner:bow.id,id:31}]);assert.deepEqual(calls.map(c=>c.name),['bow_release','bow_flight']);
 v.event(e,[bow],bow,21,[{owner:bow.id,id:32}]);assert.equal(calls.length,4);
 assert.equal(v.event({type:'sound',name:'charge'},[bow],bow,22),false);assert.equal(v.event({type:'guard'},[player('db')],player('db'),22),false);assert.ok(!calls.some(c=>c.name==='db_clink'));
 for(let i=0;i<1000;i++)v.shot(bow,bow,'test:'+i);assert.equal(v.seen.size,128);
});
test('R19 fresh DB swings infer unique action; remote state phase dispatch finite, attenuated and read-only',()=>{
 const {v,calls}=recorder(),listener=player('bow');let p={...player('db','remote'),x:10};v.update(Object.freeze(p),listener,true);
 p={...p,state:'atk',t:0,cur:WTYPES.db.light[0],startTick:50};v.update(Object.freeze(p),listener,true);for(let i=0;i<40;i++)v.update(Object.freeze({...p,t:i/120}),listener,true);
 assert.equal(calls.filter(c=>c.name==='db_swing').length,1);assert.equal(calls[0].volume,.5);
 p={...player('bow','r-bow'),x:10};v.update(Object.freeze(p),listener,true);p={...p,state:'atk',cur:WTYPES.bow.light[0],startTick:75};
 for(let i=0;i<60;i++)v.update(Object.freeze({...p,t:i/120}),listener,true);
 assert.equal(calls.filter(c=>c.name==='bow_release').length,1);assert.equal(calls.filter(c=>c.name==='bow_flight').length,1);
 v.prune(new Set());assert.equal(v.history.size,0);v.suspend();v.dispose();assert.equal(v.seen.size,0);
});
test('R19 real Sim DB attack/hit and BOW shot/flight/hit cues dispatch without sim/save mutation',()=>{
 for(const weapon of ['db','bow']){const save={weapon,w:{gs:1,db:1,bow:1},armor:1},s=new Sim(QUESTS[0],save,42),{v,calls}=recorder();s.p.x=0;s.p.z=s.m.z-5;s.p.yaw=0;
 for(let i=0;i<240;i++){s.step({p1:{aimYaw:0,moveZ:0,light:i%35===0,heavy:i%100===0,heavyHeld:i%100<60}});const before=JSON.stringify(s.snapshot()),original=JSON.stringify(save),events=s.drainEvents();v.begin(events);for(const e of events)if(e.type==='sound')v.event(e,s.players,s.p,s.tick,s.arrows);assert.equal(JSON.stringify(s.snapshot()),before);assert.equal(JSON.stringify(save),original);}
 for(const name of weapon==='db'?['db_swing','db_hit']:['bow_release','bow_flight','bow_hit'])assert.ok(calls.some(c=>c.name===name),name);}
});
function method(name,params,bindings={}){const src=fs.readFileSync(new URL('../js/game.js',import.meta.url),'utf8'),start=src.indexOf('  '+name+'('),brace=src.indexOf('{',start);let depth=1,i=brace+1;while(depth){if(src[i]==='{')depth++;if(src[i]==='}')depth--;i++;}return new Function(...Object.keys(bindings),'return function('+params+'){'+src.slice(brace+1,i-1)+'}')(...Object.values(bindings));}
test('R19 actual socket observer: roster actors, sequence/tick dedup, scheduled attenuation, listener cleanup (not WAN)',()=>{
 let callback,removed=0;const socket={addEventListener(n,f){callback=f;},removeEventListener(n,f){assert.equal(f,callback);removed++;}},roster={r:{save:{weapon:'bow'}}},{v,calls}=recorder(),local=player('db'),remote={...player('bow','r'),x:10};
 const ctx={localId:'local',session:{hunt:'hunt',rep:{clock:{playTick:100},hunters:new Map([['r',{sample:()=>remote}]])}},def:{parts:{head:1.25}},m:{state:'idle'},p:local,weaponSound:v,gsSound:{event(){throw Error('new weapon must not route to GS');}}};
 method('observeAudioSocket','socket,roster',{VERSION}).call(ctx,socket,roster);
 const send=(seq,hostTick=100,version=VERSION)=>callback({data:JSON.stringify({type:'rt',from:'r',data:{bh:{type:'hit',v:version,hunt:'hunt',seq,payload:{hostTick,raw:10,part:'head'}}}})});
 send(1,100,2);assert.equal(ctx.audioClaims.length,0);send(1);send(1);send(2);assert.equal(ctx.audioClaims.length,1);
 globalThis.document={hidden:false};method('remoteAudioHits','').call(ctx);assert.deepEqual(calls.map(c=>c.name),['bow_hit']);assert.equal(calls[0].volume,.5);assert.equal(ctx.audioClaims.length,0);
 send(3,101);method('remoteAudioHits','').call(ctx);assert.equal(calls.length,1);ctx.paused=true;method('remoteAudioHits','').call(ctx);assert.equal(ctx.audioClaims.length,0);ctx.detachAudio();assert.equal(removed,1);
});
test('R19 changed entry/direct imports versioned; rendering still uses both R17 visual adapters',()=>{
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),game=fs.readFileSync(new URL('../js/game.js',import.meta.url),'utf8'),main=fs.readFileSync(new URL('../js/main.js',import.meta.url),'utf8'),page=fs.readFileSync(new URL('../sfx-test.html',import.meta.url),'utf8');
 assert.ok(html.includes('audio.js?v=20261115s19'));for(const n of ['game','main'])assert.ok(html.includes(n+'.js?v=20261116r20'));assert.ok(game.includes('./weapon-sound.js?v=20261115s19'));assert.ok(page.includes('./js/audio.js?v=20261116r20'));
 assert.ok(game.includes('syncHunterBow(p,H,dt,this.clock)'));assert.ok(game.includes('syncHunterDb(p,H,dt,this.clock)'));assert.ok(main.includes("void preloadWeapon('bow')"));assert.ok(main.includes("void preloadWeapon('db')"));
});

test('R19 actual Hunt presentation routes new sounds, pause/hide/end gate them, stopAudio cleans shared voices',()=>{
 const {v,calls}=recorder(),p={...player('bow'),state:'atk',cur:WTYPES.bow.light[0],t:.22},e={type:'sound',name:'shot'};
 globalThis.document={hidden:false};const ctx={p,localId:p.id,weaponSound:v,sim:{players:[p],tick:20,arrows:[{id:100,owner:p.id}]},gsSound:{event(){throw Error('BOW shot must not enter GS adapter');}}};
 const present=method('presentEvents','events',{sfx(){},THREE:{}});present.call(ctx,[e]);assert.deepEqual(calls.map(c=>c.name),['bow_release','bow_flight']);
 for(const state of ['paused','over','hidden']){ctx.paused=state==='paused';ctx.over=state==='over';document.hidden=state==='hidden';ctx.sim.arrows[0].id++;present.call(ctx,[e]);assert.equal(calls.length,2,state+' emits no new voices');}
 ctx.paused=ctx.over=document.hidden=false;ctx.sim.arrows[0].id++;present.call(ctx,[e]);assert.equal(calls.length,4,'resume is not stuck muted');
 let stopped=0;v.history.set('remote',{});method('stopAudio','',{stopAllGS(){stopped++;}}).call(ctx);assert.equal(stopped,1);assert.equal(v.history.size,0);
});
