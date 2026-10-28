// Isolated local saved fixture; ordinary UI navigation; no screenshots/runtime world writes.
import {chromium} from '/home/cocy/.openclaw/workspace/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../..',import.meta.url)),port=8984,base='http://127.0.0.1:'+port;
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
const browser=await chromium.launch({executablePath:'/home/cocy/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
const report={status:'RUNNING',fixture:'isolated localStorage, original ten learned; no gameplay assertions',screenshots:0,rows:[],errors:[],consoleErrors:[],fallbacks:[]};
try{
 for(let i=0;i<40;i++){try{if((await fetch(base+'/arpg/')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 for(const width of [390,1280]){
  const ctx=await browser.newContext({viewport:{width,height:844},isMobile:width===390,hasTouch:width===390}),page=await ctx.newPage();
  page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text());});
  const bad=[];page.on('response',r=>{if(r.url().includes('/assets/skill-icons/')&&r.status()!==200)bad.push(r.url());});
  await page.route('**/www.googletagmanager.com/**',r=>r.fulfill({body:''}));
  const press=async selector=>{const l=page.locator(selector+':visible').first();await l.click();};
  await page.goto(base+'/arpg/');await page.waitForFunction(()=>window.__arpg);
  await page.evaluate(async()=>{
   const {createSave,SaveStore,validateSave}=await import('./js/meta/save.js'),{trained}=await import('./test/fixtures/trained.js'),{learnSkill}=await import('./js/meta/skills.js'),{SKILL_ART}=await import('./js/ui/skill-view.js');
   let s={...trained(createSave({name:'그림 기술 시험',answers:[0,0,0,0,0],createdAt:1})),gold:10000};
   for(const id of Object.keys(SKILL_ART))if(!s.learned.includes(id)&&!['lunge','volley','ember_bolt'].includes(id))s=learnSkill(s,id);
   s.loadout=['lunge','whirl','heavy_cleave'];if(!validateSave(s))throw Error('invalid fixture');new SaveStore(localStorage).save(s);
  });
  await page.reload();await page.waitForFunction(()=>window.__arpg);if(await page.locator('[data-action="choose-human"]:visible').count())await press('[data-action="choose-human"]');await page.locator('#inn-name').waitFor();
  const inspect=async label=>{
   await page.waitForFunction(()=>[...document.querySelectorAll('.skill-icon img')].every(i=>!i.hidden&&i.naturalWidth===256));
   const row=await page.evaluate(label=>({label,overflow:document.documentElement.scrollWidth>innerWidth,images:[...document.querySelectorAll('.skill-icon img')].map(i=>({id:i.parentElement.dataset.skillIcon,w:i.naturalWidth,hidden:i.hidden})),buttons:[...document.querySelectorAll('.academy-tabs button,.slot-pick button')].filter(b=>b.getClientRects().length).map(b=>b.getBoundingClientRect().height)}),label);
   assert.equal(row.overflow,false,label);assert.ok(row.images.length>0);assert.ok(row.buttons.every(h=>h>=44));report.rows.push({width,...row});
  };
  await press('[data-action="trainer"]');
  for(const family of ['blade','bow','focus']){await press('[data-action="academy-tab"][data-family="'+family+'"]');await inspect('academy '+family);}
  // Navigate via the ordinary hub back action.
  const back=page.locator('[data-action="inn"]');if(await back.count())await press('[data-action="inn"]');else await press('[data-action="close-panel"]');
  await press('[data-action="character"]');await press('[data-action="character-tab"][data-tab="skills"]');await inspect('character loadout');
  await press('[data-action="skill-detail"][data-id="lunge"]');await inspect('detail');
  await page.reload();await page.waitForFunction(()=>window.__arpg);if(await page.locator('[data-action="choose-human"]:visible').count())await press('[data-action="choose-human"]');await page.locator('#inn-name').waitFor();
  await press('[data-action="board"]');await press('[data-action="map-region"][data-region="outskirts"]');await press('[data-action="sortie"][data-stage="S1"]');await press('#sortie-confirm');
  await page.waitForFunction(()=>__arpg.world?.round?.stageId==='S1');
  await page.waitForFunction(()=>[...document.querySelectorAll('#actions .skill-icon img')].length===3&&[...document.querySelectorAll('#actions .skill-icon img')].every(i=>!i.hidden&&i.naturalWidth===256));
  report.rows.push({width,label:'HUD S1',images:await page.locator('#actions .skill-icon img').count(),overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});
  assert.equal(report.rows.at(-1).overflow,false);
  assert.deepEqual(bad,[]);await ctx.close();
 }
 // Deliberate local-only fixtures isolate HTTP, invalid-byte and decode-promise failures.
 const ctx=await browser.newContext(),page=await ctx.newPage();await page.goto(base+'/arpg/');
 await page.route('**/u4-http.webp',r=>r.fulfill({status:404,body:''}));
 await page.route('**/u4-invalid.webp',r=>r.fulfill({status:200,contentType:'image/webp',body:'not an image'}));
 for(const mode of ['http','invalid','decode']){
  await page.evaluate(async mode=>{const {skillIcon}=await import('./js/ui/skill-view.js');const host=document.createElement('div');host.id='u4-'+mode;document.body.append(host);host.innerHTML=skillIcon('lunge',{lunge:mode==='decode'?'assets/skill-icons/lunge.webp':'u4-'+mode+'.webp'});if(mode==='decode')host.querySelector('img').decode=()=>Promise.reject(Error('isolated decode rejection'));},mode);
  await page.waitForFunction(mode=>{const i=document.querySelector('#u4-'+mode+' img');return i.hidden&&!i.hasAttribute('src');},mode);
  assert.equal(await page.locator('#u4-'+mode+' svg').count(),1);report.fallbacks.push({mode,svg:true,brokenImageHidden:true});
 }
 await ctx.close();assert.deepEqual(report.errors,[]);assert.deepEqual(report.consoleErrors,[]);report.status='PASS';
}finally{await browser.close();server.kill();await writeFile(process.env.ARPG_U4_EVIDENCE||'/home/cocy/.openclaw/workspace/tmp/arpg-u4-logs/native.json',JSON.stringify(report,null,2));}
console.log(JSON.stringify({status:report.status,rows:report.rows.length,fallbacks:report.fallbacks.length,errors:report.errors}));
