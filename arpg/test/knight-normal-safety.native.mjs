import { chromium } from '/home/cocy/.openclaw/workspace/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import {createSkeletonSave} from '../js/meta/character-creation.js';
import {createSave} from '../js/meta/save.js';
const root=fileURLToPath(new URL('../../',import.meta.url)),key='arpg.save.v1.slots.skeleton_knight',human='arpg.save.v1';
const profile=createSkeletonSave({lineage:'skeleton_knight',name:'안전기사',answers:[1,2,3,0,2],createdAt:1});
const server=spawn('python3',['-m','http.server','8898','--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
const browser=await chromium.launch({executablePath:'/home/cocy/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
const rows=[];
async function setup(fixture,url=''){
 const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true}),p=await ctx.newPage(),errors=[],writes=[];
 p.on('pageerror',e=>errors.push(e.message));await p.route('**/www.googletagmanager.com/**',r=>r.fulfill({body:''}));
 await p.addInitScript(f=>{for(const[k,v]of Object.entries(f))localStorage.setItem(k,v);},fixture);
 const cdp=await ctx.newCDPSession(p);await cdp.send('DOMStorage.enable');for(const type of ['domStorageItemAdded','domStorageItemUpdated','domStorageItemRemoved'])cdp.on('DOMStorage.'+type,e=>{if(e.storageId.isLocalStorage)writes.push(e.key);});
 await p.goto('http://127.0.0.1:8898/arpg/'+url);await p.locator('[data-action="choose-skeleton"]').waitFor();writes.length=0;
 return{ctx,p,errors,writes};
}
try{
 for(const value of ['BROKEN',JSON.stringify({...profile,lineage:'human'})]){
 const {ctx,p,errors,writes}=await setup({[human]:'CORRUPT HUMAN SENTINEL',[key]:value});await p.locator('[data-action="choose-skeleton"]').tap();await p.locator('[data-action="choose-knight"]').tap();assert.match(await p.locator('#meta-error').textContent(),/손상/);assert.equal(await p.evaluate(k=>localStorage.getItem(k),human),'CORRUPT HUMAN SENTINEL');assert.equal(await p.evaluate(k=>localStorage.getItem(k),key),value);assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);rows.push({case:'corrupt/foreign slot',writes:0});await ctx.close();
 }
 {
 const{ctx,p,errors,writes}=await setup({[human]:'CORRUPT HUMAN SENTINEL',[key]:JSON.stringify(profile)},'?character=skeleton_knight&room=unsupported');assert.match(await p.locator('#meta-error').textContent(),/협동/);assert.equal(await p.evaluate(k=>localStorage.getItem(k),human),'CORRUPT HUMAN SENTINEL');assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);rows.push({case:'room guard before lobby/human load',writes:0});await ctx.close();
 }
 {
 const humanRaw=JSON.stringify(createSave({name:'HUMAN',answers:[0,1,2,3,0],weapon:'blade',createdAt:1}));
 const{ctx,p,errors}=await setup({[human]:humanRaw,[key]:JSON.stringify(profile)});let release;const gate=new Promise(r=>release=r);let entered=false;
 await p.route('**/assets/sprites/skeleton-warrior/*.json',async r=>{entered=true;await gate;await r.continue();});
 await p.locator('[data-action="choose-skeleton"]').tap();await p.locator('[data-action="choose-knight"]').tap();await p.locator('[data-action="board"]').tap();await p.locator('[data-action="sortie"][data-stage="S1"]').tap();await p.locator('#sortie-confirm').tap();
 await p.waitForFunction(()=>__arpg.world?.tick>0);assert.equal(await p.evaluate(()=>__arpg.mode),'skeleton_knight');
 await p.locator('#scroll').tap();await p.waitForFunction(()=>__arpg.world.entities[0].terminal==='return_scroll',null,{timeout:15000});await p.locator('[data-action="result-inn"]').tap();
 const knightRaw=await p.evaluate(k=>localStorage.getItem(k),key);await p.locator('[data-action="character-choice"]').tap();await p.locator('[data-action="choose-human"]').tap();release();
 await p.locator('[data-action="board"]').tap();await p.locator('[data-action="sortie"][data-stage="S1"]').tap();await p.locator('#sortie-confirm').tap();await p.waitForFunction(()=>__arpg.world?.round?.stageId==='S1'&&__arpg.world.tick>5&&(__arpg.art.visuals[0]?.id==='hero-sword'||__arpg.art.visuals[0]?.mode==='paperdoll'));
 assert.equal(await p.evaluate(()=>__arpg.mode),'human');assert.equal(await p.evaluate(k=>localStorage.getItem(k),key),knightRaw);assert.deepEqual(errors,[]);rows.push({case:'pending skeleton atlas after human switch cannot restore stale provider',delayedRequestObserved:entered,errors});assert.ok(entered);await ctx.close();
 }
 writeFileSync('/home/cocy/.openclaw/workspace/tmp/arpg-knight-normal-safety.json',JSON.stringify({pass:true,rows,screenshots:0},null,2));console.log(JSON.stringify({pass:true,rows},null,2));
}finally{await browser.close();server.kill();}
