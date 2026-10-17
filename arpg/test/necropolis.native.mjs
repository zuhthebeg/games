// Actual ordinary /arpg/, isolated valid saves, native keyboard/touch only. No screenshots or world writes.
import { chromium } from '/home/cocy/.openclaw/workspace/node_modules/playwright/index.mjs';
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { preset } from '../tools/balance/botsim.mjs';
import { botInput } from '../tools/balance/bot.js';
import { validateSave } from '../js/meta/save.js';
import { STAGES } from '../js/content/combat.js';
const root=fileURLToPath(new URL('../../',import.meta.url)),port=Number(process.env.ARPG_HTTP_PORT||8938);
const base=(process.env.ARPG_BASE_URL||`http://127.0.0.1:${port}`).replace(/\/$/,'');
const output=process.env.ARPG_NECROPOLIS_EVIDENCE||'/home/cocy/.openclaw/workspace/tmp/arpg-necropolis-native.json';
const server=process.env.ARPG_BASE_URL?null:spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
const browser=await chromium.launch({executablePath:'/home/cocy/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--disable-background-timer-throttling']});
const hash=data=>createHash('sha256').update(data).digest('hex'),ids=['S24','S25','S26','S27'];
const sourcePaths=['arpg/js/content/combat.js','arpg/js/content/balance.js','arpg/js/content/world-map.js','arpg/js/content/biomes.js','arpg/js/content/monsters.js','arpg/js/content/loot.js','arpg/js/meta/progression.js','arpg/js/render/atlas-library.js','arpg/js/render/atlas-state.js','arpg/js/render/atlas-visual.js','arpg/js/audio-profile.js','arpg/js/solo/knight-presentation.js','arpg/js/ui/hub.js'];
const sourceHashes=Object.fromEntries(sourcePaths.map(p=>[p,hash(readFileSync(root+p))]));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function fixture({s20=true,s23=true}={}){const s=preset('S27',{level:30,rarity:'epic',enhance:6});s.name='묘역 네이티브';for(let i=1;i<=23;i++)s.cleared['S'+i]=true;s.cleared.S20=s20;s.cleared.S23=s23;s.stacks.potion=20;s.stacks.mana_potion=10;assert.ok(validateSave(s));return s;}
async function setup(mobile,save){
 const context=await browser.newContext({viewport:{width:mobile?390:1280,height:mobile?844:800},isMobile:mobile,hasTouch:mobile});
 await context.addInitScript(({raw})=>{if(!sessionStorage.getItem('necro-seeded')){localStorage.setItem('arpg.save.v1',raw);localStorage.setItem('arpg.autoAttack','1');sessionStorage.setItem('necro-seeded','1');}},{raw:JSON.stringify(save)});
 const page=await context.newPage(),errors=[],assets=new Map(),bound=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url()),path=url.pathname.slice(1);
  if(url.hostname==='www.googletagmanager.com')return route.fulfill({body:''});
  if(sourcePaths.includes(path)||path.startsWith('arpg/assets/sprites/')){
   const response=await route.fetch(),bytes=await response.body();assert.ok(response.ok(),path);assert.equal(hash(bytes),hash(readFileSync(root+path)),path+' delivered source/asset binding');assets.set(path,hash(bytes));return route.fulfill({response,body:bytes});
  }
  return route.continue();
 });
 await page.goto(base+'/arpg/');await page.waitForFunction(()=>window.__arpg&&document.querySelector('#boot')?.hidden);
 const click=async selector=>{const n=page.locator(selector);await n.scrollIntoViewIfNeeded();if(mobile)await n.tap();else{await n.focus();await page.keyboard.press('Enter');}};
 // Ordinary character selection may be shown when no explicit character query is supplied.
 if(await page.locator('[data-action="choose-human"]').isVisible())await click('[data-action="choose-human"]');
 await page.waitForFunction(()=>document.querySelector('#meta-screen')?.dataset.page==='inn');
 return {context,page,errors,assets,bound,click,mobile};
}
async function board(t){await t.click('[data-action="board"]');await t.page.locator('.world-map').waitFor();await t.click('[data-action="map-region"][data-region="necropolis"]');await t.page.locator('.map-quests[data-region="necropolis"]:visible').waitFor();}
async function layout(t){return t.page.evaluate(()=>{
 const map=document.querySelector('.world-map'),mr=map.getBoundingClientRect(),nodes=[...map.querySelectorAll('.region-node')],rects=nodes.map(n=>({id:n.dataset.region,...Object.fromEntries(['left','right','top','bottom'].map(k=>[k,n.getBoundingClientRect()[k]]))})),bad=[];
 for(let i=0;i<rects.length;i++){const a=rects[i];if(a.left<mr.left||a.right>mr.right||a.top<mr.top||a.bottom>mr.bottom)bad.push(a.id+' clipped');for(const b of rects.slice(i+1))if(Math.min(a.right,b.right)>Math.max(a.left,b.left)&&Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top))bad.push(a.id+'/'+b.id+' overlap');}
 const text=[...document.querySelectorAll('.map-quests[data-region="necropolis"] button')].map(n=>({stage:n.dataset.stage,disabled:n.disabled,text:n.textContent,clipped:n.scrollWidth>n.clientWidth+1}));return{width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,bad,rects,text};
 });}
async function combat(t,id){
 const {page,mobile}=t;await page.waitForFunction(id=>__arpg.world?.round.stageId===id&&__arpg.world.tick>0,id);
 const cdp=await t.context.newCDPSession(page),held=new Set(),seen=new Set(),loaded=new Set(),bossProof=[];let joystick=null,actionCount=0,lastLog=0;
 const btn=async selector=>{const r=await page.locator(selector).boundingBox();return {id:2,x:r.x+r.width/2,y:r.y+r.height/2};};
 async function pulse(selector){if(!(await page.locator(selector).isEnabled()))return;const p=await btn(selector);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[...(joystick?[joystick]:[]),p]});await sleep(35);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:joystick?[joystick]:[]});actionCount++;}
 async function move(input){
  if(mobile){const active=Math.hypot(input.mx,input.my)>.15;if(!active&&joystick){await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});joystick=null;}if(active){if(!joystick){joystick={id:1,...padOrigin};await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[joystick]});}joystick={id:1,x:padOrigin.x+36*input.mx,y:padOrigin.y+36*input.my};await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[joystick]});}for(const [key,selector]of [['dodgeEdge','#dodge'],['skillEdge','#skill'],['potionEdge','#potion'],['manaEdge','#mana']])if(input[key])await pulse(selector);
  }else{const desired=new Set();if(input.mx>.25)desired.add('KeyD');if(input.mx<-.25)desired.add('KeyA');if(input.my>.25)desired.add('KeyS');if(input.my<-.25)desired.add('KeyW');for(const key of held)if(!desired.has(key)){await page.keyboard.up(key);held.delete(key);}for(const key of desired)if(!held.has(key)){await page.keyboard.down(key);held.add(key);}for(const [edge,key]of [['dodgeEdge','Space'],['skillEdge','KeyK'],['potionEdge','KeyQ'],['manaEdge','KeyE']])if(input[edge]){await page.keyboard.press(key);actionCount++;}}
 }
 const padRect=mobile?await page.locator('#movepad').boundingBox():null;const padOrigin=padRect?{x:padRect.x+padRect.width/2,y:padRect.y+padRect.height/2}:null;const started=Date.now();let world;
 try{while(Date.now()-started<300000){
  const s=await page.evaluate(()=>({world:__arpg.world,art:__arpg.art,save:__arpg.save,page:document.querySelector('#meta-screen')?.dataset.page}));world=s.world;for(const m of world?.entities||[])if(m.kind==='monster')seen.add(m.type);for(const v of s.art.visuals){if(v.textureLoaded)loaded.add(v.key);if(v.bossMarker&&!bossProof.length)bossProof.push(v);}
  if(world?.round.state!=='running')break;
  const p=world.entities.find(e=>e.kind==='player'),input=botInput(world,p);input.manaEdge=p.mp<30&&p.manaPotions>0;await move(input);
  if(Date.now()-lastLog>10000){console.log(JSON.stringify({mobile,id,tick:world.tick,hp:p.hp,pending:world.round.pending.length,alive:world.entities.filter(e=>e.kind==='monster'&&!e.dead).length,position:{x:p.x,y:p.y}}));lastLog=Date.now();}
  await sleep(160);
 }}finally{for(const key of held)await page.keyboard.up(key);if(joystick)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}
 assert.equal(world.round.state,'clear',`${id} native ${mobile?'touch':'keyboard'} state ${world.round.state}`);assert.deepEqual(seen,new Set(STAGES[id].spawns.map(s=>s.monster)));for(const type of seen)assert.ok(loaded.has(type),id+' loaded real atlas '+type);
 if(id==='S27'){assert.equal(bossProof[0]?.id,'skeleton-warrior');assert.equal(bossProof[0].bossName,'망자의 군주');assert.equal(bossProof[0].crown,true);}
 await page.waitForFunction(()=>document.querySelector('#meta-screen')?.dataset.page==='receipt');
 const persisted=await page.evaluate(()=>JSON.parse(localStorage.getItem('arpg.save.v1')));assert.ok(validateSave(persisted));assert.ok(persisted.cleared[id]);assert.equal(persisted.lastReceipt.stageId,id);assert.equal(persisted.lastReceipt.terminal,'clear');assert.ok(persisted.lastReceipt.goldGained>0);assert.ok(persisted.lastReceipt.lootKept.items.length<=2);
 const result={id,mobile,ticks:world.tick,kills:world.entities.filter(e=>e.kind==='monster'&&e.dead).length,spawnCount:STAGES[id].spawns.length,seen:[...seen],loaded:[...loaded],bossProof,actionCount,receipt:persisted.lastReceipt};
 await t.click('#result-back');await page.waitForFunction(()=>document.querySelector('#meta-screen')?.dataset.page==='inn');await page.reload();await page.waitForFunction(()=>__arpg.save&&document.querySelector('#meta-screen')?.dataset.page==='inn');assert.equal((await page.evaluate(id=>__arpg.save.cleared[id],id)),true);result.reloaded=true;return result;
}
const results=[];
try{
 for(let attempt=0;attempt<50;attempt++){try{if((await fetch(base+'/arpg/')).ok)break;}catch{}await sleep(100);}
 for(const path of sourcePaths){const r=await fetch(base+'/'+path);assert.ok(r.ok);assert.equal(hash(Buffer.from(await r.arrayBuffer())),sourceHashes[path],path+' served byte binding');}
 // Negative gate fixtures are never altered after boot; both historical prerequisites are necessary.
 for(const mobile of [false,true])for(const gate of [{s20:false,s23:true},{s20:true,s23:false}]){const t=await setup(mobile,fixture(gate));await board(t);assert.deepEqual(await t.page.locator('.map-quests[data-region="necropolis"] button[data-stage]').evaluateAll(ns=>ns.map(n=>n.disabled)),[true,true,true,true]);results.push({mobile,gate,locked:true});assert.deepEqual(t.errors,[]);await Promise.all(t.bound);await t.context.close();}
 for(const mobile of [false,true]){
  const t=await setup(mobile,fixture());await board(t);const firstLayout=await layout(t);assert.equal(firstLayout.overflow,false);assert.deepEqual(firstLayout.bad,[]);assert.ok(firstLayout.text.every(n=>!n.clipped));
  for(const id of ids){if(id!=='S24')await board(t);const flags=await t.page.locator('.map-quests[data-region="necropolis"] button[data-stage]').evaluateAll(ns=>ns.map(n=>({id:n.dataset.stage,disabled:n.disabled})));assert.equal(flags.find(x=>x.id===id).disabled,false);const next=ids[ids.indexOf(id)+1];if(next)assert.equal(flags.find(x=>x.id===next).disabled,true);await t.click(`[data-action="sortie"][data-stage="${id}"]`);await t.click('#sortie-confirm');results.push(await combat(t,id));}
  await board(t);const replay=await t.page.locator('[data-stage="S24"]').getAttribute('class');assert.match(replay,/clear/);assert.deepEqual(t.errors,[]);await Promise.all(t.bound);results.push({mobile,layout:firstLayout,errors:t.errors,assets:Object.fromEntries(t.assets),replayAvailable:true});await t.context.close();
 }
 const evidence={pass:true,scope:'local implementation, not deployed',base,head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sourceHashes,results,screenshots:0,worldWrites:0};writeFileSync(output,JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify({pass:true,output,groups:results.length,sourceHashes},null,2));
}catch(error){writeFileSync(output,JSON.stringify({pass:false,base,error:error.stack,results,sourceHashes,screenshots:0,worldWrites:0},null,2)+'\n');throw error;}finally{await browser.close();server?.kill();}
