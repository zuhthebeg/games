// Fresh synthetic profiles only. Native browser keyboard/touch input; readonly runtime observations.
// ARPG_BASE_URL supports parent production replay. No screenshots or forced runtime state.
import {chromium} from '/home/cocy/.openclaw/workspace/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createSave,validateSave} from '../js/meta/save.js';
import {createSkeletonSave} from '../js/meta/character-creation.js';
import {ITEMS,instance,craft,equip} from '../js/meta/items.js';
import {REGIONS} from '../js/content/world-map.js';
const root=fileURLToPath(new URL('../..',import.meta.url)),port=8974;
const base=(process.env.ARPG_BASE_URL||`http://127.0.0.1:${port}`).replace(/\/$/,'');
const output=process.env.ARPG_BONE_EVIDENCE||'/home/cocy/.openclaw/workspace/tmp/arpg-bone-invasion-native.json';
const server=process.env.ARPG_BASE_URL?null:spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
const browser=await chromium.launch({executablePath:'/home/cocy/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding']});
let lastPage;
const report={status:'RUNNING',base,rows:[],errors:[],sourceBinding:{},screenshots:0,worldWrites:0,privateProfiles:0};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function fresh(name='Bones'){const s=createSave({name,answers:[0,0,0,0,0],createdAt:123});s.gold=10000;s.stacks={potion:0,mana_potion:0,return_scroll:1,undead_bone:180,enhance_stone_1:100,enhance_stone_blessed:10};s.autoUse={potion:false,hp:50,mp:50,recall:false};for(const id of Object.keys(s.cleared))s.cleared[id]=true;assert.ok(validateSave(s));return s;}
async function setup(width,fixtures,urls=['']){
 const mobile=width===390,ctx=await browser.newContext({viewport:{width,height:844},isMobile:mobile,hasTouch:mobile,reducedMotion:'reduce'}),pages=[];
 await ctx.route('**/www.googletagmanager.com/**',r=>r.fulfill({body:''}));
 await ctx.addInitScript(f=>{if(!localStorage.getItem('bone-fixture-seeded')){for(const[k,v]of Object.entries(f))localStorage.setItem(k,v);localStorage.setItem('bone-fixture-seeded','1');localStorage.setItem('arpg.autoAttack','0');}},fixtures);
 for(const url of urls){const page=await ctx.newPage();lastPage=page;page.setDefaultTimeout(20000);page.on('pageerror',e=>report.errors.push(e.message));await page.goto(base+'/arpg/'+url);await page.waitForFunction(()=>window.__arpg);await page.locator('#inn-name').waitFor();const cdp=await ctx.newCDPSession(page);
 const press=async selector=>{const node=page.locator(selector).first();await node.scrollIntoViewIfNeeded();if(mobile)await node.tap();else{await node.focus();await page.keyboard.press('Enter');}};
 const move=async(dx,dy,ms)=>{await page.bringToFront();if(mobile){const x=50,y=500;await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*40,y:y+dy*40}]});await pause(ms);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}else{const keys=[...(dx>.2?['KeyD']:dx<-.2?['KeyA']:[]),...(dy>.2?['KeyS']:dy<-.2?['KeyW']:[])];for(const key of keys)await page.keyboard.down(key);await pause(ms);for(const key of keys)await page.keyboard.up(key);}};
 const drive=async(pid,x,y,tolerance=35)=>{for(let i=0;i<45;i++){const p=await page.evaluate(pid=>__arpg.world?.entities.find(e=>e.pid===pid),pid);assert.ok(p&&!p.terminal,'drive player alive');const dx=x-p.x,dy=y-p.y,d=Math.hypot(dx,dy);if(d<tolerance)return;await move(dx/d,dy/d,Math.min(350,Math.max(50,(d-tolerance)/p.speed*1000)));}throw new Error('native movement did not reach target');};
 const auto=async(on)=>{await press('[data-battle-settings]');await press(`#battle-auto-${on?'on':'off'}`);await press('[data-battle-settings]');};
 const sortie=async(id)=>{await press('[data-action="board"]');const region=REGIONS.find(r=>r.maps.includes(id));await press(`[data-action="map-region"][data-region="${region.id}"]`);await press(`[data-action="sortie"][data-stage="${id}"]`);};
 pages.push({page,press,move,drive,auto,sortie});}
 return{ctx,pages};
}
try{
 for(let i=0;i<60;i++){try{if((await fetch(base+'/arpg/')).ok)break;}catch{}await pause(100);}
 const files=execFileSync('git',['diff','eb20d53','--name-only'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(f=>f.startsWith('arpg/js/')&&f.endsWith('.js'));
 for(const f of files){const local=await readFile(root+'/'+f),served=Buffer.from(await(await fetch(base+'/'+f,{cache:'no-store'})).arrayBuffer());assert.deepEqual(served,local,f);report.sourceBinding[f]=createHash('sha256').update(local).digest('hex');}
 if(process.env.ARPG_BONE_SKIP_SOLO!=='1')for(const width of (process.env.ARPG_BONE_WIDTHS||'1280,390').split(',').map(Number)){
  const{ctx,pages:[p]}=await setup(width,{'arpg.save.v1':JSON.stringify(fresh())},['?character=human']);
  await p.press('[data-action="forge"]');
  for(const slot of ['weapon','head','body','hands','feet']){
   await p.press('[data-action="forge-tab"][data-tab="salvage"]');const recipe=p.page.locator(`[data-action="craft"][data-id="bone_set_${slot}"]`).locator('..');assert.match(await recipe.innerText(),/행운 반영 결과/);await p.press(`[data-action="craft"][data-id="bone_set_${slot}"]`);
   assert.match(await p.page.locator('.forge-work').innerText(),/실패 시 파괴/);await p.press('[data-action="forge-tab"][data-tab="salvage"]');await p.press('.forge-salvage [data-action="equip"]');
  }
  const made=await p.page.evaluate(()=>JSON.parse(JSON.stringify(__arpg.save)));assert.ok(validateSave(made));assert.equal(made.craftCount,5);for(const slot of ['weapon','head','body','hands','feet'])assert.ok(ITEMS[made.items.find(i=>i.uid===made.equipped[slot]).id].boneSet);
  await p.press('[data-action="forge-tab"][data-tab="salvage"]');await p.press('[data-action="craft"][data-id="bone_set_head"]');await p.press('[data-action="pick-stone"][data-id="enhance_stone_blessed"]');assert.match(await p.page.locator('.forge-work').innerText(),/성공 80%.*실패 시 파괴/);await p.press('[data-action="enhance"]');await p.page.waitForFunction(()=>__arpg.save.enchantCount===1);await p.page.reload();await p.page.locator('#inn-name').waitFor();await p.press('[data-action="bag"]');assert.match(await p.page.locator('[aria-label="장비 세트 효과"]').innerText(),/뼈 5\/5.*활성/s);assert.equal(await p.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  report.rows.push({case:'ordinary UI craft five pieces / equip / exact odds / blessed +0 risk / enhance / reload',width,craftCount:6,native:width===390?'touch':'keyboard'});
  await p.press('[data-action="inn"]');await p.sortie('S20');await p.press('#sortie-confirm');if(await p.page.locator('[data-action="launch-without-potion"]').count())await p.press('[data-action="launch-without-potion"]');console.log('solo launched',width);await p.page.waitForFunction(()=>__arpg.world?.entities[0].skeletal===true,null,{timeout:120000});let revived=await p.page.evaluate(()=>JSON.parse(JSON.stringify(__arpg.world.entities[0])));assert.equal(revived.boneRevivalReady,false);assert.equal(revived.terminal,null);
  await p.page.waitForFunction(()=>__arpg.world.entities[0].terminal==='death',null,{timeout:120000});await p.page.waitForFunction(()=>__arpg.art.visuals.some(v=>v.id==='player-skeleton-equipment'&&v.mode==='paperdoll'),null,{timeout:30000});const saved=await p.page.evaluate(()=>JSON.parse(localStorage.getItem('arpg.save.v1')));assert.equal(saved.lineage,undefined);assert.ok(validateSave(saved));assert.equal(saved.lastReceipt.terminal,'death');report.rows.push({case:'native sortie lethal revival then true death, human lineage unchanged',width,revivalHp:revived.hp,maxHp:revived.maxHp});await ctx.close();console.log('bone ordinary UI+revival PASS',width);
 }
 if(process.env.ARPG_BONE_SKIP_ORDINARY!=='1')for(const width of (process.env.ARPG_BONE_WIDTHS||'1280,390').split(',').map(Number)){
  const h=fresh('Coop');const{ctx,pages:[host,guest]}=await setup(width,{'arpg.save.v1':JSON.stringify(h)},['?character=human&dev=1&coopTest=host','?character=human&dev=1&coopTest=guest']);
  for(const p of [host,guest]){await p.sortie('S2');await p.press('[data-action="coop"]');}
  await host.page.waitForFunction(()=>__arpg.multi?.phase==='running');await guest.page.waitForFunction(()=>__arpg.world?.entities.length>=2);
  const before=await host.page.evaluate(()=>__arpg.world.entities.find(e=>e.pid==='guest').x);await guest.drive('guest',before+80,415,15);await host.page.waitForFunction(x=>__arpg.world.entities.find(e=>e.pid==='guest').x>x+40,before);
  const world=await host.page.evaluate(()=>JSON.parse(JSON.stringify(__arpg.world)));assert.ok(!world.round.invasion);assert.equal(new Set(world.entities.filter(e=>e.kind==='player').map(e=>e.team)).size,1);report.rows.push({case:'ordinary native two-client coop entry, same team, authoritative guest movement',width});await ctx.close();console.log('ordinary coop two-client PASS',width);
 }
 if(process.env.ARPG_BONE_SKIP_PAIR!=='1')for(const width of (process.env.ARPG_BONE_WIDTHS||'1280,390').split(',').map(Number)){
  const h=fresh('Hunter');h.items[0].enhance=6;h.items[1]=instance('starter:armor','shroud_robe',123);h.stacks.undead_bone=7;
  const g=createSkeletonSave({lineage:'skeleton_knight',name:'Invader',answers:[0,0,0,0,0],createdAt:321});g.items[0]={...instance('starter:weapon','training_sword_epic',321),enhance:12};g.autoUse={potion:false,hp:50,mp:50,recall:false};g.cleared.S1=true;
  const fixtures={'arpg.save.v1':JSON.stringify(h),'arpg.save.v1.slots.skeleton_knight':JSON.stringify(g)};
  const{ctx,pages:[host,guest]}=await setup(width,fixtures,['?character=human&dev=1&coopTest=host','?character=skeleton_knight&dev=1&coopTest=guest']);
  for(const p of [host,guest]){await p.sortie('S2');await p.press('[data-action="invasion"]');assert.match(await p.page.locator('#meta-screen').innerText(),/이번 출정/);await p.press('[data-action="invasion-accept"]');}
  await host.page.waitForFunction(()=>__arpg.multi?.phase==='running',null,{timeout:30000});await guest.page.waitForFunction(()=>__arpg.world?.round.invasion===true);assert.notEqual(...await host.page.evaluate(()=>__arpg.world.entities.filter(e=>e.kind==='player').map(e=>e.team)));
  await guest.drive('guest',1200,720);await host.auto(true);await host.drive('host',1060,360,45);await host.page.waitForFunction(()=>__arpg.tracker.tempLoot.gold>0,null,{timeout:45000});await host.auto(false);
  const earned=await host.page.evaluate(()=>JSON.parse(JSON.stringify(__arpg.tracker.tempLoot)));assert.ok(earned.gold>0);await guest.auto(true);let target=await host.page.evaluate(()=>({x:__arpg.world.entities[0].x,y:__arpg.world.entities[0].y}));await guest.drive('guest',target.x,target.y,30);
  for(let chase=0;chase<35;chase++){const human=await host.page.evaluate(()=>({x:__arpg.world.entities[0].x,y:__arpg.world.entities[0].y,terminal:__arpg.world.entities[0].terminal}));if(human.terminal)break;await guest.drive('guest',human.x,human.y,25);await pause(180);}
  await host.page.waitForFunction(()=>__arpg.world.entities[0].terminal==='death',null,{timeout:45000});const corpse=await host.page.evaluate(()=>({x:__arpg.world.entities[0].x,y:__arpg.world.entities[0].y,by:__arpg.world.entities[0].deathCause.by}));assert.equal(corpse.by,'blade');await guest.drive('guest',corpse.x,corpse.y,25);await guest.page.waitForFunction(()=>__arpg.tracker.tempLoot.gold>0,null,{timeout:15000});
  await guest.page.waitForFunction(()=>__arpg.world.round.state!=='running',null,{timeout:20000});const victim=await host.page.evaluate(()=>JSON.parse(localStorage.getItem('arpg.save.v1'))),looter=await guest.page.evaluate(()=>JSON.parse(localStorage.getItem('arpg.save.v1.slots.skeleton_knight')));assert.equal(victim.stacks.undead_bone,7);assert.deepEqual(victim.items,h.items);assert.ok(looter.gold>g.gold);assert.equal(looter.cleared.S2,false);assert.equal(looter.lastReceipt.stageXp,0);assert.ok(validateSave(victim));assert.ok(validateSave(looter));
  await guest.page.reload();await guest.page.locator('#inn-name').waitFor();const reloaded=await guest.page.evaluate(()=>JSON.parse(localStorage.getItem('arpg.save.v1.slots.skeleton_knight')));assert.deepEqual(reloaded,looter);report.rows.push({case:'two native clients explicitly consent, host monster loot, hostile combat, death pickup, return+reload once',width,earned,victimReceipt:victim.lastReceipt,looterReceipt:looter.lastReceipt});await ctx.close();console.log('bone invasion two-client PASS',width);
 }
 assert.deepEqual(report.errors,[]);report.status='PASS';
}catch(error){report.status='FAIL';report.failure=error.stack;if(lastPage&&!lastPage.isClosed())report.diagnostic=await lastPage.evaluate(()=>({world:__arpg.world,text:document.querySelector('#meta-screen')?.innerText,boot:document.querySelector('#boot-error')?.textContent})).catch(()=>null);throw error;}finally{await writeFile(output,JSON.stringify(report,null,2)+'\n');await browser.close();server?.kill();}
