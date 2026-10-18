// Fresh synthetic save only. No screenshots, existing profiles, or world overrides.
// Replay: ARPG_BASE_URL=https://game.cocy.io ARPG_ARMOR_EVIDENCE=/absolute/report.json node arpg/tools/item-art-armor-v2.native.mjs
import {chromium} from '/home/cocy/.openclaw/workspace/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {writeFile,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createSave,validateSave,SAVE_KEY} from '../js/meta/save.js';
import {ITEMS} from '../js/meta/items.js';
import {noteMaterials} from '../js/meta/recipe-discovery.js';
const root=fileURLToPath(new URL('../..',import.meta.url)),port=8968;
const base=(process.env.ARPG_BASE_URL||`http://127.0.0.1:${port}`).replace(/\/$/,'');
const out=process.env.ARPG_ARMOR_EVIDENCE||'/home/cocy/.openclaw/workspace/tmp/arpg-armor-v2-native.json';
let server,browser;const report={status:'RUNNING',base,rows:[],errors:[],screenshots:0,existingProfiles:0,worldWrites:0};
try{
 if(!process.env.ARPG_BASE_URL){server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});for(let i=0;i<40;i++){try{if((await fetch(base+'/arpg/')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}}
 const manifest=JSON.parse(await readFile(new URL('../assets/items/armor-v2-manifest.json',import.meta.url)));
 for(const a of manifest.assets){const b=Buffer.from(await(await fetch(base+'/arpg/assets/items/'+a.output)).arrayBuffer());assert.deepEqual(b,await readFile(new URL('../assets/items/'+a.output,import.meta.url)));}
 browser=await chromium.launch({executablePath:'/home/cocy/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
 for(const width of [1280,390]){
  let s=createSave({name:'장비 그림 시험',answers:[0,0,0,0,0],createdAt:1});s.gold=10000;s.stacks={...s.stacks,wood:100,hide:100,scrap:100,fang:100,undead_bone:100};s=noteMaterials(s);
  const bases=['feet_light_common_t1','feet_heavy_common_t1','head_heavy_common_t1','head_light_common_t1','round_shield','bone_set_head','bone_set_feet','boar_cap','boar_boots'];
  for(const baseId of bases)for(const rarity of ['common','fine','rare','epic']){const id=ITEMS[baseId].rarity===rarity?baseId:baseId+'_'+rarity;if(ITEMS[id])s.items.push({id,uid:'art:'+id,enhance:0,affixes:[],rolledAt:0});}
  assert.equal(validateSave(s),true);
  const c=await browser.newContext({viewport:{width,height:900},isMobile:width===390,hasTouch:width===390});await c.addInitScript(({s,key})=>localStorage.setItem(key,JSON.stringify(s)),{s,key:SAVE_KEY});
  const page=await c.newPage();page.on('pageerror',e=>report.errors.push(e.message));
  const press=async selector=>{const n=page.locator(selector).first();await n.scrollIntoViewIfNeeded();if(width===390)await n.tap();else{await n.focus();await page.keyboard.press('Enter');}};
  await page.goto(base+'/arpg/');await press('[data-action="choose-human"]');await page.waitForSelector('.inn-fire');
  const audit=async route=>{
   const result=await page.locator('#meta-screen').evaluate(async root=>{
    const imgs=[...root.querySelectorAll('img[src*="-armor-v2.webp"]')];for(const n of imgs){n.loading='eager';await n.decode();}
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    return {route:root.dataset.page,count:imgs.length,paths:[...new Set(imgs.map(n=>n.getAttribute('src')))],images:imgs.map(n=>({width:n.naturalWidth,height:n.naturalHeight,ready:n.closest('.item-art').classList.contains('art-ready'),svg:getComputedStyle(n.closest('.item-art').querySelector('svg')).visibility,decorative:n.alt===''&&n.closest('[aria-hidden="true"]')!==null})),overflow:document.documentElement.scrollWidth>innerWidth+1||root.querySelector('.content').scrollWidth>root.querySelector('.content').clientWidth+1,labels:[...root.querySelectorAll('[data-action="open-item"]')].map(n=>n.textContent.trim()),grades:[...root.querySelectorAll('.p2-emblem')].map(n=>n.className)};
   });assert.ok(result.count>0,route);assert.equal(result.overflow,false,route);for(const im of result.images){assert.equal(im.width,256);assert.equal(im.height,256);assert.equal(im.ready,true);assert.equal(im.svg,'hidden');assert.equal(im.decorative,true);}report.rows.push({width,route,...result});return result;
  };
  await press('[data-action="bag"]');assert.equal(await page.locator('.bag-equipped').count(),6);report.rows.push({width,route:'bag',semanticSlotLabels:await page.locator('.bag-equipped').allTextContents()});await press('[data-action="socket"][data-slot="head"]');await audit('bag head picker');await press('[data-action="close-sheet"]');await press('[data-action="inn"]');await press('[data-action="inventory"]');const bag=await audit('inventory gear');assert.equal(bag.paths.length,5);assert.ok(bag.labels.length>5);for(const rarity of ['common','fine','rare','epic'])assert.ok(bag.grades.some(c=>c.split(' ').includes(rarity)),rarity);
  await press('[data-action="open-item"][data-uid="art:round_shield"]');await audit('gear detail');assert.ok((await page.locator('dialog[open]').innerText()).includes('방패'));
  await press('[data-action="close-sheet"]');
  const im=page.locator('img[src*="shield-armor-v2.webp"]').first();await im.evaluate(n=>{n.loading='eager';n.src='assets/items/intentionally-missing-armor-test.webp';});await page.waitForFunction(()=>{const n=document.querySelector('img[src*="intentionally-missing"]');return n.hidden&&!n.closest('.item-art').classList.contains('art-ready')&&getComputedStyle(n.closest('.item-art').querySelector('svg')).visibility==='visible';});report.rows.push({width,route:'failed image',svgFallback:true});
  await press('[data-action="inn"]');await press('[data-action="forge"]');await press('[data-action="forge-tab"][data-tab="salvage"]');await audit('crafting');assert.ok(await page.locator('.recipe b').count()>0);
  assert.equal(await page.evaluate(()=>window.__arpg.world),null);await c.close();
 }
 assert.deepEqual(report.errors,[]);report.status='PASS';
}catch(e){report.status='BLOCKED';report.failure=e.stack;process.exitCode=1;}finally{await browser?.close();server?.kill();await writeFile(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,rows:report.rows.length,out,failure:report.failure}));}
