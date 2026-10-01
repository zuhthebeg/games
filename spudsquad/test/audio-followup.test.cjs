const { test } = require('node:test');
const a = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), crypto = require('node:crypto');
const source = fs.readFileSync(require.resolve('../js/sfx.js'),'utf8');
function harness() {
  const events={}, voices=[], urls=[]; let context;
  const param=()=>({value:0,setValueAtTime(){},exponentialRampToValueAtTime(){},setTargetAtTime(){}});
  const node=()=>({gain:param(),connect(){},disconnect(){}});
  class AudioContext {
    constructor(){context=this;this.currentTime=0;this.sampleRate=24000;this.destination={};this.state='running';}
    createGain(){return node();}
    createDynamicsCompressor(){return {...node(),threshold:param(),knee:param(),ratio:param(),attack:param(),release:param()};}
    decodeAudioData(){return Promise.resolve({duration:.2});}
    createBufferSource(){const s={playbackRate:param(),connect(){},disconnect(){},start(){voices.push(s);},stop(){s.stopped=true;s.onended?.();}};return s;}
    createBuffer(_n,length,rate){return {duration:length/rate,getChannelData:()=>new Float32Array(length)};}
    createBiquadFilter(){return {frequency:param(),Q:param(),connect(){},disconnect(){}};}
    createOscillator(){return {frequency:param(),connect(){},start(){},stop(){}};}
    resume(){}
  }
  const window={AudioContext,addEventListener:(name,fn)=>events[name]=fn};
  vm.runInNewContext(source,{window,localStorage:{getItem(){return null;},setItem(){}},fetch:async url=>{urls.push(url);return {ok:true,arrayBuffer:async()=>new ArrayBuffer(4)};},setTimeout(){},console});
  events.pointerdown();
  return {sfx:window.SPUD.sfx,voices,urls,get ctx(){return context;}};
}
test('SMG cadence rejects same-frame bursts and bounds overlapping gun sample voices',async()=>{
  const q=harness();await new Promise(r=>setImmediate(r));q.voices.length=0;
  for(let i=0;i<30;i++)q.sfx('w:smg');a.equal(q.voices.length,1,'one short shot per allowed interval');
  for(let i=0;i<12;i++){q.ctx.currentTime+=.091;q.sfx('w:smg');}
  a.ok(q.voices.filter(v=>!v.stopped).length<=3,'maximum 3 active firearm voices');
  a.ok(q.voices.some(v=>v.stopped),'old tails stopped under overload');
});
test('per-sound gain/cadence and SFX/music controls stay independent',async()=>{
  const q=harness();await new Promise(r=>setImmediate(r));q.voices.length=0;
  q.sfx('w:smg');q.sfx('w:crossbow');q.sfx('hurt');a.equal(q.voices.length,3);
  q.sfx.music('battle');const music=q.voices.at(-1);a.equal(music.loop,true);
  for(let i=0;i<12;i++){q.ctx.currentTime+=.1;q.sfx('w:smg');}a.equal(music.stopped,undefined);
  const before=q.voices.length;q.sfx.mute();q.sfx('w:smg');a.equal(q.voices.length,before);
  q.sfx.mute();q.sfx.volume(0);q.ctx.currentTime+=1;q.sfx('w:crossbow');a.equal(q.voices.length,before);
  a.ok(q.urls.every(url=>url.includes('20261001b')),'new asset cache version');
});
const oldHashes = {
  smg:'caf07d266b23fb58885baa7f1b9f72c799ee4e4316ff243159b9e244d7229b2d',pistol:'b5b029b1b5c1f7b30c72866f84cfd60867bc3d74929ac116cc5d7c841c15dbc6',shotgun:'f4ae67e972464169fef5f9645cb5757241f23ff8273c71c91060d4494b976c8f',bow:'676826d45cd1462e37dbc9922d365e4b9e67e5a9a04dcd66c4bdde8491fe3d34'
};
for(const [name,oldHash] of Object.entries(oldHashes))test(`${name}: actual asset bytes changed, not only volume`,()=>{
  const bytes=fs.readFileSync(require.resolve('../assets/audio/sfx_'+name+'.mp3'));
  a.notEqual(crypto.createHash('sha256').update(bytes).digest('hex'),oldHash);
});
