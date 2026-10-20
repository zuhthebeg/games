// Boot-only synthetic saves; natural equipment input; read-only DOM/combat observers.
import {chromium} from '/home/cocy/.openclaw/workspace/node_modules/playwright/index.mjs';
import {spawn,execFileSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {createSave,validateSave} from '../js/meta/save.js';
import {createSkeletonSave} from '../js/meta/character-creation.js';
import {trained} from './fixtures/trained.js';
import {instance,ITEMS} from '../js/meta/items.js';
import {SHIELDS} from '../js/content/shields.js';
const root=fileURLToPath(new URL('../..',import.meta.url)),base=process.env.ARPG_BASE_URL||'http://127.0.0.1:8996',tmp='/home/cocy/.openclaw/workspace/tmp/';
const out=process.env.ARPG_INN_SHIELD_EVIDENCE||tmp+'arpg-inn-shield-local.json';
const server=process.env.ARPG_BASE_URL?null:spawn('python3',['-m','http.server','8996','--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
const report={status:'RUNNING',base,head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),rows:[],errors:[],screenshots:0,worldWrites:0,liveSaveReads:0};
const browser=await chromium.launch({executablePath:'/home/cocy/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
try{
 for(let n=0;n<30;n++){try{if((await fetch(base+'/arpg/')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 for(const width of (process.env.INN_WIDTHS||'1280,390').split(',').map(Number))for(const kind of (process.env.INN_KINDS||'human,skeleton,evolved').split(',')){
 const bone=kind!=='human',s=trained(bone?createSkeletonSave({lineage:'skeleton_knight',name:'shield',answers:[0,0,0,0,0],createdAt:1}):createSave({name:'shield',answers:[0,0,0,0,0],createdAt:1}),30);if(kind==='evolved')s.permanentDeathKnight=true;s.stats.str+=20;s.statPoints-=20;
 const weapons=['iron_sword','chief_maul','apprentice_wand','short_bow','altar_staff',Object.keys(ITEMS).find(id=>ITEMS[id].kind==='weapon'&&ITEMS[id].handedness===2)];
 for(const id of [...Object.keys(SHIELDS),...weapons])s.items.push(instance('fixture:'+id,id,0,[]));assert.ok(validateSave(s));
 const ctx=await browser.newContext({viewport:{width,height:844},hasTouch:width===390,isMobile:width===390,reducedMotion:'reduce'});await ctx.route('**/www.googletagmanager.com/**',r=>r.fulfill({body:''}));await ctx.addInitScript(({s,bone})=>{if(!sessionStorage.getItem('innShieldSeed')){localStorage.setItem(bone?'arpg.save.v1.slots.skeleton_knight':'arpg.save.v1',JSON.stringify(s));sessionStorage.setItem('innShieldSeed','1');}},{s,bone});
 const page=await ctx.newPage(),touch=await ctx.newCDPSession(page);page.setDefaultTimeout(20000);page.on('pageerror',e=>report.errors.push(e.message));
 const press=async selector=>{const el=page.locator(selector).first();await el.scrollIntoViewIfNeeded();width===390?await el.tap():await el.click();};
 const ready=()=>page.waitForFunction(()=>document.querySelector('.p2-hero[data-paperdoll-ready]'));
 const equip=async(id,slot)=>{if(await page.evaluate(({id,slot})=>__arpg.save.equipped[slot]==='fixture:'+id,{id,slot}))return;await press(`[data-action="socket"][data-slot="${slot}"]`);await press(`[data-action="open-item"][data-uid="fixture:${id}"]`);await press(`[data-action="equip"][data-uid="fixture:${id}"]`);if(await page.locator('[data-action="weapon-confirm"]').count())await press('[data-action="weapon-confirm"]');await ready();};
 const observe=()=>page.locator('.p2-hero').evaluate(n=>{const svg=n.querySelector('.portrait-shield');return{direction:n.dataset.direction,ready:n.dataset.paperdollReady,shield:svg?{type:svg.dataset.shieldType,shape:svg.dataset.shape,behind:svg.dataset.behind,hand:[+svg.dataset.handX,+svg.dataset.handY],transform:svg.querySelector('g').getAttribute('transform'),paths:svg.querySelectorAll('path').length,invalid:/NaN|undefined/.test(svg.outerHTML),z:getComputedStyle(svg).zIndex}:null,overflow:document.documentElement.scrollWidth>innerWidth};});
 await page.goto(base+'/arpg/?character='+(bone?'skeleton_knight':'human'));await page.locator('#inn-name').waitFor();await ready();const row={width,kind,shields:[],restrictions:[]};report.rows.push(row);assert.equal((await observe()).shield,null);
 for(const id of Object.keys(SHIELDS)){
 await equip(id,'offhand');let state=await observe();assert.equal(state.shield.type,id);assert.equal(state.shield.shape,SHIELDS[id].shape);assert.ok(state.shield.paths>3&&!state.shield.invalid&&!state.overflow);
 // Native portrait drag changes the same hand socket and front/back layer.
 const box=await page.locator('.character-portrait').boundingBox();const x=box.x+box.width/2,y=box.y+box.height/2;
 if(width===390){const cdp=touch;await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});await page.waitForTimeout(100);for(let step=1;step<=4;step++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+step*12,y,id:1}]});await page.waitForTimeout(50);}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}else{await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+48,y,{steps:4});await page.mouse.up();}
 await page.waitForTimeout(350);const rotated=await observe();assert.notEqual(rotated.direction,state.direction);assert.notDeepEqual(rotated.shield.hand,state.shield.hand);assert.equal(rotated.shield.behind,String(['E','NE','N','NW'].includes(rotated.direction)));row.shields.push({id,state,rotated});
 if(!process.env.ARPG_BASE_URL&&width===1280){await page.locator('.character-portrait').screenshot({path:tmp+`arpg-inn-shield-${kind}-${id}-after.png`});report.screenshots++;}
 }
 await press('[data-action="socket"][data-slot="offhand"]');await press('[data-action="unequip"][data-slot="offhand"]');await ready();assert.equal((await observe()).shield,null);
 // Only human can freely equip the human wand/bow catalogue. Skeleton restrictions stay authoritative.
 if(!bone){for(const id of weapons){await equip(id,'weapon');const d=ITEMS[id],allowed=d.handedness!==2&&(d.family==='blade'||d.form==='wand');if(allowed){await equip('buckler','offhand');assert.equal((await observe()).shield.type,'buckler');}else assert.equal((await observe()).shield,null);row.restrictions.push({id,allowed});}}
 // End each lineage in a naturally entered fight and observe actual loaded combat visual.
 if(!bone)await equip('iron_sword','weapon');await equip('bone_shield','offhand');await press('[data-action="board"]');await press('[data-action="map-region"][data-region="outskirts"]');await press('[data-action="sortie"][data-stage="S1"]');await press('#sortie-confirm');await page.waitForFunction(()=>__arpg.world?.round?.stageId==='S1'&&__arpg.art.visuals.some(v=>v.physicalShield));
 await page.waitForTimeout(1200);row.combat=await page.evaluate(()=>({visuals:__arpg.art.visuals,failed:__arpg.art.failed}));assert.ok(row.combat.visuals.some(v=>v.physicalShield));row.status='PASS';await ctx.close();console.log(JSON.stringify({width,kind,status:'PASS'}));
 }
 assert.deepEqual(report.errors,[]);report.status='PASS';
}catch(e){report.status='FAIL';report.failure=e.stack;throw e;}finally{await writeFile(out,JSON.stringify(report,null,2));await browser.close();server?.kill();}
