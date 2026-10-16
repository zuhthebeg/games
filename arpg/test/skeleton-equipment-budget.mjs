import { chromium } from '/home/cocy/.openclaw/workspace/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../../',import.meta.url));const server=spawn('python3',['-m','http.server','8914','--bind','127.0.0.1'],{cwd:root,stdio:'ignore'}),browser=await chromium.launch({executablePath:'/home/cocy/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
try{const p=await browser.newPage({viewport:{width:390,height:844}});await p.route('**/www.googletagmanager.com/**',r=>r.fulfill({body:''}));await p.goto('http://127.0.0.1:8914/arpg/');await p.locator('[data-action="choose-skeleton"]').waitFor();
 const proof=await p.evaluate(async()=>{
  const {paperdolls}=await import('./js/render/paperdoll-library.js'),{skeletonAppearance}=await import('./js/render/skeleton-equipment-state.js'),{createSkeletonSave}=await import('./js/meta/character-creation.js'),{instance}=await import('./js/meta/items.js'),{validateSave}=await import('./js/meta/save.js'),{addXp,xpSpan}=await import('./js/meta/progression.js');
  let s=createSkeletonSave({lineage:'skeleton_knight',name:'예산검증',answers:[0,0,0,0,0],createdAt:1}),xp=0;for(let l=1;l<30;l++)xp+=xpSpan(l);s=addXp(s,xp);
  const ids={hands:'hands_light_common_t1',feet:'feet_light_common_t1',body:'cloth_tunic',head:'head_light_common_t1'};for(const [uid,id] of Object.entries(ids))s.items.push(instance(uid,id,0,[]));s.items.push(instance('maul','chief_maul',0,[]));
  const rows=[];for(const weapon of ['starter:weapon','maul'])for(let mask=0;mask<16;mask++){
   s.equipped.weapon=weapon;for(const [i,slot] of Object.keys(ids).entries())s.equipped[slot]=mask&(1<<i)?slot:null;
   if(!validateSave(s))throw Error('Invalid appearance-only SAVE fixture');
   const lease=await paperdolls.acquire(skeletonAppearance(s));const a=lease.asset;rows.push({weapon,mask,id:a.id,layers:a.descriptor.layers,metrics:a.metrics,actualCanvasBytes:a.canvas.width*a.canvas.height*4+(a.weaponMask?.canvas.width*a.weaponMask?.canvas.height||0)*4});lease.release();
  }
  return {rows,status:paperdolls.status(),screenshots:0,liveWorldWrites:0,notes:'Appearance-only validator-valid SAVE fixtures. Native UI behavior verified separately. Headless desktop Chromium at390px, not real phone hardware. Canvas/decoded byte accounting, not GPU heap telemetry.'};
 });assert.equal(proof.rows.length,32);assert.ok(proof.rows.every(r=>r.metrics.outputRGBABytes===r.actualCanvasBytes));assert.ok(proof.status.peakOutputs<=2);assert.equal(proof.status.references,0);writeFileSync('/home/cocy/.openclaw/workspace/tmp/arpg-skeleton-equipment-budget.json',JSON.stringify({pass:true,...proof},null,2));console.log(JSON.stringify({pass:true,status:proof.status,rows:proof.rows.length,sourcePeak:Math.max(...proof.rows.map(r=>r.metrics.sourceRGBABytes)),transferPeak:Math.max(...proof.rows.map(r=>r.metrics.transferBytes)),composeMaxMs:Math.max(...proof.rows.map(r=>r.metrics.composeMs))},null,2));
}finally{await browser.close();server.kill();}
