import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(fileURLToPath(new URL('../../',import.meta.url))),out=process.env.ARPG_SL1_EVIDENCE||'/home/cocy/.openclaw/workspace/tmp/arpg-sl1-evidence';
await mkdir(out,{recursive:true});
const port=Number(process.env.ARPG_CDP_PORT||19571),httpPort=Number(process.env.ARPG_HTTP_PORT||8971),profile=await mkdtemp(join(tmpdir(),'arpg-sl1-'));
const server=spawn('python3',['-m','http.server',String(httpPort),'--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
const chrome=spawn('/home/cocy/bin/chromium',['--headless=new','--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--disable-background-timer-throttling',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let socket,seq=0;const pending=new Map(),errors=[];
try {
 let targets;for(let i=0;i<80;i++){try{targets=await(await fetch(`http://127.0.0.1:${port}/json`)).json();}catch{}if(targets?.some(t=>t.type==='page'))break;await sleep(100);}
 assert.equal(server.exitCode,null);socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>socket.onopen=r);
 socket.onmessage=({data})=>{const d=JSON.parse(data);if(d.id){pending.get(d.id)?.(d);pending.delete(d.id);}else if(d.method==='Runtime.exceptionThrown'||d.method==='Runtime.consoleAPICalled'&&d.params.type==='error'||d.method==='Log.entryAdded'&&d.params.entry.level==='error')errors.push(d);};
 const cmd=(method,params={})=>new Promise((res,rej)=>{const id=++seq,t=setTimeout(()=>{pending.delete(id);rej(Error('timeout '+method));},120000);pending.set(id,d=>{clearTimeout(t);d.error?rej(Error(JSON.stringify(d.error))):res(d.result);});socket.send(JSON.stringify({id,method,params}));});
 const ev=async expression=>{const r=await cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
 const wait=async(expression,timeout=20000)=>{const at=Date.now();while(Date.now()-at<timeout){if(await ev(expression))return;await sleep(100);}throw Error('timeout '+expression);};
 const key=async(key,code=key)=>{await cmd('Input.dispatchKeyEvent',{type:'keyDown',key,code, ...(key==='Enter'?{windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'}:{})});await cmd('Input.dispatchKeyEvent',{type:'keyUp',key,code});};
 const activate=async(selector,mobile)=>{
  const pt=await ev(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n||n.disabled||!n.checkVisibility())throw Error('not accessible '+${JSON.stringify(selector)});n.scrollIntoView({block:'center'});n.focus({preventScroll:true});const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  if(mobile){await cmd('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[pt]});await sleep(40);await cmd('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}else await key('Enter');await sleep(100);
 };
 await cmd('Runtime.enable');await cmd('Page.enable');await cmd('Log.enable');await cmd('Emulation.setFocusEmulationEnabled',{enabled:true});
 const origin=`http://127.0.0.1:${httpPort}`;
 await cmd('Page.navigate',{url:origin+'/arpg/test/feel-fixture.html'});await wait(`document.title==='ARPG render fixture'`);
 const pixels=await ev(`(async()=>{const {masteryPixels}=await import('./skill-mastery-pixel-probe.js');return masteryPixels();})()`);
 await writeFile(join(out,'pixels.json'),JSON.stringify(pixels,null,2)+'\n');
 for(const row of pixels){assert.equal(row.outside,0,JSON.stringify(row));assert.ok(row.edgePixels>0,JSON.stringify(row));}
 for(const id of new Set(pixels.map(r=>r.id))){const rows=pixels.filter(r=>r.id===id);for(const row of rows.slice(1))assert.ok(row.fullLit>rows[0].fullLit,JSON.stringify(rows));}
 for(const level of [1,3,5])assert.equal(new Set(pixels.filter(r=>r.level===level).map(r=>r.mask)).size,12,'skill masks must differ at Lv'+level);
 if(process.env.ARPG_PIXELS_ONLY==='1'){console.log(JSON.stringify({pixels:36,consoleErrors:errors.length,screenshots:0}));}
 else {
 const smoke=[];
 for(const mobile of [false,true]){
  await cmd('Emulation.setDeviceMetricsOverride',{width:mobile?390:1280,height:mobile?844:800,deviceScaleFactor:1,mobile});await cmd('Emulation.setTouchEmulationEnabled',{enabled:mobile,maxTouchPoints:1});
  await cmd('Page.navigate',{url:origin+'/arpg/?dev=1'});await wait('window.__arpg && document.querySelector("#arpg-debug-toggle")');
  await ev(`(async()=>{const {createSave,SaveStore}=await import('./js/meta/save.js'),{trained}=await import('./test/fixtures/trained.js'),{learnSkill,setSlot}=await import('./js/meta/skills.js');let s=trained(createSave({name:'SL1',weapon:'focus',answers:[0,0,0,0,0],createdAt:1}));s.gold=100000;s.cleared.S1=true;s=learnSkill(s,'frost_lance');s=setSlot(s,'focus',0,'frost_lance');localStorage.setItem('arpg.autoAttack','0');new SaveStore(localStorage).save(s);})()`);
  await cmd('Page.reload');await wait(`document.querySelector('#meta-screen').dataset.page==='inn' && document.querySelector('#arpg-debug-toggle')`);
  await activate('[data-action="settings"]',mobile);assert.equal(await ev(`document.querySelector('#meta-screen').textContent.includes('스킬 이펙트')`),false);assert.equal(await ev(`document.querySelectorAll('[data-action="set-fx"]').length`),0);
  await activate('[data-action="inn"]',mobile);await activate('[data-action="trainer"]',mobile);await activate('[data-action="academy-tab"][data-family="focus"]',mobile);
  assert.equal(await ev(`document.querySelector('[data-mastery="frost_lance"]').textContent`),'숙련: Lv1 (0/30)');
  await activate('[data-action="inn"]',mobile);await activate('[data-action="board"]',mobile);await activate('[data-action="sortie"][data-stage="S2"]',mobile);await activate('[data-action="launch"]',mobile);await wait('__arpg.world?.round.stageId==="S2"');
  await activate('[data-battle-settings]',mobile);assert.equal(await ev(`document.querySelector('#battle-settings').textContent.includes('스킬 이펙트')`),false);await activate('[data-battle-settings]',mobile);
  const paths=[];
  for(const level of [1,3,5]){
   await activate('#arpg-debug-toggle',mobile);
   // Native select keyboard events (also after touch navigation on the mobile viewport).
   await ev(`(()=>{const n=document.querySelector('[data-debug-mastery="frost_lance"]');n.scrollIntoView({block:'center'});n.focus();})()`);
   await key('Home');for(let n=1;n<level;n++)await key('ArrowDown');await key('Enter');
   await wait(`(__arpg.save.skillMastery.frost_lance||0)===${[0,30,100,250,500][level-1]}`);await activate('#arpg-debug-toggle',mobile);
   await sleep(2700);if(mobile)await activate('#skill',true);else await key('k','KeyK');
   await wait(`__arpg.feedback.mastery.paths.frost_lance?.level===${level}`);
   const path=await ev('__arpg.feedback.mastery.paths.frost_lance');assert.equal(path.path,level===1?'classic':'classic-enhanced');paths.push(path);
  }
  const counted=await ev('__arpg.tracker.skillMastery?.frost_lance||0');
  if(mobile)await activate('#scroll',true);else await key('r','KeyR');
  await wait(`__arpg.save.lastReceipt?.terminal==='return_scroll'`);
  assert.equal(await ev('__arpg.save.skillMastery.frost_lance'),500+counted);
  await activate('[data-action="result-inn"]',mobile);
  await activate('[data-action="trainer"]',mobile);await activate('[data-action="academy-tab"][data-family="focus"]',mobile);
  assert.equal(await ev(`document.querySelector('[data-mastery="frost_lance"]').textContent`),'숙련: Lv5 (최대)');
  await activate('[data-action="inn"]',mobile);await activate('[data-action="character"]',mobile);await activate('[data-action="character-tab"][data-tab="skills"]',mobile);
  await activate('[data-action="skill-detail"][data-id="frost_lance"]',mobile);
  assert.ok(await ev(`document.querySelector('dialog[open]').textContent.includes('숙련: Lv5 (최대)')`));
  smoke.push({viewport:mobile?'390x844':'1280x800',navigation:mobile?'native touch':'native keyboard',masterySelect:'native keyboard',paths,settingsOptionAbsent:true,academyAndDetail:true,returnSavedCount:500+counted});
 }
 const fallbacks=[];
 for(const mode of ['classic','reduced']) {
  await cmd('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:mode==='reduced'?'reduce':'no-preference'}]});
  await cmd('Page.navigate',{url:origin+'/arpg/?dev=1'+(mode==='classic'?'&fx=classic':'')});
  await wait(`document.querySelector('#meta-screen').dataset.page==='inn'`);
  await activate('[data-action="board"]',true);await activate('[data-action="sortie"][data-stage="S2"]',true);await activate('[data-action="launch"]',true);
  await wait('__arpg.world?.round.stageId==="S2"');await activate('#skill',true);await wait('__arpg.feedback.mastery.paths.frost_lance');
  const path=await ev('__arpg.feedback.mastery.paths.frost_lance');assert.equal(path.path,'classic');assert.equal(path.level,5);assert.equal(path.extraParticles,0);fallbacks.push({mode,path});
 }
 await writeFile(join(out,'smoke.json'),JSON.stringify({smoke,fallbacks,consoleErrors:errors.length,screenshots:0},null,2)+'\n');assert.equal(errors.length,0,JSON.stringify(errors.slice(0,3)));console.log(JSON.stringify({pixels:36,smoke,consoleErrors:0,screenshots:0},null,2));
 }
} finally {socket?.close();chrome.kill('SIGKILL');server.kill('SIGKILL');await sleep(250);await rm(profile,{recursive:true,force:true});}
