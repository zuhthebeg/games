// Ordinary ARPG, isolated valid fixtures before boot, native keyboard/touch interactions only.
// Replay: ARPG_BASE_URL=https://game.cocy.io ARPG_REQUIRE_MAP_ART=1 node arpg/test/map-layout.native.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { STAGES } from '../js/content/combat.js';
import { createSave, validateSave } from '../js/meta/save.js';
import { createSkeletonSave } from '../js/meta/character-creation.js';
import { REGIONS, REGION_EDGES, MAPS, discoveredMaps, discoveredRegions, mapUnlocked, mapState, availableStages } from '../js/content/world-map.js';
const root=fileURLToPath(new URL('../../',import.meta.url)),port=Number(process.env.ARPG_HTTP_PORT||8946);
const base=(process.env.ARPG_BASE_URL||`http://127.0.0.1:${port}`).replace(/\/$/,'');
const output=process.env.ARPG_MAP_EVIDENCE||'/home/cocy/.openclaw/workspace/tmp/arpg-discovered-route-native.json';
const server=process.env.ARPG_BASE_URL?null:spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
const hash=data=>createHash('sha256').update(data).digest('hex');
const sourcePaths=['arpg/js/ui/hub.js','arpg/css/game.css','arpg/js/content/world-map.js'];
const sourceHashes=Object.fromEntries(sourcePaths.map(p=>[p,hash(readFileSync(root+p))]));
const browser=await chromium.launch({executablePath:process.env.ARPG_CHROMIUM||'/home/cocy/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
const results=[];
function fixture(kind,lineage='human'){
 const opts={name:'아주긴이름의지도원정대',answers:[0,0,0,0,0],createdAt:1,lineage};
 const s=lineage==='human'?createSave(opts):createSkeletonSave(opts);
 const count=({fresh:0,mid:4,branch:10,mine:10,swamp:10,gate:19,late:20,necropolis:23,full:27})[kind];
 for(let i=1;i<=count;i++){s.cleared['S'+i]=true;s.stageThreat['S'+i]=1;}
 if(kind==='mine')s.cleared.S12=s.cleared.S17=true;
 if(kind==='swamp')for(const id of ['S11','S13','S16','S18'])s.cleared[id]=true;
 if(kind==='full')for(const id of Object.keys(MAPS))s.cleared[id]=true;
 assert.ok(validateSave(s),'fixture valid before boot');return s;
}
async function setup(width,kind,lineage='human'){
 const save=fixture(kind,lineage),mobile=width<760;
 const context=await browser.newContext({viewport:{width,height:mobile?844:900},isMobile:mobile,hasTouch:mobile});
 await context.addInitScript(({save,lineage})=>{
  localStorage.setItem(lineage==='human'?'arpg.save.v1':'arpg.save.v1.slots.skeleton_knight',JSON.stringify(save));
 },{save,lineage});
 const page=await context.newPage(),errors=[],consoleErrors=[],httpErrors=[],sockets=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('websocket',ws=>sockets.push(ws.url()));
 page.on('response',r=>{if(r.status()>=400&&!(r.status()===404&&new URL(r.url()).pathname.startsWith('/arpg/assets/world-map/')&&process.env.ARPG_REQUIRE_MAP_ART!=='1'))httpErrors.push({url:r.url(),status:r.status()});});
 page.on('console',msg=>{if(msg.type()==='error'&&!msg.text().includes('404'))consoleErrors.push(msg.text());});
 await page.route('**/www.googletagmanager.com/**',r=>r.fulfill({body:''}));
 await page.goto(base+'/arpg/?character='+lineage);
 await page.waitForFunction(()=>window.__arpg&&document.querySelector('#meta-screen')?.dataset.page==='inn');
 const click=async selector=>{const n=page.locator(selector);await n.scrollIntoViewIfNeeded();if(mobile)await n.tap();else{await n.focus();await page.keyboard.press('Enter');}};
 await click('[data-action="board"]');await page.locator('.world-map').waitFor();
 return {context,page,save,width,kind,lineage,click,errors,consoleErrors,httpErrors,sockets};
}
async function geometry(t,phase){
 const g=await t.page.evaluate(()=>{
  const nodes=[...document.querySelectorAll('.region-node,.map-quests:not([hidden]) .contract,.map-party-actions button,.map-sortie .threat-choices button,.action-footer button')].filter(n=>n.getClientRects().length);
  const rects=nodes.map(n=>({id:n.dataset.region||n.dataset.stage||n.dataset.quest||n.dataset.action+(n.dataset.threat||''),...Object.fromEntries(['left','right','top','bottom','width','height'].map(k=>[k,n.getBoundingClientRect()[k]])),overflow:n.scrollWidth>n.clientWidth+1}));
  const bad=[];for(let i=0;i<rects.length;i++){const a=rects[i];if(a.width<43.9||a.height<43.9)bad.push(a.id+' touch size');if(a.overflow)bad.push(a.id+' text overflow');if(a.left<-.5||a.right>innerWidth+.5)bad.push(a.id+' outside viewport');for(const b of rects.slice(i+1)){const dx=Math.max(a.left,b.left)-Math.min(a.right,b.right),dy=Math.max(a.top,b.top)-Math.min(a.bottom,b.bottom);if(dx<-.5&&dy<-.5)bad.push(a.id+'/'+b.id+' overlap');if(dx<0&&dy>=0&&dy<7.5)bad.push(a.id+'/'+b.id+' vertical gap '+dy);if(dy<0&&dx>=0&&dx<7.5)bad.push(a.id+'/'+b.id+' horizontal gap '+dx);}}
  const shell=document.querySelector('.inn-shell'),content=shell.querySelector('.content');return {width:innerWidth,bodyOverflow:document.documentElement.scrollWidth>innerWidth,contentOverflow:content.scrollWidth>content.clientWidth+1,bad,rects,columns:getComputedStyle(document.querySelector('.map-board')||shell).gridTemplateColumns};
 });
 assert.equal(g.bodyOverflow,false,phase+' body overflow');assert.equal(g.contentOverflow,false,phase+' content overflow');assert.deepEqual(g.bad,[],phase+' geometry');return g;
}
async function hitbox(t,selector){const n=t.page.locator(selector);await n.scrollIntoViewIfNeeded();assert.ok(await n.evaluate(n=>{const r=n.getBoundingClientRect();return n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),selector+' unobstructed hitbox');}
async function region(t,id){await t.click(`[data-action="map-region"][data-region="${id}"]`);assert.equal(await t.page.locator('.map-quests:visible').getAttribute('data-region'),id);assert.equal(await t.page.locator(`.region-node[data-region="${id}"]`).getAttribute('aria-pressed'),'true');}
try{
 for(let n=0;n<60;n++){try{if((await fetch(base+'/arpg/')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 for(const path of sourcePaths){const r=await fetch(base+'/'+path+'?mapUiCheck='+Date.now());assert.ok(r.ok,path);assert.equal(hash(Buffer.from(await r.arrayBuffer())),sourceHashes[path],path+' exact served source');}
 // All nine real assets remain available; only discovered artwork enters each save's board.
 const art=[];for(const r of REGIONS){const response=await fetch(base+`/arpg/assets/world-map/${r.id}.webp`);art.push({id:r.id,status:response.status});if(process.env.ARPG_REQUIRE_MAP_ART==='1')assert.ok(response.ok,r.id+' artwork delivered');}
 results.push({art,strictArt:process.env.ARPG_REQUIRE_MAP_ART==='1'});
 for(const width of [320,360,390,1280])for(const kind of ['fresh','mid','branch','mine','swamp','gate','late','necropolis','full']){
  const t=await setup(width,kind);const {page,click,save}=t;
  const initial=await geometry(t,'board '+width+'/'+kind);
  const current=availableStages(save).find(id=>!save.cleared[id]);
  const discovered=discoveredRegions(save),maps=discoveredMaps(save);
  if(current)assert.equal(await page.locator('.region-node[aria-current="location"]').getAttribute('data-region'),MAPS[current].regionId);
  else assert.equal(await page.locator('.region-node[aria-current="location"]').count(),0);
  assert.deepEqual((await page.locator('.map-quests [data-stage]').evaluateAll(ns=>ns.map(n=>n.dataset.stage))).sort(),[...maps].sort(),'no hidden future cards');
  assert.deepEqual((await page.locator('.region-node').evaluateAll(ns=>ns.map(n=>n.dataset.region))).sort(),discovered.map(r=>r.id).sort(),'no future region DOM');
  const board=await page.locator('#meta-screen').innerText(),html=await page.locator('.map-board').innerHTML();
  for(const [id,stage] of Object.entries(STAGES).filter(([id])=>!maps.includes(id)))assert.ok(!html.includes(stage.name),id+' no hidden future quest name');
  if(kind==='fresh')assert.deepEqual(maps,['S1']);
  if(kind==='branch'){for(const id of ['S11','S12','M_MINE_CART'])assert.ok(maps.includes(id));for(const id of ['S14','S21','S24','TD1','M_MARSH_MARKERS'])assert.ok(!maps.includes(id));}
  if(['mine','swamp'].includes(kind)){assert.ok(maps.includes('S14'),kind+' alone opens castle');assert.ok(!maps.includes('S15'));}
  if(kind==='gate')for(const id of ['S21','S24','TD1','M_THRONE_GARGOYLE'])assert.ok(!maps.includes(id));
  if(kind==='late'){for(const id of ['S21','TD1','M_THRONE_GARGOYLE'])assert.ok(maps.includes(id));for(const id of ['S22','S24'])assert.ok(!maps.includes(id));}
  if(kind==='necropolis'){assert.ok(maps.includes('S24'));assert.ok(!maps.includes('S25'));}
  if(kind==='full')assert.equal(maps.length,Object.keys(MAPS).length);

  for(const r of REGIONS.filter(r=>!discovered.includes(r))){assert.ok(!board.includes(r.name),r.id+' no future text');assert.ok(!html.includes(`/world-map/${r.id}.webp`),r.id+' no future image');}
  const expectedEdges=REGION_EDGES.filter(e=>e.every(id=>discovered.some(r=>r.id===id))).map(e=>e.join(':')).sort();
  assert.deepEqual((await page.locator('.map-routes path').evaluateAll(ns=>ns.map(n=>n.dataset.route))).sort(),expectedEdges,'discovered paths only');
  const endpoints=await page.locator('.map-routes path').evaluateAll(paths=>paths.map(p=>{
   const [from,to]=p.dataset.route.split(':'),matrix=p.getScreenCTM(),a=p.getPointAtLength(0),b=p.getPointAtLength(p.getTotalLength());
   const start=new DOMPoint(a.x,a.y).matrixTransform(matrix),end=new DOMPoint(b.x,b.y).matrixTransform(matrix);
   const source=document.querySelector(`.region-node[data-region="${from}"]`).getBoundingClientRect(),target=document.querySelector(`.region-node[data-region="${to}"]`).getBoundingClientRect();
   return {route:p.dataset.route,startConnected:start.x>=source.left&&start.x<=source.right&&Math.abs(start.y-source.bottom)<2,endConnected:end.x>=target.left&&end.x<=target.right&&Math.abs(end.y-target.top)<2};
  }));
  for(const e of endpoints)assert.ok(e.startConnected&&e.endConnected,e.route+' joins actual buttons');
  for(const r of discovered){
   await hitbox(t,`.region-node[data-region="${r.id}"]`);await region(t,r.id);
   if(width===1280){assert.equal(await page.evaluate(()=>document.activeElement.dataset.region),r.id,'native Enter focus survives rerender');assert.ok(await page.locator(`.region-node[data-region="${r.id}"]`).evaluate(n=>n.matches(':focus-visible')));}
   assert.equal(await page.locator('.region-node[aria-pressed="true"]').count(),1);
   const cards=await page.locator('.map-quests:visible [data-stage]').evaluateAll(ns=>ns.map(n=>({id:n.dataset.stage,disabled:n.disabled,classes:n.className})));
   for(const c of cards){assert.equal(c.disabled,!mapUnlocked(save,c.id),c.id+' preserves gate');assert.ok(c.classes.split(' ').includes(mapState(save,c.id)),c.id+' preserves status');}
   await geometry(t,'region '+width+'/'+kind+'/'+r.id);
  }
  if(kind==='branch'){
   await region(t,'forest');await click('.map-quests:visible [data-action="quest-accept"][data-quest="QF1"]');assert.ok(await page.locator('.map-quests:visible .side-contract.active').count());
   await click('[data-action="sortie"][data-stage="S5"]');assert.ok(await page.locator('.side-quest-line[data-quest="QF1"]').count());await click('[data-action="board"]');
   await region(t,'pass');assert.ok(await page.locator('.map-quests:visible .silver-source').count());
   await click('[data-action="sortie"][data-stage="S9"]');assert.ok(await page.locator('.map-sortie .silver-source').count());await click('[data-action="threat"][data-threat="2"]');assert.equal(await page.locator('[data-threat="2"]').getAttribute('aria-pressed'),'true');await click('[data-action="board"]');
  }
  if(['late','necropolis','full'].includes(kind)){await region(t,'graveyard');assert.ok(await page.locator('.map-quests:visible .undead-recommendation').count());}
  await region(t,'outskirts');await click('[data-action="sortie"][data-stage="S1"]');const sortie=await geometry(t,'sortie '+width+'/'+kind);
  assert.ok(await page.locator('[data-threat="2"]').isDisabled());assert.ok(await page.locator('[data-threat="3"]').isDisabled());
  await hitbox(t,'[data-action="coop"]');await hitbox(t,'[data-action="invasion"]');
  await click('[data-action="invasion"]');assert.match(await page.locator('#meta-screen').innerText(),/인간 · 사냥꾼 편/);assert.equal(await page.locator('#mpl-mode').count(),0,'invasion only opens consent');
  assert.equal(await page.evaluate(()=>!!__arpg.world),false,'no surprise run');assert.equal(t.sockets.length,0,'no surprise room/network');await click('[data-action="board"]');
  await click('[data-action="coop"]');await page.locator('#mpl-mode').waitFor();assert.match(await page.locator('#mpl-mode').innerText(),/같이 사냥/);assert.equal(t.sockets.length,0,'chooser does not join a room');await click('#mpl-mode-leave');
  assert.equal(await page.locator('#meta-screen').getAttribute('data-page'),'board');
  assert.deepEqual(t.errors,[]);assert.deepEqual(t.consoleErrors,[]);assert.deepEqual(t.httpErrors,[]);results.push({width,kind,lineage:'human',initial,sortie,endpoints,discovered:discovered.map(r=>r.id),maps,errors:t.errors,consoleErrors:t.consoleErrors,httpErrors:t.httpErrors,sockets:t.sockets});await t.context.close();
 }
 for(const width of [390,1280]){
  const t=await setup(width,'necropolis','skeleton_knight');assert.equal(await t.page.locator('[data-action="coop"]').count(),0);await t.click('[data-action="invasion"]');assert.match(await t.page.locator('#meta-screen').innerText(),/해골 · 몬스터 편/);assert.equal(await t.page.locator('#mpl-mode').count(),0);await t.click('[data-action="board"]');
  await region(t,'graveyard');await t.click('[data-action="sortie"][data-stage="S21"]');assert.equal(await t.page.locator('[data-action="coop"]').count(),0);assert.ok(await t.page.locator('.undead-recommendation').count());await geometry(t,'skeleton sortie');await t.click('[data-action="invasion"]');await t.click('[data-action="invasion-accept"]');await t.page.locator('#mpl-mode').waitFor();assert.match(await t.page.locator('#mpl-mode').innerText(),/침입 동의방/);assert.equal(t.sockets.length,0,'explicit acceptance opens chooser only');await t.click('#mpl-mode-leave');assert.deepEqual(t.errors,[]);assert.deepEqual(t.consoleErrors,[]);assert.deepEqual(t.httpErrors,[]);results.push({width,lineage:'skeleton_knight',role:'invader',ordinaryCoopAbsent:true,explicitConsent:true,errors:t.errors});await t.context.close();
 }
 // Ordinary launch is still a separate native confirmation, never a region selection side effect.
 for(const width of [390,1280]){const t=await setup(width,'fresh');await t.click('[data-action="sortie"][data-stage="S1"]');assert.equal(await t.page.evaluate(()=>!!__arpg.world),false);await t.click('#sortie-confirm');await t.page.waitForFunction(()=>__arpg.world?.round.stageId==='S1'&&__arpg.world.tick>0);assert.deepEqual(t.errors,[]);results.push({width,nativeLaunch:'S1',errors:t.errors});await t.context.close();}
 if(process.env.ARPG_REQUIRE_MAP_ART==='1'){
  const context=await browser.newContext(),page=await context.newPage();await page.goto(base+'/arpg/');const dimensions=await page.evaluate(async ids=>Promise.all(ids.map(async id=>{const blob=await(await fetch(`/arpg/assets/world-map/${id}.webp`)).blob();const img=await createImageBitmap(blob);return{id,width:img.width,height:img.height};})),REGIONS.map(r=>r.id));for(const d of dimensions)assert.deepEqual([d.width,d.height],[768,384],d.id+' artwork dimensions');results.push({dimensions});await context.close();
 }
 const evidence={pass:true,base,sourceHashes,results,screenshots:0,worldWrites:0,privateProfiles:0};writeFileSync(output,JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify({pass:true,output,groups:results.length,sourceHashes}));
}catch(error){writeFileSync(output,JSON.stringify({pass:false,base,error:error.stack,results,sourceHashes,screenshots:0,worldWrites:0},null,2)+'\n');throw error;}finally{await browser.close();server?.kill();}
