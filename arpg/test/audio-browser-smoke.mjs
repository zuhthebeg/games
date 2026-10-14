// Audio-only native smoke: real Chromium, real gesture/context/Ogg decoder; no full game suite/screenshots.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const root=fileURLToPath(new URL('../../',import.meta.url));
const html=`<!doctype html><div id="meta-screen"></div><button id="gesture">unlock</button>
<script type="module">
import {CombatAudio,bindAudioControls,AUDIO_FILES} from '/arpg/js/audio.js';
window.makeAudio=(options={})=>{const a=new CombatAudio(options);const played=[];const play=a.play.bind(a);a.play=(name,opts)=>{const time=a.context?.currentTime;const ok=play(name,opts);played.push({name,time,ok});return ok};a.played=played;return a};
window.a=makeAudio();bindAudioControls(a,document);window.files=AUDIO_FILES;window.ready=true;
</script>`;
const server=createServer(async(req,res)=>{try{
 if(req.url==='/audio-smoke'){res.setHeader('Content-Type','text/html');return res.end(html);}
 const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));if(!path.startsWith(root))throw Error('path');
 res.setHeader('Content-Type',extname(path)==='.js'?'text/javascript':extname(path)==='.ogg'?'audio/ogg':'application/octet-stream');res.end(await readFile(path));
}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try {
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/home/cocy/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/audio-smoke`);await page.waitForFunction(()=>window.ready);
 assert.equal(await page.evaluate(()=>a.context),null);
 await page.click('#gesture');await page.waitForFunction(()=>a.context?.state==='running'&&a.buffers.size===files.length);
 const result=await page.evaluate(async()=>{
  const check=(v,label)=>{if(!v)throw Error(label)};
  const count=()=>a.played.filter(x=>x.ok).length;
  const e=Object.freeze([Object.freeze({id:1,kind:'player',weaponForm:'sword'}),Object.freeze({id:2,kind:'monster',type:'skeleton_warrior'})]);
  a.stop();a.played.length=0;a.events([{type:'perfectDodge',id:1}],1,e);check(a.played.at(-1).name==='perfect-dodge','perfect');
  a.stop();a.events([{type:'counter',id:1},{type:'dodge',id:2}],1,e);check(count()===1,'no counter act payoff');
  const hit={type:'hit',src:1,dst:2,ability:'slash'};
  a.events([{...hit,counter:true}],1,e);check(a.played.at(-1).name==='counter-hit'&&a.played.at(-1).ok,'counter hit');
  const counterTime=a.played.at(-1).time;check(a.context.currentTime-counterTime<.04,'same event frame');
  a.stop();a.events([{...hit,crit:true}],1,e);check(a.played.slice(-2).every(x=>x.name!=='counter-hit'),'noncounter critical');
  a.stop();a.events([hit,hit,hit],1,e);check(a.voices.size===2,'volley cooldown');
  a.stop();const pitches=[];for(const type of ['skeleton_minion','skeleton_warrior','skeleton_rogue','skeleton_mage']){a.events([hit],1,[{id:2,kind:'monster',type}]);pitches.push([...a.voices][0].playbackRate.value);a.stop();}check(new Set(pitches).size===4,'species pitches');
  a.setMuted(true);check(a.voices.size===0&&!a.play('hit'),'mute');check(makeAudio().muted,'remember mute');a.setMuted(false);
  const fallback=makeAudio({storage:null,fetchAudio:async url=>String(url).endsWith('/hit.ogg')?fetch(url):({ok:false})});await fallback.unlock();fallback.events([hit],1,e);check(fallback.voices.size===1,'missing profile generic fallback');
  const offline=makeAudio({storage:null,fetchAudio:async()=>{throw Error('offline')}});await offline.unlock();offline.events([hit],1,e);check(offline.voices.size===0,'offline');
  fallback.stop();await fallback.context.close();await offline.context.close();
  const offlineMix=new OfflineAudioContext(1,48000,48000),bus=offlineMix.createGain(),limiter=offlineMix.createDynamicsCompressor();
  bus.gain.value=a.master.gain.value;
  for(const key of ['threshold','knee','ratio','attack','release'])limiter[key].value=a.limiter[key].value;
  bus.connect(limiter);limiter.connect(offlineMix.destination);
  for(const name of ['counter-hit','blunt-impact','bone-hit','critical','fire-impact','ice-impact']){const voice=offlineMix.createBufferSource();voice.buffer=a.buffers.get(name);voice.connect(bus);voice.start(0);}
  const rendered=await offlineMix.startRendering();let mixPeak=0;for(const value of rendered.getChannelData(0))mixPeak=Math.max(mixPeak,Math.abs(value));check(mixPeak<.95,'six voice mix headroom');
  const durations=Object.fromEntries([...a.buffers].map(([k,v])=>[k,v.duration]));
  a.stop();await a.context.close();return {state:'PASS',decoded:files.length,pitches,counterTime,mixPeak,durations,played:a.played,physicalListening:false};
 });
 assert.deepEqual(errors,[]);console.log(JSON.stringify({...result,consoleErrors:errors},null,2));
} finally {await browser?.close();await new Promise(r=>server.close(r));}
