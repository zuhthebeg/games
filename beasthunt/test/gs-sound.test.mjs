import {test} from 'node:test';
import assert from 'node:assert/strict';
import {gsSoundName,GSSoundView,soundVolume} from '../js/gs-sound.js';
const p={id:'a',weapon:'gs',x:0,z:0,state:'idle',t:0,st:100};
test('all existing events remap and db/bow remain unchanged',()=>{
 const expected={hit:'gs_hit',hitBig:'gs_hit',weak:'gs_hit_weak',break:'gs_hit_part',charge:'gs_charge_1',roll:'gs_roll'};
 for(const [name,to]of Object.entries(expected)){assert.equal(gsSoundName(name,p),to);for(const weapon of ['db','bow'])assert.equal(gsSoundName(name,{...p,weapon}),name);}
 for(const combo of [0,1,2,3,4,-1])assert.equal(gsSoundName('swingH',{...p,combo}),combo===3?'gs_swing_b':combo===4?'gs_swing_spin':combo===-1?'gs_charge_release':'gs_swing_light');
 for(let clv=1;clv<=3;clv++)assert.equal(gsSoundName('charge',{...p,clv}),'gs_charge_'+clv);
});
test('guard, remote stages/release/slam and distance; input immutable',()=>{
 const calls=[],stops=[],v=new GSSoundView((n,o)=>calls.push([n,o]),k=>stops.push(k));
 v.event({type:'guard',broken:false},p,p);v.event({type:'guard',broken:true},p,p);
 v.update(Object.freeze({...p}),p,true);v.update(Object.freeze({...p,state:'charge',clv:1,t:.5}),p,true);v.update(Object.freeze({...p,state:'charge',clv:3,t:1.5}),p,true);v.update(Object.freeze({...p,state:'atk',combo:-1,t:0}),p,true);v.slam(p,p,2);
 for(const n of ['gs_guard_block','gs_guard_break','gs_charge_1','gs_charge_2','gs_charge_3','gs_charge_release','gs_slam'])assert.ok(calls.some(c=>c[0]===n),n);
 assert.ok(stops.includes('gs-charge:a'));const before=calls.length;v.emit('gs_hit',{...p,x:50},p);assert.equal(calls.length,before);assert.equal(soundVolume({...p,x:32},p),0);
});
function stub(){let oscillators=0,sources=[];const param=()=>({value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}});const node=()=>({gain:param(),frequency:param(),Q:param(),playbackRate:param(),connect(){},disconnect(){},start(){},stop(){this.stopped=true;}});class AC{constructor(){this.state='running';this.currentTime=0;this.sampleRate=24000;this.destination={};}createGain(){return node();}createOscillator(){oscillators++;return node();}createBuffer(){return {getChannelData:()=>new Float32Array(8000)};}createBufferSource(){const s=node();sources.push(s);return s;}createBiquadFilter(){return node();}async decodeAudioData(){return {duration:.4};}}return {AC,get oscillators(){return oscillators;},sources};}
test('AudioContext stub: pre-init safe, lazy cache, 404 fallback, mute, variants and cap',async()=>{
 const st=stub();globalThis.window={AudioContext:st.AC};let fetches=0;globalThis.fetch=async()=>{fetches++;return {ok:false,status:404};};
 const a=await import('../js/audio.js?test='+Date.now());assert.equal(a.sfx('gs_hit'),'inactive');assert.equal(fetches,0);a.initAudio();assert.equal(a.sfx('gs_hit',{variant:0}),'fallback');await new Promise(r=>setTimeout(r,0));assert.equal(a.sfx('gs_hit',{variant:0}),'fallback');assert.equal(fetches,1);assert.ok(st.oscillators>0);a.setMuted(true);assert.equal(a.sfx('gs_hit'),'inactive');a.setMuted(false);
 globalThis.fetch=async()=>{fetches++;return {ok:true,arrayBuffer:async()=>new ArrayBuffer(8)};};await a.preloadGS();
 const random=Math.random;Math.random=()=>0;for(let i=0;i<10;i++)a.sfx('gs_slam');Math.random=random;
 const sampled=st.sources.filter(s=>s.buffer&&s.buffer.duration);for(let i=1;i<sampled.length;i++)assert.notEqual(sampled[i].buffer,sampled[i-1].buffer,'no immediate variant repeat');assert.ok(st.sources.filter(s=>s.buffer&&s.buffer.duration&&!s.stopped).length<=4);
 a.setMuted(true);assert.equal(a.sfx('gs_slam'),'inactive');a.setMuted(false);a.stopAllGS();assert.equal(st.sources.filter(s=>s.buffer&&s.buffer.duration&&!s.stopped).length,0);
});

test('remote B/charge moves without combo plus guard first observed drop and loop pruning',()=>{
 assert.equal(gsSoundName('swingH',{...p,cur:{sw:'other'}}),'gs_swing_b');assert.equal(gsSoundName('swingH',{...p,cur:{charge:1.5}}),'gs_charge_release');
 const names=[],stops=[],v=new GSSoundView(n=>names.push(n),k=>stops.push(k));v.update({...p,state:'atk'},p,true);v.update({...p,state:'guard',st:70},p,true);assert.ok(names.includes('gs_guard_block'));
 v.update({...p,state:'charge'},p,true);v.update({...p,state:'charge',x:40,t:.5},p,true);assert.ok(stops.includes('gs-charge:a'));v.prune(new Set());assert.equal(v.history.size,0);
});

test('actual Hunt presentEvents routes AudioContext-stub compatible sound adapter',async()=>{
 const {readFile}=await import('node:fs/promises');const src=await readFile(new URL('../js/game.js',import.meta.url),'utf8');
 const start=src.indexOf('  presentEvents('),brace=src.indexOf('{',start);let depth=1,i=brace+1;while(depth){if(src[i]==='{')depth++;if(src[i]==='}')depth--;i++;}
 const method=new Function('sfx','THREE','return function(events){'+src.slice(brace+1,i-1)+'}');
 const calls=[],player={...p,state:'atk',combo:3,t:0},ctx={localId:'a',p:player,sim:{players:[player]},gsSound:new GSSoundView((n,o)=>calls.push(n),()=>{}),ui:{}};
 method(()=>{},{}).call(ctx,[{type:'sound',name:'swingH'},{type:'sound',name:'hitBig'},{type:'guard',playerId:'a',broken:true}]);assert.deepEqual(calls,['gs_swing_b','gs_hit','gs_guard_break']);
});
