// Save-only valid fixtures; all subsequent equipment/forge/launch actions are native UI.
// No live world edits, forced clear, screenshots, copied/generated art or sim acceleration.
import { chromium } from '/home/cocy/.openclaw/workspace/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import { readFileSync,writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { createSkeletonSave } from '../js/meta/character-creation.js';
import { createSave, validateSave } from '../js/meta/save.js';
import { addXp,xpSpan } from '../js/meta/progression.js';
import { instance } from '../js/meta/items.js';
import { enchant } from '../js/meta/enchant.js';
const root=fileURLToPath(new URL('../../',import.meta.url)),out='/home/cocy/.openclaw/workspace/tmp/arpg-knight-evolution-native.json';
const key='arpg.save.v1.slots.skeleton_knight',humanKey='arpg.save.v1',humanRaw=JSON.stringify(createSave({name:'Human',answers:[0,0,0,0,0],createdAt:1}));
const slots={hands:'hands_light_common_t1',feet:'feet_light_common_t1',body:'cloth_tunic',head:'head_light_common_t1'};
function fixture(level){let s=createSkeletonSave({lineage:'skeleton_knight',name:'영구기사',answers:[0,0,0,0,0],createdAt:1});let xp=0;for(let l=1;l<level;l++)xp+=xpSpan(l);s=addXp(s,xp);for(const [uid,id] of Object.entries(slots))s.items.push(instance(uid,id,0,[]));return s;}
const server=spawn('python3',['-m','http.server','8899','--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
const browser=await chromium.launch({executablePath:'/home/cocy/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
const rows=[],bindings={},pending=[];
try{for(const mobile of [false,true]){
 const ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:800},isMobile:mobile,hasTouch:mobile});
 const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 p.on('response',r=>{const path=new URL(r.url()).pathname;if(path.startsWith('/arpg/js/'))pending.push((async()=>{const body=await r.body();assert.deepEqual(body,readFileSync(root+path.slice(1)));bindings[path]=createHash('sha256').update(body).digest('hex');})());});
 await p.route('**/www.googletagmanager.com/**',r=>r.fulfill({body:''}));
 await p.goto('http://127.0.0.1:8899/arpg/');await p.locator('[data-action="choose-skeleton"]').waitFor();
 const tap=async sel=>{const node=p.locator(sel);await node.scrollIntoViewIfNeeded();return mobile?node.tap():node.click();};
 const save=()=>p.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
 const raw=()=>p.evaluate(k=>localStorage.getItem(k),key);
 const seed=async s=>{assert.equal(validateSave(s),true);await p.evaluate(f=>{localStorage.setItem(f.key,JSON.stringify(f.save));localStorage.setItem(f.humanKey,f.humanRaw);}, {key,save:s,humanKey,humanRaw});await p.goto('http://127.0.0.1:8899/arpg/?character=skeleton_knight');await p.locator('#inn-name').waitFor();};
 const open=async slot=>{await tap('[data-action="bag"]');await tap(`[data-action="socket"][data-slot="${slot}"]`);await tap(`[data-action="open-item"][data-uid="${slot}"]`);};
 const thresholds=[];
 for(const [slot,min] of [['hands',8],['feet',15],['body',22],['head',30]])for(const level of [min-1,min]){
  await seed(fixture(level));await open(slot);const button=p.locator(`[data-action="equip"][data-uid="${slot}"]`);assert.equal(await button.isDisabled(),level<min);
  if(level<min){assert.match(await p.locator('dialog[open]').innerText(),new RegExp(`Lv.${min}`));assert.equal((await save()).equipped[slot],null);}
  else{await tap(`[data-action="equip"][data-uid="${slot}"]`);const before=await raw();assert.equal((await save()).equipped[slot],slot);assert.notEqual((await save()).permanentDeathKnight,true);await p.reload();await p.locator('#inn-name').waitFor();assert.equal(await raw(),before);assert.equal((await save()).equipped[slot],slot);}
  thresholds.push({slot,level,allowed:level>=min});
 }
 // Fixture has no equipped armor and no permanent flag. All four actual UI equips are required.
 const final=fixture(30);final.items.find(i=>i.uid==='head').enhance=11;final.stacks.scroll_enchant_armor=1;
 // Select a deterministic ordinary forge failure, not an injected result or random override.
 for(let n=0;n<100;n++){final.enchantCount=n;const candidate={...final,permanentDeathKnight:true};if(enchant(candidate,'head','scroll_enchant_armor').result.outcome==='destroyed')break;}
 await seed(final);assert.doesNotMatch(await p.locator('#inn-name').innerText(),/데스나이트/);
 for(const slot of ['hands','feet','body']){await open(slot);await tap(`[data-action="equip"][data-uid="${slot}"]`);assert.notEqual((await save()).permanentDeathKnight,true);await tap('[data-action="inn"]');}
 await open('head');const old=await raw();
 // Task-specific scoped storage failure; no game state mutation.
 await p.evaluate(k=>{const original=Storage.prototype.setItem;window.restoreEvolutionStorage=()=>{Storage.prototype.setItem=original;};Storage.prototype.setItem=function(key,v){if(key===k)throw Error('quota evolution fixture');return original.call(this,key,v);};},key);
 await tap('[data-action="equip"][data-uid="head"]');assert.equal(await raw(),old);assert.equal(await p.evaluate(()=>__arpg.save.permanentDeathKnight),undefined);assert.equal(await p.evaluate(()=>__arpg.save.equipped.head),null);assert.match(await p.locator('#sheet-error').innerText(),/quota/);
 await p.evaluate(()=>window.restoreEvolutionStorage());await tap('[data-action="equip"][data-uid="head"]');let evolved=await save();assert.equal(evolved.permanentDeathKnight,true);assert.equal(evolved.equipped.head,'head');assert.equal(validateSave(evolved),true);
 await tap('[data-action="inn"]');assert.match(await p.locator('#inn-name').innerText(),/데스나이트/);assert.match(await p.locator('#meta-screen').innerText(),/전투 아틀라스 로드/);assert.match(await p.locator('.p2-hero').getAttribute('aria-label'),/데스나이트/);
 let before=await raw();await p.reload();await p.locator('#inn-name').waitFor();assert.equal(await raw(),before);assert.match(await p.locator('#inn-name').innerText(),/데스나이트/);
 // Existing forge really destroys and unequips the head. Permanent state must survive both.
 await tap('[data-action="bag"]');await tap('[data-action="socket"][data-slot="head"]');await tap('[data-action="socket-forge"][data-uid="head"]');await tap('[data-action="enhance"][data-uid="head"]');
 const removed=await save();assert.equal(removed.equipped.head,null);assert.ok(!removed.items.some(i=>i.uid==='head'));assert.equal(removed.permanentDeathKnight,true);assert.equal(validateSave(removed),true);before=await raw();await p.reload();await p.locator('#inn-name').waitFor();assert.equal(await raw(),before);assert.match(await p.locator('#inn-name').innerText(),/데스나이트/);
 await tap('[data-action="board"]');await tap('[data-action="sortie"][data-stage="S1"]');await tap('#sortie-confirm');await p.waitForFunction(()=>__arpg.world?.round?.stageId==='S1'&&__arpg.world.tick>0);await p.waitForFunction(()=>__arpg.art.visuals[0]?.mode==='atlas');
 assert.equal(await p.evaluate(()=>__arpg.world.round.presentation.form),'death_knight');assert.match(await p.locator('#stage-name').innerText(),/데스나이트/);const art=await p.evaluate(()=>JSON.parse(JSON.stringify(__arpg.art.visuals[0])));assert.equal(art.id,'player-death-knight');assert.equal(art.presentation,'death_knight');assert.equal(art.artFallback,null);assert.equal(art.dodgeFallback,null);
 assert.equal(await p.evaluate(k=>localStorage.getItem(k),humanKey),humanRaw);assert.deepEqual(errors,[]);rows.push({width:mobile?390:1280,thresholds,allButOneNotEvolved:true,finalNativeEquipSaved:true,storageFailureOldStateExact:true,reloadPermanent:true,realForgeUnequipPermanent:true,humanExact:true,hudTrueForm:true,art,errors});
 console.log('evolution native PASS',mobile?390:1280);await ctx.close();
}await Promise.all(pending);writeFileSync(out,JSON.stringify({pass:true,rows,bindings,screenshots:0,liveWorldWrites:0,fixture:'valid save only; actual UI equips/forge/launch'},null,2));}finally{await browser.close();server.kill();}
