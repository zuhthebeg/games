import {chromium} from '/home/cocy/.openclaw/workspace/node_modules/playwright/index.mjs';
import {spawn,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createSkeletonSave} from '../js/meta/character-creation.js';
import {createSave} from '../js/meta/save.js';
const root=fileURLToPath(new URL('../../',import.meta.url));
const server=spawn('python3',['-m','http.server','8914','--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
const browser=await chromium.launch({executablePath:'/home/cocy/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
const rows=[];
try{
const p=await browser.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.route('**/www.googletagmanager.com/**',r=>r.fulfill({body:''}));
if(process.env.RED)for(const file of ['paperdoll-library.js','skeleton-equipment-compose.js']){
 const old=execFileSync('git',['show',`9e29ecc:arpg/js/render/${file}`],{cwd:root});await p.route(`**/js/render/${file}*`,r=>r.fulfill({contentType:'text/javascript',body:old}));}
let stalled=false,release;const gate=new Promise(r=>release=r);
const heldPattern=url=>{const p=new URL(url).pathname;return p.includes('/player-skeleton-equipment/')&&(p.endsWith('.png')||p.endsWith('.webp'));};
await p.route(heldPattern,async r=>{stalled=true;await gate;await r.abort().catch(()=>{});});
await p.addInitScript(f=>{localStorage.setItem('arpg.save.v1',JSON.stringify(f.h));localStorage.setItem('arpg.save.v1.slots.skeleton_knight',JSON.stringify(f.s));},{h:createSave({name:'Human',answers:[0,0,0,0,0],createdAt:1}),s:createSkeletonSave({lineage:'skeleton_knight',name:'Skeleton',answers:[0,0,0,0,0],createdAt:1})});
await p.goto('http://127.0.0.1:8914/arpg/?character=skeleton_knight');await p.locator('#inn-name').waitFor();
// Manifest defines WebP sources; hold either source extension, never fail request first.
if(!stalled){await p.route('**/player-skeleton-equipment/*.webp',async r=>{stalled=true;await gate;await r.abort().catch(()=>{});});}
await p.waitForFunction(()=>!document.querySelector('.p2-hero')?.dataset.paperdollReady);
for(let n=0;n<100&&!stalled;n++)await new Promise(r=>setTimeout(r,20));assert.ok(stalled,'bare skeleton load reached stalled source');
await p.locator('[data-action="character-choice"]').click();await p.locator('[data-action="choose-human"]').click();
const start=Date.now();await p.waitForFunction(()=>document.querySelector('.p2-hero')?.dataset.paperdollReady,null,{timeout:5000});
assert.equal(stalled,true);rows.push({nativeSwitchWhileOldRequestStillHeld:true,humanPortraitMs:Date.now()-start});
await p.locator('[data-action="board"]').click();await p.locator('[data-action="sortie"][data-stage="S1"]').click();await p.locator('#sortie-confirm').click();await p.waitForFunction(()=>__arpg.art.visuals[0]?.id==='paperdoll-blade');release();await p.unroute(heldPattern);await p.unroute('**/player-skeleton-equipment/*.webp');
// Fault injection only at resource API seam; no live simulation writes.
const stages=await p.evaluate(async()=>{
 const {PaperdollLibrary}=await import('./js/render/paperdoll-library.js');const {loadBlob,decodeBitmap}=await import('./js/render/composition-load.js');
 const originalFetch=window.fetch,originalBitmap=window.createImageBitmap,rows=[];
 for(const stage of ['response','body','bitmap']){
  let aborted=false,closed=0,finish;
  window.fetch=(_url,{signal}={})=>{signal?.addEventListener('abort',()=>aborted=true);if(stage==='response')return new Promise(()=>{});return Promise.resolve({ok:true,blob:()=>stage==='body'?new Promise(()=>{}):Promise.resolve(new Blob())});};
  window.createImageBitmap=()=>new Promise(r=>finish=()=>r({close(){closed++;}}));
  const cache=new PaperdollLibrary({timeoutMs:40,compose:async(d,s)=>{if(d.key==='ok')return {metrics:{outputRGBABytes:0}};const b=await loadBlob('/hung',s);const bitmap=await decodeBitmap(b,s);bitmap.close();return {metrics:{}};},dispose:()=>{}});
  const before=performance.now();try{await cache.acquire({key:'hung'});throw Error('expected timeout');}catch(e){if(!/deadline/.test(e.message))throw e;}
  const good=await cache.acquire({key:'ok'});good.release();if(finish){finish();await new Promise(r=>setTimeout(r,0));if(closed!==1)throw Error('late bitmap leaked');}
  rows.push({stage,elapsedMs:performance.now()-before,aborted,closed,status:cache.status()});
 }
 window.fetch=originalFetch;window.createImageBitmap=originalBitmap;return rows;
});
const cleanup=await p.evaluate(async()=>{
 const {PaperdollLibrary}=await import('./js/render/paperdoll-library.js'),{composeSkeleton}=await import('./js/render/skeleton-equipment-compose.js');
 const {skeletonAppearance}=await import('./js/render/skeleton-equipment-state.js'),{createSkeletonSave}=await import('./js/meta/character-creation.js');
 const d=skeletonAppearance(createSkeletonSave({lineage:'skeleton_knight',name:'cleanup',answers:[0,0,0,0,0],createdAt:1}));
 const create=document.createElement.bind(document),draw=CanvasRenderingContext2D.prototype.putImageData,decode=window.createImageBitmap,canvases=[],bitmaps=[];
 const cache=new PaperdollLibrary({compose:composeSkeleton,dispose:a=>{a.canvas.width=a.canvas.height=1;if(a.weaponMask)a.weaponMask.canvas.width=a.weaponMask.canvas.height=1;}});
 try{
  document.createElement=(tag,...rest)=>{const n=create(tag,...rest);if(tag==='canvas')canvases.push(n);return n;};
  window.createImageBitmap=async(...args)=>{const b=await decode(...args);bitmaps.push(b);return b;};
  CanvasRenderingContext2D.prototype.putImageData=function(){throw Error('injected raster failure');};
  try{await cache.acquire(d);throw Error('missing raster failure');}catch(e){if(!/injected raster/.test(e.message))throw e;}
  const dimensions=canvases.map(c=>[c.width,c.height]),bitmapWidths=bitmaps.map(b=>b.width);
  if(dimensions.some(([w,h])=>w!==1||h!==1)||bitmapWidths.some(Boolean))throw Error('raster resource leaked');
  CanvasRenderingContext2D.prototype.putImageData=draw;document.createElement=create;window.createImageBitmap=decode;
  const lease=await cache.acquire(d);lease.release();return {dimensions,bitmapWidths,retry:true,references:cache.status().references};
 }finally{CanvasRenderingContext2D.prototype.putImageData=draw;document.createElement=create;window.createImageBitmap=decode;}
});
rows.push({cleanup});
assert.ok(stages.every(s=>s.aborted&&s.status.references===0));assert.deepEqual(errors,[]);rows.push({stages,errors});
writeFileSync('/home/cocy/.openclaw/workspace/tmp/arpg-p2-native.json',JSON.stringify({pass:true,rows,screenshots:0,liveWorldWrites:0},null,2));console.log(JSON.stringify(rows));
}finally{await browser.close();server.kill();}
