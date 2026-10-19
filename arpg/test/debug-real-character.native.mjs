import {chromium} from '/home/cocy/.openclaw/workspace/node_modules/playwright/index.mjs';
import {spawn} from 'node:child_process';import {readFile,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';import {createSave,SAVE_KEY} from '../js/meta/save.js';import {SLOT_SAVE_KEYS} from '../js/meta/character-slots.js';
const base=process.env.ARPG_BASE_URL||'http://127.0.0.1:8982',out=process.env.ARPG_DEBUG_EVIDENCE||'/home/cocy/.openclaw/workspace/tmp/arpg-debug-real-native.json';
const report={base,rows:[],errors:[],screenshots:0,worldMutations:0,sourceBinding:{}};let browser,server;
try{
 if(!process.env.ARPG_BASE_URL){server=spawn('python3',['-m','http.server','8982','--bind','127.0.0.1'],{cwd:new URL('../..',import.meta.url).pathname,stdio:'ignore'});for(let i=0;i<40;i++){try{if((await fetch(base+'/arpg/')).ok)break}catch{}await new Promise(r=>setTimeout(r,100));}}
 const html=await(await fetch(base+'/arpg/')).text(),map=JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
 for(const path of ['js/main.js','js/debug/index.js']){const url=new URL(map['./'+path],base+'/arpg/').href,bytes=Buffer.from(await(await fetch(url)).arrayBuffer());assert.deepEqual(bytes,await readFile(new URL('../'+path,import.meta.url)));report.sourceBinding[path]={url,sha256:createHash('sha256').update(bytes).digest('hex')};}
 browser=await chromium.launch({executablePath:'/home/cocy/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
 for(const width of [1280,390]){
 const context=await browser.newContext({viewport:{width,height:844},hasTouch:width===390,isMobile:width===390});const raw=JSON.stringify(createSave({name:'HUMAN',answers:[0,1,2,3,0],createdAt:1}));
 await context.addInitScript(({key,raw})=>{if(!sessionStorage.getItem('seeded')){localStorage.setItem(key,raw);sessionStorage.setItem('seeded','1');}},{key:SAVE_KEY,raw});
 await context.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin&&['GET','HEAD'].includes(r.request().method())?r.continue():r.abort());
 const page=await context.newPage(),requested=new Set();page.setDefaultTimeout(15000);page.on('pageerror',e=>report.errors.push(e.message));page.on('request',r=>requested.add(r.url()));
 const press=async selector=>{const n=page.locator(selector).first();await n.scrollIntoViewIfNeeded();if(width===390)await n.tap();else await n.click()};
 await page.goto(base+'/arpg/?debug=1');await press('#arpg-debug-toggle');await press('[data-debug="real-skeleton"]');await page.locator('#hero-name').fill('SKELETON');await press('#name-next');for(let i=0;i<5;i++)await press('[data-action="answer"][data-choice="0"]');await press('[data-action="create"]');await page.waitForSelector('.inn-fire');
 const state=()=>page.evaluate(keys=>({human:localStorage.getItem(keys[0]),skeleton:localStorage.getItem(keys[1]),mode:window.__arpg.mode}),[SAVE_KEY,SLOT_SAVE_KEYS.skeleton_knight]);let s=await state();assert.equal(s.human,raw);assert.equal(s.mode,'skeleton_knight');assert.equal(JSON.parse(s.skeleton).name,'SKELETON');const skeleton=s.skeleton;
 await page.reload();await page.waitForSelector('.inn-fire');s=await state();assert.equal(s.human,raw);assert.equal(s.skeleton,skeleton);assert.equal(s.mode,'skeleton_knight');
 await press('#arpg-debug-toggle');await press('[data-debug="real-human"]');await page.waitForSelector('.inn-fire');assert.equal((await state()).human,raw);assert.equal((await state()).mode,'human');
 await press('#arpg-debug-toggle');await press('[data-debug="real-skeleton"]');assert.equal((await state()).skeleton,skeleton);assert.equal((await state()).mode,'skeleton_knight');
 await press('[data-action="board"]');await press('[data-action="sortie"][data-stage="S1"]');await press('#sortie-confirm');await page.waitForFunction(()=>window.__arpg.world?.tick>0);
 await press('#arpg-debug-toggle');await press('[data-debug="real-human"]');assert.match(await page.locator('#arpg-debug-status').innerText(),/전투 중/);assert.equal((await state()).mode,'skeleton_knight');assert.equal((await state()).human,raw);
 for(const binding of Object.values(report.sourceBinding))assert.ok(requested.has(binding.url),binding.url);report.rows.push({width,created:true,reload:true,humanSha256:createHash('sha256').update(raw).digest('hex'),humanUnchanged:true,switchBack:true,combatBlocked:true});await context.close();
 }
 assert.deepEqual(report.errors,[]);report.status='PASS';
}catch(e){report.status='BLOCKED';report.failure=e.stack;process.exitCode=1;}finally{await browser?.close();server?.kill();await writeFile(out,JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,rows:report.rows.length,out,failure:report.failure}));}
