// Ordinary /arpg/, isolated valid persisted fixture; no debug routes or world mutation.
// Re-run after publishing: ARPG_BASE_URL=https://game.cocy.io node arpg/test/species-audio-browser-smoke.mjs
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {createSave,validateSave,SAVE_KEY} from '../js/meta/save.js';
import {trained} from './fixtures/trained.js';
const root=resolve(process.env.ARPG_REPO_ROOT||fileURLToPath(new URL('../../',import.meta.url)));
const base=(process.env.ARPG_BASE_URL||'http://127.0.0.1:8938').replace(/\/$/,'');
const output=process.env.ARPG_AUDIO_EVIDENCE||'/home/cocy/.openclaw/workspace/tmp/arpg-sound-source/native-audio-local.json';
const remote=!!process.env.ARPG_BASE_URL;
const sha=b=>createHash('sha256').update(b).digest('hex');
const report={status:'RUNNING',base,remote,ordinaryPage:true,rows:[],sourceBinding:{},errors:[],screenshots:0,existingUserStorage:0,runtimeWorldWrites:0,physicalListening:false};
let browser,server;
try{
 if(!remote){server=spawn('python3',['-m','http.server','8938','--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});await new Promise((r,j)=>{server.once('error',j);setTimeout(r,250)});assert.equal(server.exitCode,null);}
 const html=await(await fetch(base+'/arpg/')).text();const map=JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
 const audioUrl=new URL(map['./js/audio.js'],base+'/arpg/').href;
 for(const path of ['arpg/js/audio-profile.js','arpg/js/audio.js']){const url=new URL(map['./'+path.slice(5)],base+'/arpg/'),r=await fetch(url),bytes=Buffer.from(await r.arrayBuffer());assert.equal(r.status,200);assert.deepEqual(bytes,await readFile(root+'/'+path));report.sourceBinding[path]={url:url.href,sha256:sha(bytes)};}
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/home/cocy/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
 for(const width of [1280,390])for(const [stage,species,family] of [['S11','wolf','wolf'],['S9','rune_guardian','stone']]){
  const mobile=width===390,context=await browser.newContext({viewport:{width,height:844},isMobile:mobile,hasTouch:mobile});
  const seed=trained(createSave({name:'음원 검증',weapon:'blade',answers:[0,0,0,0,0],createdAt:1}),30);
  for(const id of Object.keys(seed.cleared)){seed.cleared[id]=true;seed.stageThreat[id]=1;}seed.flags.chiefPity=true;assert.equal(validateSave(seed),true);
  await context.addInitScript(({key,seed})=>localStorage.setItem(key,JSON.stringify(seed)),{key:SAVE_KEY,seed});
  await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());
  const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>report.errors.push(e.message));
  const requests=[],checks=[];
  page.on('response',r=>{if(/\/assets\/audio\//.test(r.url())){requests.push({url:r.url(),status:r.status()});if(new RegExp(`/(${family}-hit|${family}-death)\\.ogg$`).test(r.url()))checks.push((async()=>{const b=await r.body(),path=new URL(r.url()).pathname;assert.deepEqual(b,await readFile(root+path));return {url:r.url(),sha256:sha(b),bytes:b.length};})());}});
  const press=async selector=>{const el=page.locator(selector).first();console.log('native action',width,stage,selector);await el.scrollIntoViewIfNeeded();if(mobile)await el.tap();else{await el.focus();await page.keyboard.press('Enter');}};
  await page.goto(base+'/arpg/');await page.waitForFunction(()=>window.__arpg);
  await press('[data-action="choose-human"]');await page.locator('#inn-name').waitFor();
  await page.evaluate(async url=>{
   const {CombatAudio}=await import(url);window.__soundProbe={events:[],plays:[]};
   const originalEvents=CombatAudio.prototype.events,originalPlay=CombatAudio.prototype.play;
   CombatAudio.prototype.events=function(events,localId,entities){window.__soundProbe.events.push(...events.map(e=>({...e,species:e.monster??entities.find(x=>x.id===e.dst)?.type})));return originalEvents.call(this,events,localId,entities)};
   CombatAudio.prototype.play=function(name,opts){const buffer=this.buffers.get(name),ok=originalPlay.call(this,name,opts);window.__soundProbe.plays.push({name,ok,state:this.context?.state,contextSampleRate:this.context?.sampleRate,duration:buffer?.duration,sampleRate:buffer?.sampleRate,channels:buffer?.numberOfChannels});return ok};
  },audioUrl);
  await press('[data-action="board"]');await press(`[data-action="map-region"][data-region="${stage==='S11'?'swamp':'pass'}"]`);await press(`[data-action="sortie"][data-stage="${stage}"]`);await press('#sortie-confirm');
  await page.waitForFunction(stage=>__arpg.world?.round?.stageId===stage&&__arpg.feedback.audio.state==='running',stage);
  assert.ok(!new URL(page.url()).searchParams.has('dev')&&!new URL(page.url()).searchParams.has('debug'));
  const cdp=await context.newCDPSession(page),joy={x:70,y:480,id:1};let touching=false,held=new Set();
  await press('[data-battle-settings]');await press('#battle-auto-on');await press('[data-battle-settings]'); // Native preference UI, no simulation writes.
  const deadline=Date.now()+60000;
  while(Date.now()<deadline){
   const state=await page.evaluate(()=>({world:__arpg.world,probe:__soundProbe}));
   const played=state.probe.plays.filter(p=>p.ok).map(p=>p.name);
   if(played.includes(family+'-hit')&&played.includes(family+'-death'))break;
   const p=state.world.entities.find(e=>e.kind==='player');assert.ok(!p.dead,'valid fixture survives approach');
   const m=state.world.entities.find(e=>e.type===species&&!e.dead);let mx=0,my=0;
   if(m){const dx=m.x-p.x,dy=m.y-p.y,d=Math.hypot(dx,dy);if(d>55){mx=dx/d;my=dy/d;}}
   if(mobile){if(!touching){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[joy]});touching=true;}await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...joy,x:joy.x+mx*42,y:joy.y+my*42}]});}
   else{const next=new Set([...(mx<-.2?['KeyA']:mx>.2?['KeyD']:[]),...(my<-.2?['KeyW']:my>.2?['KeyS']:[])]);for(const k of held)if(!next.has(k))await page.keyboard.up(k);for(const k of next)if(!held.has(k))await page.keyboard.down(k);held=next;}
   await page.waitForTimeout(100);
  }
  for(const k of held)await page.keyboard.up(k);if(touching)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
  const probe=await page.evaluate(()=>__soundProbe),plays=probe.plays.filter(p=>p.ok&&(p.name===family+'-hit'||p.name===family+'-death'));
  for(const kind of ['hit','death']){assert.ok(plays.some(p=>p.name===family+'-'+kind),`native ${width} ${stage} ${kind}`);assert.ok(probe.events.some(e=>e.type===(kind==='hit'?'hit':'kill')&&e.species===species),'real confirmed species event');}
  assert.ok(plays.every(p=>p.state==='running'&&p.sampleRate===p.contextSampleRate&&p.sampleRate>=44100&&p.channels===1&&p.duration>.1));
  assert.ok(requests.every(r=>r.status===200));const exactBytes=await Promise.all(checks);assert.equal(exactBytes.length,2);assert.deepEqual(report.errors,[]);
  report.rows.push({width,stage,species,nativeInput:mobile?'touch joystick + native UI taps':'keyboard Enter/WASD',fixtureValidated:true,url:page.url(),plays,events:probe.events.filter(e=>e.species===species&&['hit','kill'].includes(e.type)),exactBytes,requests});
  console.log('native species audio PASS',width,stage,plays.map(p=>p.name));await context.close();
 }
 report.status='PASS';
}catch(e){report.status='FAIL';report.failure=e.stack;process.exitCode=1;}
finally{await browser?.close();server?.kill();await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,rows:report.rows.length,output,failure:report.failure}));}
