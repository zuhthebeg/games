// Ordinary /arpg/, native keyboard/touch, legitimate S9/S19 persisted fixtures.
// Never mutates runtime world, simulation, camera, save belonging to a real user or debug controls.
import {chromium} from '/home/cocy/.openclaw/workspace/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../..',import.meta.url)),port=Number(process.env.ARPG_GOLEM_PORT||8972),base=`http://127.0.0.1:${port}`;
const out=process.env.ARPG_GOLEM_EVIDENCE||'/home/cocy/.openclaw/workspace/tmp/arpg-golem-crystal-native.json';
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
const browser=await chromium.launch({executablePath:'/home/cocy/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
const report={status:'RUNNING',url:base+'/arpg/',rows:[],errors:[],sourceBinding:{},screenshots:0,existingUserStorage:0,runtimeWorldWrites:0};
try{
 for(let i=0;i<40;i++){try{if((await fetch(base+'/arpg/')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}assert.equal(server.exitCode,null);
 for(const path of ['arpg/js/render/atlas-state.js','arpg/js/render/atlas-visual.js','arpg/assets/sprites/manifest.json']){const local=await readFile(root+'/'+path),served=Buffer.from(await(await fetch(base+'/'+path)).arrayBuffer());assert.deepEqual(served,local);report.sourceBinding[path]=createHash('sha256').update(local).digest('hex');}
 const manifest=JSON.parse(await readFile(root+'/arpg/assets/sprites/manifest.json'));
 for(const kit of manifest.filter(k=>['rune-guardian','spirit'].includes(k.id)))for(const file of kit.sheets){
  const sheetPath=`arpg/assets/sprites/${kit.id}/${file}`,sheet=JSON.parse(await readFile(root+'/'+sheetPath));
  for(const path of [sheetPath,`arpg/assets/sprites/${kit.id}/${sheet.meta.image}`]){
   const local=await readFile(root+'/'+path),served=Buffer.from(await(await fetch(base+'/'+path)).arrayBuffer());assert.deepEqual(served,local);report.sourceBinding[path]=createHash('sha256').update(local).digest('hex');
  }
 }
 for(const width of [1280,390])for(const stage of ['S9','S19']){
  const mobile=width===390,ctx=await browser.newContext({viewport:{width,height:844},isMobile:mobile,hasTouch:mobile,reducedMotion:'reduce'}),page=await ctx.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>report.errors.push(e.message));
  await page.route('**/www.googletagmanager.com/**',r=>r.fulfill({body:''}));
  const requests=[];page.on('response',r=>{if(/assets\/sprites\/(rune-guardian|spirit)\//.test(r.url()))requests.push({url:r.url(),status:r.status()});});
  const press=async selector=>{const n=page.locator(selector).first();await n.scrollIntoViewIfNeeded();if(mobile)await n.tap();else{await n.focus();await page.keyboard.press('Enter');}};
  await page.goto(base+'/arpg/');await page.waitForFunction(()=>window.__arpg);
  const fixture=await page.evaluate(async()=>{
   const {createSave,validateSave,SaveStore}=await import('./js/meta/save.js'),{trained}=await import('./test/fixtures/trained.js');
   const s=trained(createSave({name:'돌과 수정 여정',weapon:'blade',answers:[0,0,0,0,0],createdAt:1}),30);
   for(const id of Object.keys(s.cleared)){s.cleared[id]=true;s.stageThreat[id]=1;}s.flags.chiefPity=true;
   if(!validateSave(s))throw Error('invalid isolated stage fixture');new SaveStore(localStorage).save(s);
   return{level:s.level,cleared:s.cleared,valid:true};
  });
  await page.reload();await press('[data-action="choose-human"]');await page.locator('#inn-name').waitFor();
  assert.equal(requests.length,0,'no monster prefetch in hub');
  await press('[data-action="board"]');await press(`[data-action="map-region"][data-region="${stage==='S9'?'pass':'castle'}"]`);await press(`[data-action="sortie"][data-stage="${stage}"]`);await press('#sortie-confirm');
  await page.waitForFunction(stage=>__arpg.world?.round?.stageId===stage&&__arpg.world.tick>0,stage);
  assert.ok(!new URL(page.url()).searchParams.has('debug')&&!new URL(page.url()).searchParams.has('dev'));
  const started=await page.evaluate(()=>({tick:__arpg.world.tick,entities:__arpg.world.entities.map(e=>({type:e.type,kind:e.kind})),art:__arpg.art}));
  assert.ok(started.tick<60,'observe guardian before the real 2000ms spirit spawn');
  if(started.tick<60){assert.ok(!started.entities.some(e=>e.type==='spirit'));assert.ok(!started.art.loaded.includes('spirit'));assert.ok(!requests.some(r=>r.url.includes('/spirit/')),'no future-spawn spirit sheet request');}
  const cdp=await ctx.newCDPSession(page),seen={},states={rune_guardian:new Set(),spirit:new Set()};let held=new Set(),touching=false;
  const joy={x:70,y:480,id:1},deadline=Date.now()+45000;
  while(Date.now()<deadline){
   const state=await page.evaluate(()=>({world:__arpg.world,art:__arpg.art,viewport:{w:innerWidth,h:innerHeight}})),w=state.world,p=w.entities.find(e=>e.kind==='player');assert.ok(!p.dead,'stage fixture survives native approach');
   for(const key of ['rune_guardian','spirit']){
    const v=state.art.visuals.find(v=>v.key===key&&v.mode==='atlas'&&v.textureLoaded),e=w.entities.find(e=>e.type===key&&!e.dead);
    if(v)states[key].add(v.state);
    if(!v||!e||!v.geometry)continue;assert.equal(v.id,key==='rune_guardian'?'rune-guardian':'spirit');assert.equal(v.scale,e.sizeScale||1);
    const b=v.geometry.bounds,visible=b.x>0&&b.y>0&&b.x+b.width<width&&b.y+b.height<844;
    if(visible&&b.width>60&&b.height>60){seen[key]={tick:w.tick,entity:{id:e.id,type:e.type,r:e.r,sizeScale:e.sizeScale,x:e.x,y:e.y},visual:v,distance:Math.hypot(e.x-p.x,e.y-p.y),viewport:state.viewport};}
   }
   if(Object.keys(seen).length===2)break;
   const needed=['rune_guardian','spirit'].find(k=>!seen[k]),target=w.entities.find(e=>e.type===needed&&!e.dead)||w.entities.find(e=>e.type==='rune_guardian'&&!e.dead);
   let mx=0,my=0;if(target){const dx=target.x-p.x,dy=target.y-p.y,d=Math.hypot(dx,dy);if(d>125){mx=dx/d;my=dy/d;}}
   if(mobile){if(!touching){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[joy]});touching=true;}await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...joy,x:joy.x+mx*42,y:joy.y+my*42}]});}
   else{const next=new Set([...(mx<-.2?['KeyA']:mx>.2?['KeyD']:[]),...(my<-.2?['KeyW']:my>.2?['KeyS']:[])]);for(const k of held)if(!next.has(k))await page.keyboard.up(k);for(const k of next)if(!held.has(k))await page.keyboard.down(k);held=next;}
   await page.waitForTimeout(100);
  }
  for(const k of held)await page.keyboard.up(k);if(touching)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
  assert.deepEqual(Object.keys(seen).sort(),['rune_guardian','spirit']);assert.ok(requests.length>=4);assert.ok(requests.every(r=>r.status===200));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const final=await page.evaluate(()=>__arpg.art);assert.ok(final.loaded.includes('rune_guardian')&&final.loaded.includes('spirit'));assert.deepEqual(final.failed,{});
  report.rows.push({width,stage,input:mobile?'native touch joystick':'keyboard Enter/WASD',fixture,startedTick:started.tick,spawnOnly:started.tick<60,seen,states:Object.fromEntries(Object.entries(states).map(([k,v])=>[k,[...v]])),requests});console.log('native art PASS',width,stage);await ctx.close();
 }
 assert.deepEqual(report.errors,[]);report.status='PASS';console.log(JSON.stringify(report));
}catch(e){report.status='FAIL';report.failure=e.stack;throw e;}finally{await writeFile(out,JSON.stringify(report,null,2)+'\n');await browser.close();server.kill();}
