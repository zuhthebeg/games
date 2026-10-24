// Fresh preboot synthetic saves only. No screenshots, runtime/world injection, or live storage.
// ARPG_BASE_URL=https://game.cocy.io ARPG_PICKER_EVIDENCE=/absolute/path.json node arpg/test/forge-picker.native.mjs
import {chromium} from '/home/cocy/.openclaw/workspace/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createSave,validateSave,SAVE_KEY} from '../js/meta/save.js';
import {ITEMS,instance} from '../js/meta/items.js';
const root=fileURLToPath(new URL('../..',import.meta.url));
const remote=!!process.env.ARPG_BASE_URL,port=Number(process.env.ARPG_PICKER_PORT||8987);
const base=(process.env.ARPG_BASE_URL||`http://127.0.0.1:${port}`).replace(/\/$/,'');
const out=process.env.ARPG_PICKER_EVIDENCE||'/home/cocy/.openclaw/workspace/tmp/arpg-forge-picker-local.json';
const report={status:'RUNNING',base,head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),rows:[],errors:[],failures:[],sourceBinding:{},screenshots:0,liveStorage:0,runtimeInjection:0};
let server,browser;
const check=(condition,message)=>{if(!condition)report.failures.push(message);};
const fixture=name=>{
 const s=createSave({name:'장비 선택 검증',answers:[0,0,0,0,0],createdAt:1});
 s.stacks.enhance_stone_1=100;
 if(name==='many')for(const [id]of Object.entries(ITEMS).filter(([,d])=>d.slot).slice(0,24))s.items.push(instance('drop:picker:'+id,id,1,[]));
 assert.equal(validateSave(s),true,name+' fixture must be valid');return s;
};
try{
 if(!remote){server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});for(let i=0;i<40;i++){try{if((await fetch(base+'/arpg/')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}assert.equal(server.exitCode,null);}
 const html=await(await fetch(base+'/arpg/')).text(),map=JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
 for(const path of ['arpg/js/ui/hub.js','arpg/css/game.css']){
  const mapped=path.endsWith('.js')?map['./'+path.slice(5)]:html.match(/href="([^"<>]*css\/game\.css[^"<>]*)"/)[1],url=new URL(mapped,base+'/arpg/');
  const response=await fetch(url),actual=Buffer.from(await response.arrayBuffer());assert.equal(response.status,200);assert.deepEqual(actual,await readFile(root+'/'+path),'exact shipped source '+path);report.sourceBinding[path]={url:url.href,sha256:createHash('sha256').update(actual).digest('hex')};
 }
 browser=await chromium.launch({executablePath:'/home/cocy/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
 for(const [width,height]of [[1280,844],[390,844],[412,915],[554,1200]])for(const name of ['many','sparse'])for(const entry of ['', '?debug=1']){
  const mobile=width!==1280,seed=fixture(name),context=await browser.newContext({viewport:{width,height},isMobile:mobile,hasTouch:mobile,reducedMotion:'reduce'});
  await context.addInitScript(({key,seed})=>{localStorage.setItem(key,JSON.stringify(seed));window.__pickerWrites=[];const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){window.__pickerWrites.push(k);return set.call(this,k,v)};},{key:SAVE_KEY,seed});
  await context.route('**/*',route=>{const r=route.request();if(new URL(r.url()).origin!==new URL(base).origin||!['GET','HEAD'].includes(r.method()))return route.abort();return route.continue();});
  const page=await context.newPage(),requests=new Set();page.setDefaultTimeout(15000);page.on('pageerror',e=>report.errors.push(e.message));page.on('request',r=>requests.add(r.url()));
  const press=async selector=>{const n=page.locator(selector).first();await n.scrollIntoViewIfNeeded();if(mobile)await n.tap();else{await n.focus();await page.keyboard.press('Enter');}};
  await page.goto(base+'/arpg/'+entry,{waitUntil:'networkidle'});if(await page.locator('[data-action="choose-human"]').count())await press('[data-action="choose-human"]');await page.waitForSelector('.inn-fire');await press('[data-action="forge"]');
  const geometry=await page.evaluate(()=>{
   const box=n=>{if(!n)return null;const r=n.getBoundingClientRect(),s=getComputedStyle(n);return {w:r.width,h:r.height,top:r.top,bottom:r.bottom,display:s.display,flex:s.flex,alignItems:s.alignItems,height:s.height,minHeight:s.minHeight,width:s.width,flexDirection:s.flexDirection};};
   const picker=document.querySelector('.forge-picker');return {coarse:matchMedia('(pointer: coarse)').matches,viewport:{w:innerWidth,h:innerHeight},picker:box(picker),selection:box(picker.parentElement),panel:box(picker.parentElement.parentElement),cards:[...picker.children].map(n=>({...box(n),text:n.innerText,uid:n.dataset.uid,copy:box(n.querySelector('.p2-card-copy'))})),emblem:box(picker.querySelector('.p2-emblem')),copy:box(picker.querySelector('.p2-card-copy')),content:box(document.querySelector('.inn-shell>.content')),footer:box(document.querySelector('.action-footer')),documentWidth:document.documentElement.scrollWidth};
  });
  const label=`${width}x${height}/${name}/${entry||'ordinary'}`;
  check(geometry.coarse===mobile,label+' pointer');check(geometry.documentWidth<=width,label+' document overflow');
  check(geometry.picker.h<=155,label+' picker height '+geometry.picker.h);
  for(const c of geometry.cards){check(c.h<=130,label+' card height '+c.h);check(c.w>=44&&c.h>=44,label+' tap target');check(c.w>=80&&c.w<=100,label+' card width '+c.w);}
  await press('[data-action="forge-tab"][data-tab="salvage"]');
  const salvage=await page.locator('.forge-picker').evaluate(n=>({h:n.getBoundingClientRect().height,cards:[...n.children].map(c=>({h:c.getBoundingClientRect().height,w:c.getBoundingClientRect().width}))}));
  check(salvage.h<=155,label+' salvage picker height');for(const c of salvage.cards)check(c.h<=130&&c.w>=80&&c.w<=100,label+' salvage card size');
  let sheet=null;
  if(name!=='empty'){
   await press('.forge-picker .p2-card:last-child');
   assert.equal(await page.locator('dialog[open]').count(),0,'selection remains inline');
   sheet=await page.evaluate(()=>{const d=document.querySelector('.forge-salvage');const b=n=>{const r=n.getBoundingClientRect();return {top:r.top,bottom:r.bottom,w:r.width,h:r.height};};return {inline:b(d),title:b(d.querySelector('h3')),action:b(d.querySelector('[data-action="dismantle"]')),pickerScroll:document.querySelector('.forge-picker').scrollLeft,selected:document.querySelector('.forge-picker [aria-pressed="true"]').dataset.uid,focus:document.activeElement.dataset.uid};});
   if(name==='many')check(sheet.pickerScroll>0,label+' last card scrolled into view');check(sheet.selected===sheet.focus,label+' selected focus retained');check(sheet.title.top>=0&&sheet.title.bottom<=height,label+' selected title visible');check(sheet.action.top>=0&&sheet.action.bottom<=height,label+' selected action visible');
  }
  const persisted=await page.evaluate(key=>({save:JSON.parse(localStorage.getItem(key)),writes:window.__pickerWrites.filter(k=>k.startsWith('arpg.save.')),world:window.__arpg.world}),SAVE_KEY);assert.deepEqual(persisted.save,seed);assert.deepEqual(persisted.writes,[]);assert.equal(persisted.world,null);
  for(const binding of Object.values(report.sourceBinding))assert.ok(requests.has(binding.url),'actual page requested '+binding.url);
  report.rows.push({width,height,entry:entry||'ordinary',fixture:name,geometry,salvage,sheet});await context.close();
 }
 // No valid save can have zero items (a weapon is mandatory). Verify the empty
 // component boundary in an isolated styled document, not an invalid/live save.
 const zero=createSave({name:'빈 선택칸',answers:[0,0,0,0,0],createdAt:1});zero.items=[];assert.equal(validateSave(zero),false);
 for(const [width,height]of [[1280,844],[390,844],[412,915],[554,1200]]){
  const context=await browser.newContext({viewport:{width,height},hasTouch:width!==1280,isMobile:width!==1280}),page=await context.newPage();
  const url=base+'/arpg/test/forge-picker-empty-fixture.html';
  await page.route(url,r=>r.fulfill({contentType:'text/html',body:`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="${report.sourceBinding['arpg/css/game.css'].url}"><div class="inn-shell"><main class="content"><div class="forge-selection"><div class="section-caption"><span>장비 선택</span><span>착용 · 보관</span></div><div class="forge-picker" role="group" aria-label="강화할 장비"></div></div></main></div>`}));
  await page.goto(url);const h=await page.locator('.forge-picker').evaluate(n=>n.getBoundingClientRect().height);check(h<=155,`${width}/empty component picker height`);assert.equal(await page.locator('.forge-picker .p2-card').count(),0);report.rows.push({width,height,fixture:'empty-component',pickerHeight:h,validEmptySave:false});await context.close();
 }
 assert.deepEqual(report.errors,[]);assert.equal(report.failures.length,0,report.failures.slice(0,6).join('; '));report.status='PASS';
}catch(e){report.status='BLOCKED';report.failure=e.stack;process.exitCode=1;}finally{await browser?.close();server?.kill();await writeFile(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,rows:report.rows.length,out,failures:report.failures.slice(0,8),failure:report.failure}));}
