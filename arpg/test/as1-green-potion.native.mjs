// Ordinary UI only after installing a validated isolated save. No screenshots.
import {chromium} from '/home/cocy/.openclaw/workspace/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../..',import.meta.url)),port=8991,base='http://127.0.0.1:'+port;
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
const browser=await chromium.launch({executablePath:'/home/cocy/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
const report={status:'RUNNING',screenshots:0,rows:[],errors:[],consoleErrors:[]};
try {
 for(let i=0;i<40;i++){try{if((await fetch(base+'/arpg/')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 for(const width of [1280,390]) {
  const ctx=await browser.newContext({viewport:{width,height:844},isMobile:width===390,hasTouch:width===390}),page=await ctx.newPage();
  page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text());});
  await page.route('**/www.googletagmanager.com/**',r=>r.fulfill({body:''}));
  const press=async selector=>{const l=page.locator(selector+':visible').first();if(width===390)await l.tap();else await l.click();};
  await page.goto(base+'/arpg/');await page.waitForFunction(()=>window.__arpg);
  await page.evaluate(async()=>{const {createSave,SaveStore,validateSave}=await import('./js/meta/save.js');const s=createSave({name:'초록물약시험',answers:[0,0,0,0,0],createdAt:123});s.gold=200;s.autoUse={potion:false,hp:50,mp:50,recall:false};s.autoBuy={potion:0,mana_potion:0,return_scroll:0,green_potion:0};if(!validateSave(s))throw Error('invalid fixture');new SaveStore(localStorage).save(s);});
  await page.reload();await page.waitForFunction(()=>window.__arpg);if(await page.locator('[data-action="choose-human"]:visible').count())await press('[data-action="choose-human"]');await page.locator('#inn-name').waitFor();
  await press('[data-action="shop"]');await press('[data-action="shop-select"][data-id="green_potion"]');await press('[data-action="shop-count"][data-step="1"]');await press('#shop-buy');
  await page.waitForFunction(()=>__arpg.save.stacks.green_potion===2);assert.equal(await page.evaluate(()=>__arpg.save.gold),180);
  // Close sheet, then ordinary inn navigation.
  if(await page.locator('[data-action="close-sheet"]:visible').count())await press('[data-action="close-sheet"]');
  if(await page.locator('[data-action="inn"]:visible').count())await press('[data-action="inn"]');else await press('[data-action="close-panel"]');
  const sortie=async()=>{await press('[data-action="board"]');await press('[data-action="map-region"][data-region="outskirts"]');await press('[data-action="sortie"][data-stage="S1"]');await press('#sortie-confirm');await page.waitForFunction(()=>__arpg.world?.round?.stageId==='S1');};
  await sortie();const before=await page.evaluate(()=>({agi:__arpg.world.entities[0].effectiveAgi,weight:__arpg.world.entities[0].loadRatio,stats:JSON.stringify(__arpg.save.stats)}));
  await press('#green');await page.waitForFunction(()=>__arpg.world.entities[0].greenActive===true);assert.equal(await page.evaluate(()=>__arpg.world.entities[0].greenPotions),1);assert.equal(await page.evaluate(()=>__arpg.world.entities[0].effectiveAgi),before.agi+20);assert.equal(await page.locator('#green-active').textContent(),'민첩 +20');assert.equal(await page.locator('#green').isDisabled(),true);assert.equal(await page.locator('#green small').textContent(),'1');assert.equal(await page.evaluate(()=>JSON.stringify(__arpg.save.stats)),before.stats);
  const bounds=await page.locator('#green').boundingBox();assert.ok(bounds.height>=44);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await press('#scroll');await page.waitForFunction(()=>__arpg.world?.entities[0].terminal==='return_scroll',{timeout:15000});await page.locator('[data-action="result-inn"]').waitFor({timeout:15000});await press('[data-action="result-inn"]');await page.locator('#inn-name').waitFor();
  assert.equal(await page.evaluate(()=>__arpg.save.stacks.green_potion),1);assert.equal(await page.evaluate(()=>__arpg.save.lastReceipt.used.green_potion),1);
  await sortie();assert.equal(await page.evaluate(()=>!!__arpg.world.entities[0].greenActive),false);assert.equal(await page.evaluate(()=>__arpg.world.entities[0].greenPotions),1);assert.equal(await page.evaluate(()=>__arpg.world.entities[0].effectiveAgi),before.agi);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  report.rows.push({width,bought:2,consumed:1,settled:1,newHuntActive:false,badge:'민첩 +20',overflow:0,touch:width===390});await ctx.close();
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.consoleErrors,[]);report.status='PASS';
} catch(e) {report.status='BLOCKED';report.error=e.stack;throw e;}
finally {await writeFile('/home/cocy/.openclaw/workspace/tmp/arpg-1028-as1-browser.json',JSON.stringify(report,null,2));await browser.close();server.kill();}
