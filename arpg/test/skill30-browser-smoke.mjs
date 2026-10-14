import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(fileURLToPath(new URL('../../',import.meta.url))),out=process.env.ARPG_FIX_EVIDENCE||'/home/cocy/.openclaw/workspace/tmp/arpg-skill30-native.json';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const runtimePaths=execFileSync('git',['ls-files','-z','arpg'],{cwd:root,encoding:'utf8'}).split('\0').filter(p=>p&&!p.startsWith('arpg/test/')&&!p.startsWith('arpg/tools/'));
const manifest=async()=>Object.fromEntries(await Promise.all(runtimePaths.map(async p=>[p,sha(await readFile(join(root,p)))])));
const bytes=await manifest(),runnerSha256=sha(await readFile(fileURLToPath(import.meta.url)));
const binding={head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),runnerSha256,runtimeManifestSha256:sha(JSON.stringify(bytes)),runtimeFiles:runtimePaths.length};
await writeFile(out+'.bytes.json',JSON.stringify({binding,bytes},null,2)+'\n');
const port=Number(process.env.ARPG_CDP_PORT||19591),httpPort=Number(process.env.ARPG_HTTP_PORT||8991),profile=await mkdtemp(join(tmpdir(),'arpg-sl1-'));
const server=spawn('python3',['-m','http.server',String(httpPort),'--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
const chrome=spawn('/home/cocy/bin/chromium',['--headless=new','--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--disable-background-timer-throttling',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let socket,seq=0;const pending=new Map(),errors=[];
try {
 let targets;for(let i=0;i<80;i++){try{targets=await(await fetch(`http://127.0.0.1:${port}/json`)).json();}catch{}if(targets?.some(t=>t.type==='page'))break;await sleep(100);}
 assert.equal(server.exitCode,null);socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>socket.onopen=r);
 socket.onmessage=({data})=>{const d=JSON.parse(data);if(d.id){pending.get(d.id)?.(d);pending.delete(d.id);}else if(d.method==='Runtime.exceptionThrown'||d.method==='Runtime.consoleAPICalled'&&d.params.type==='error'||d.method==='Log.entryAdded'&&d.params.entry.level==='error')errors.push(d);};
 const cmd=(method,params={})=>new Promise((res,rej)=>{const id=++seq,t=setTimeout(()=>{pending.delete(id);rej(Error('timeout '+method));},20000);pending.set(id,d=>{clearTimeout(t);d.error?rej(Error(JSON.stringify(d.error))):res(d.result);});socket.send(JSON.stringify({id,method,params}));});
 const ev=async expression=>{const r=await cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
 const wait=async(expression,timeout=20000)=>{const at=Date.now();while(Date.now()-at<timeout){if(await ev(expression))return;await sleep(100);}throw Error('timeout '+expression);};
 const key=async(key,code=key)=>{await cmd('Input.dispatchKeyEvent',{type:'keyDown',key,code, ...(key==='Enter'?{windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'}:{})});await cmd('Input.dispatchKeyEvent',{type:'keyUp',key,code});};
 const activate=async(selector,mobile)=>{
  const pt=await ev(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n||n.disabled||!n.checkVisibility())throw Error('not accessible '+${JSON.stringify(selector)});n.scrollIntoView({block:'center'});n.focus({preventScroll:true});const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  if(mobile){await cmd('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[pt]});await sleep(40);await cmd('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}else await key('Enter');await sleep(100);
 };
 await cmd('Runtime.enable');await cmd('Page.enable');await cmd('Log.enable');await cmd('Emulation.setFocusEmulationEnabled',{enabled:true});
 const origin=`http://127.0.0.1:${httpPort}`;
 // Bind the server actually used by Chromium to the recovered runtime bytes.
 const served=['arpg/index.html','arpg/js/meta/skill-mastery.js','arpg/js/meta/save.js','arpg/js/debug/index.js','arpg/js/net/session.js','arpg/js/render/mastery-vfx.js','arpg/js/render/skill-vfx.js','arpg/js/render/renderer.js'];
 for(const path of served){const response=await fetch(origin+'/'+path,{signal:AbortSignal.timeout(10000)});assert.equal(response.status,200,path);assert.equal(sha(Buffer.from(await response.arrayBuffer())),bytes[path],path);}
 binding.httpByteChecks=served.length;
 // Track live canvas GL health/draws; packed RGBA words are not float vertices.
 await cmd('Page.addScriptToEvaluateOnNewDocument',{source:`window.__fixProbe={draws:0,contextLost:0,nonfinite:0};const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(...args){const gl=get.apply(this,args);if(gl&&String(args[0]).startsWith('webgl')&&!gl.__probe){gl.__probe=true;window.__fixGL=gl;this.addEventListener('webglcontextlost',()=>{if(this.isConnected)__fixProbe.contextLost++;});for(const k of ['drawElements','drawArrays']){const f=gl[k];gl[k]=function(...a){__fixProbe.draws++;return f.apply(this,a);};}}return gl;};`});
 const paletteRows=[];
 for(const mobile of [false,true]) {
  await cmd('Emulation.setDeviceMetricsOverride',{width:mobile?390:1280,height:mobile?844:800,deviceScaleFactor:1,mobile});
  await cmd('Page.navigate',{url:origin+'/arpg/test/feel-fixture.html'});await wait(`document.title==='ARPG render fixture'`);
  const result=await ev(`(async()=>{
   const {Application,Graphics,Container,RenderTexture}=await import('../vendor/pixi-8.22.0.min.mjs');
   const {MasterySkillVfx}=await import('../js/render/mastery-vfx.js');
   const app=new Application();await app.init({width:384,height:256,preference:'webgl',backgroundAlpha:0,autoStart:false});
   const v=new MasterySkillVfx(Graphics,new Container());app.stage.addChild(v.layer);v.requestSkill=()=>null;
   const freeze=o=>{for(const x of Object.values(o))if(x&&typeof x==='object')freeze(x);return Object.freeze(o);};
   const w=freeze({tick:1,entities:[{id:1,pid:'local',kind:'player',skillMasteryLevels:{ember_bolt:20},equipmentVisual:{enhance:6}}, {id:2,pid:'remote',kind:'player',skillMasteryLevels:{frost_lance:30},equipmentVisual:{enhance:9}}],projectiles:[{id:10,ownerId:1,abilityId:'ember_bolt',x:110,y:110,r:12,vx:100,vy:0},{id:11,ownerId:2,abilityId:'frost_lance',x:250,y:110,r:10,vx:100,vy:0}]});
   const before=JSON.stringify(w);for(let i=0;i<6;i++)v.update(w,1,.03,false);
   const target=RenderTexture.create({width:384,height:256});app.renderer.render({container:app.stage,target,clear:true});
   const pixels=app.renderer.extract.pixels({target}).pixels;
   let lit=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i])lit++;
   const rows=v.projectiles.filter(s=>s.id!==null).map(s=>({id:s.id,level:s.mastery.level,stage:s.mastery.stage,enhance:s.castEnhance,accent:s.mastery.accent,colors:s.node.context.instructions.map(i=>i.data.style?.color),tail:s.tail.filter(n=>n.visible).map(n=>n.tint)}));
   const unchanged=JSON.stringify(w)===before;target.destroy(true);app.destroy(true,{children:true});return {lit,rows,unchanged};
  })()`);
  assert.ok(result.lit>0);assert.ok(result.unchanged);assert.deepEqual(result.rows.map(r=>r.enhance),[6,9]);assert.deepEqual(result.rows.map(r=>r.level),[20,30]);assert.ok(result.rows[0].colors.includes(0xf08c46));assert.ok(result.rows[0].colors.includes(0xcde8ee));assert.ok(result.rows[1].colors.includes(0x9fd8ff));assert.ok(result.rows[1].colors.includes(0xbe84ff));paletteRows.push({mobile,...result});
 }
 const rows=[],before=false;
 for(const mobile of [false,true]) for(const ability of ['heavy_cleave']) for(const level of [5,10,20,30]) {
  const enhance={5:6,10:9,20:10,30:10}[level];
  await cmd('Emulation.setDeviceMetricsOverride',{width:mobile?390:1280,height:mobile?844:800,deviceScaleFactor:1,mobile});await cmd('Emulation.setTouchEmulationEnabled',{enabled:mobile,maxTouchPoints:1});
  await cmd('Page.navigate',{url:origin+'/arpg/?dev=1'});await wait('window.__arpg');
  await ev(`(async()=>{const {createSave,SaveStore}=await import('./js/meta/save.js'),{trained}=await import('./test/fixtures/trained.js'),{learnSkill,setSlot}=await import('./js/meta/skills.js'),{instance}=await import('./js/meta/items.js'),{setMasteryLevel}=await import('./js/meta/skill-mastery.js');let s=trained(createSave({name:'Freeze',weapon:'blade',answers:[0,0,0,0,0],createdAt:1}));s.gold=100000;if(${JSON.stringify(ability)}==='ground_slam'){s.items.push(instance('test:maul','chief_maul',0,[]));s.equipped.weapon='test:maul';}s=learnSkill(s,${JSON.stringify(ability)});s=setSlot(s,'blade',0,${JSON.stringify(ability)});s=setMasteryLevel(s,${JSON.stringify(ability)},${level});s.items.find(x=>x.uid===s.equipped.weapon).enhance=${enhance};s.stacks.mana_potion=5;localStorage.setItem('arpg.autoAttack','0');new SaveStore(localStorage).save(s);})()`);
  await cmd('Page.reload');await wait(`document.querySelector('#meta-screen').dataset.page==='inn'`);
  // Check actual Pixi vector API coordinates, not binary color data reinterpreted as NaN.
  await ev(`(async()=>{const {Graphics}=await import('./vendor/pixi-8.22.0.min.mjs');const check=a=>{if(typeof a==='number'&&!Number.isFinite(a))__fixProbe.nonfinite++;else if(Array.isArray(a))a.forEach(check);};for(const name of ['arc','circle','poly','moveTo','lineTo','rect','ellipse','quadraticCurveTo']){const original=Graphics.prototype[name];Graphics.prototype[name]=function(...args){args.forEach(check);return original.apply(this,args);};}})()`);
  await activate('[data-action="trainer"]',mobile);
  const label=await ev(`document.querySelector('[data-mastery="${ability}"]').closest('article,li,div').textContent`);
  assert.ok(label.includes(ability==='heavy_cleave'?'내려찍기':'대지 강타'),label);assert.ok(label.includes('Lv'+level),label);
  await activate('[data-action="inn"]',mobile);await activate('[data-action="board"]',mobile);await activate('[data-action="sortie"][data-stage="S1"]',mobile);await activate('[data-action="launch"]',mobile);await wait(`__arpg.world?.round.stageId==='S1'&&__arpg.world.entities.some(e=>e.type==='scarecrow')`);
  // Native movement only; no runtime-world writes. Position one hit-range away from S1's stationary dummy.
  for(const axis of ['y','x']) {
   const state=await ev(`(()=>{const w=__arpg.world,p=w.entities[0],m=w.entities.find(e=>e.type==='scarecrow');return {p:p.${axis},target:m.${axis}${axis==='x'?'-75':''},speed:p.speed};})()`);
   const delta=state.target-state.p;if(Math.abs(delta)<8)continue;
   const sign=Math.sign(delta),duration=Math.min(4000,Math.abs(delta)/state.speed*1000);
   if(mobile){const pt={x:70,y:510};await cmd('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[pt]});await cmd('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:pt.x+(axis==='x'?sign*42:0),y:pt.y+(axis==='y'?sign*42:0)}]});await sleep(duration);await cmd('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
   else{const code=axis==='x'?(sign>0?'KeyD':'KeyA'):(sign>0?'KeyS':'KeyW');await cmd('Input.dispatchKeyEvent',{type:'keyDown',key:code.slice(-1).toLowerCase(),code});await sleep(duration);await cmd('Input.dispatchKeyEvent',{type:'keyUp',key:code.slice(-1).toLowerCase(),code});}
  }
  const start=await ev(`({tick:__arpg.world.tick,mp:__arpg.world.entities[0].mp,count:__arpg.tracker.skillMastery?.${ability}||0,probe:{...__fixProbe},positions:__arpg.world.entities.map(e=>({id:e.id,type:e.type,x:e.x,y:e.y}))})`);
  const offset=errors.length;
  await activate('#skill',mobile);await sleep(1700);
  const finish=await ev(`({tick:__arpg.world.tick,mp:__arpg.world.entities[0].mp,count:__arpg.tracker.skillMastery?.${ability}||0,act:__arpg.world.entities[0].act?.id||null,probe:{...__fixProbe},glLost:__fixGL.isContextLost(),glError:__fixGL.getError(),finite:__arpg.world.entities.every(e=>[e.x,e.y,e.hp,e.mp??0].every(Number.isFinite)),feedback:JSON.parse(JSON.stringify(__arpg.feedback.mastery))})`);
  const row={mobile,ability,level,enhance,label,start,finish,errors:errors.slice(offset),navigation:mobile?'native touch + joystick':'native keyboard',screenshots:0};rows.push(row);await writeFile(out,JSON.stringify({binding,baseline:before,paletteRows,rows,errors},null,2)+'\n');
  if(!before){assert.equal(row.errors.length,0,JSON.stringify(row));assert.ok(finish.count>start.count,'actual enemy hit '+JSON.stringify(row));assert.ok(finish.tick>start.tick+35,'fixed sim advances');assert.ok(finish.probe.draws>start.probe.draws,'render advances');assert.equal(finish.probe.nonfinite,0);assert.equal(finish.probe.contextLost,0);assert.equal(finish.glLost,false);assert.equal(finish.glError,0);assert.ok(finish.finite);assert.equal(finish.act,null);const path=finish.feedback.paths[ability];assert.equal(path.level,level);assert.equal(path.stage,1+Math.floor(level/5));assert.equal(path.enhance,enhance);}
 }
 if(before){assert.equal(rows[0].errors.length,0);assert.ok(rows[1].errors.some(e=>JSON.stringify(e).includes("reading 'arc'")),'pre-fix native null-shape failure');}
 assert.equal(errors.length,0,JSON.stringify(errors.slice(0,3)));
 assert.deepEqual(await manifest(),bytes,'runtime changed during native proof');binding.runtimeUnchanged=true;
 await writeFile(out,JSON.stringify({binding,baseline:before,paletteRows,rows,errors},null,2)+'\n');
 console.log(JSON.stringify({binding,paletteCases:paletteRows.length,cases:rows.length,baseline:before,errors:errors.length,screenshots:0,evidence:out}));
} finally {socket?.close();chrome.kill('SIGKILL');server.kill('SIGKILL');await sleep(250);await rm(profile,{recursive:true,force:true});}
