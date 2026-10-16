import {chromium} from '/home/cocy/.openclaw/workspace/node_modules/playwright/index.mjs';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const base=process.env.ARPG_BASE_URL || process.env.BASE_URL || 'http://127.0.0.1:8894';
const server=(process.env.ARPG_BASE_URL || process.env.BASE_URL)?null:spawn('python3',['-m','http.server','8894','--bind','127.0.0.1'],{cwd:new URL('../../',import.meta.url).pathname,stdio:'ignore'});
const browser=await chromium.launch({executablePath:'/home/cocy/bin/chromium',headless:true,args:['--no-sandbox']});
const errors=[];
try {
 for(let i=0;i<30;i++){try{if((await fetch(`${base}/arpg/`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 for(const width of [1280,390]){
  const page=await browser.newPage({viewport:{width,height:844}});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${base}/arpg/?dev=1&debug=1`);await page.waitForFunction(()=>!!window.__arpg);
  await page.evaluate(async()=>{const {createSave,SaveStore}=await import('./js/meta/save.js');const {trained}=await import('./test/fixtures/trained.js');const {instance}=await import('./js/meta/items.js');const save=trained(createSave({name:'support',answers:[0,0,0,0,0],weapon:'focus',createdAt:1}));save.items.push(instance('holy-staff','altar_staff',0,[]));save.equipped.weapon='holy-staff';save.gold=600;save.autoUse={potion:false,hp:50,mp:50,recall:false};new SaveStore(localStorage).save(save);});
  await page.reload();await page.locator('[data-action="trainer"]').click();
  const skills=['healing_light','protective_shield','turn_undead'];
  for(const [slot,id] of skills.entries()){
   await page.locator(`[data-skill="${id}"] [data-action="learn-skill"]`).click();
   await page.locator(`[data-action="skill-slot"][data-id="${id}"][data-slot="${slot}"]`).click();
   assert.equal(await page.locator(`[data-action="skill-slot"][data-id="${id}"][data-slot="${slot}"]`).getAttribute('aria-pressed'),'true');
  }
  await page.locator('[data-action="inn"]').click();await page.locator('[data-action="board"]').click();await page.locator('[data-action="sortie"][data-stage="S1"]').click();await page.locator('#sortie-confirm').click();
  for(const [slot,id]of skills.entries())await page.waitForSelector(`#${['skill','skill2','skill3'][slot]} [data-skill-icon="${id}"]`);
  const initialMp=await page.evaluate(()=>window.__arpg.world.entities[0].mp);
  await page.locator('#skill').click();await page.waitForFunction(mp=>window.__arpg.world.entities[0].mp<mp-24,initialMp);await page.waitForFunction(()=>!window.__arpg.world.entities[0].act);
  assert.ok(await page.evaluate(()=>window.__arpg.world.entities[0].cds.healing_light>0));
  const beforeShield=await page.evaluate(()=>window.__arpg.world.entities[0].mp);
  await page.locator('#skill2').click();await page.waitForFunction(()=>window.__arpg.world.entities[0].shieldUntil>window.__arpg.world.tick);await page.waitForFunction(()=>!window.__arpg.world.entities[0].act);
  assert.ok(await page.evaluate(mp=>window.__arpg.world.entities[0].mp<mp-18,beforeShield));
  const beforeTurn=await page.evaluate(()=>window.__arpg.world.entities[0].mp);
  await page.locator('#skill3').click();await page.waitForFunction(mp=>window.__arpg.world.entities[0].mp<mp-20,beforeTurn);await page.waitForFunction(()=>!window.__arpg.world.entities[0].act);
  const state=await page.evaluate(()=>{const p=window.__arpg.world.entities[0];return {skills:p.skills,affinity:p.staffAffinity,shield:p.shieldUntil>window.__arpg.world.tick,cd:p.cds.turn_undead||0};});
  assert.deepEqual(state.skills,skills);assert.equal(state.affinity,'holy');assert.equal(state.shield,true);assert.equal(state.cd,0);
  const saved=await page.evaluate(async()=>{const {SaveStore}=await import('./js/meta/save.js');return new SaveStore(localStorage).load();});assert.deepEqual(saved.loadout,skills);
  console.log(`${width} support academy learn/equip/save + real HUD heal/shield/turn casts PASS`);await page.close();
 }
 assert.deepEqual(errors,[]);
}finally{await browser.close();server?.kill();}
