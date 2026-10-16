import {chromium} from '/home/cocy/.openclaw/workspace/node_modules/playwright/index.mjs';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const base=process.env.ARPG_BASE_URL || process.env.BASE_URL || 'http://127.0.0.1:8893';
const server=(process.env.ARPG_BASE_URL || process.env.BASE_URL) ? null : spawn('python3',['-m','http.server','8893','--bind','127.0.0.1'],{cwd:new URL('../../',import.meta.url).pathname,stdio:'ignore'});
const browser=await chromium.launch({executablePath:'/home/cocy/bin/chromium',headless:true,args:['--no-sandbox']});const errors=[];
try {for(let i=0;i<30;i++){try{if((await fetch(`${base}/arpg/`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
for(const width of [1280,390]){
 const page=await browser.newPage({viewport:{width,height:844}});page.on('pageerror',e=>errors.push(e.message));await page.goto(`${base}/arpg/?dev=1&debug=1`);await page.waitForFunction(()=>!!window.__arpg);
 await page.evaluate(async()=>{const {createSave,SaveStore}=await import('./js/meta/save.js');const {trained}=await import('./test/fixtures/trained.js');const save=trained(createSave({name:'holy',answers:[0,0,0,0,0],weapon:'focus',createdAt:1}));save.gold=600;save.autoUse={potion:false,hp:50,mp:50,recall:false};new SaveStore(localStorage).save(save);});
 await page.reload();await page.waitForSelector('[data-action="trainer"]');await page.locator('[data-action="trainer"]').click();
 const card=page.locator('[data-skill="turn_undead"]');await card.waitFor();assert.match(await card.textContent(),/실패 시 쿨타임 없음/);await card.locator('[data-action="learn-skill"]').click();
 await page.locator('[data-action="skill-slot"][data-id="turn_undead"][data-slot="0"]').click();assert.equal(await page.locator('[data-action="skill-slot"][data-id="turn_undead"][data-slot="0"]').getAttribute('aria-pressed'),'true');
 await page.locator('[data-action="inn"]').click();await page.locator('[data-action="board"]').click();await page.locator('[data-action="sortie"][data-stage="S1"]').click();await page.locator('#sortie-confirm').click();
 await page.waitForSelector('#skill [data-skill-icon="turn_undead"]');const before=await page.evaluate(()=>window.__arpg.world.entities[0].mp);await page.locator('#skill').click();await page.waitForFunction(before=>window.__arpg.world.entities[0].mp<before-20,before);await page.waitForFunction(()=>!window.__arpg.world.entities[0].act);assert.equal(await page.evaluate(()=>window.__arpg.world.entities[0].cds.turn_undead||0),0);
 await page.waitForFunction(()=>document.querySelector('#skill small').textContent==='0.0'||!document.querySelector('#skill').disabled,{timeout:5000});
 const save=await page.evaluate(async()=>{const {SaveStore}=await import('./js/meta/save.js');return new SaveStore(localStorage).load();});assert.ok(save.learned.includes('turn_undead'));assert.equal(save.loadout[0],'turn_undead');console.log(`${width} real academy learn/equip/cast PASS`);await page.close();}
assert.deepEqual(errors,[]);
}finally{await browser.close();server?.kill();}
