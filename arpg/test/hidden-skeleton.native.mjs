// Ordinary /arpg/ only; fresh isolated contexts, native keyboard/CDP touch, no screenshots/world writes.
// Run ARPG_BASE_URL=https://game.cocy.io ARPG_HIDDEN_EVIDENCE=/path/proof.json for release replay.
import {chromium} from '/home/cocy/.openclaw/workspace/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createSave,validateSave} from '../js/meta/save.js';
import {createSkeletonSave} from '../js/meta/character-creation.js';
import {toOldScale} from './fixtures/old-scale.js';
const root=fileURLToPath(new URL('../..',import.meta.url));
const port=Number(process.env.ARPG_HIDDEN_PORT||8965),base=(process.env.ARPG_BASE_URL||`http://127.0.0.1:${port}`).replace(/\/$/,'');
const output=process.env.ARPG_HIDDEN_EVIDENCE||process.env.ARPG_EVIDENCE||'/home/cocy/.openclaw/workspace/tmp/arpg-hidden-skeleton-native.json';
const server=process.env.ARPG_BASE_URL?null:spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
const browser=await chromium.launch({executablePath:'/home/cocy/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
const humanKey='arpg.save.v1',knightKey=humanKey+'.slots.skeleton_knight';
const opts={lineage:'skeleton_knight',name:'기존해골',answers:[0,1,2,3,0],createdAt:1};
const humanRaw=JSON.stringify(createSave({...opts,name:'인간원문보존'}));
const report={status:'RUNNING',base,rows:[],errors:[],sourceBinding:{},screenshots:0,worldWrites:0,privateProfiles:0};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
try{
 for(let i=0;i<60;i++){try{if((await fetch(base+'/arpg/')).ok)break;}catch{}await pause(100);}
 for(const file of ['js/main.js','js/ui/hub.js','js/meta/initial-characters.js','js/meta/selected-character.js','js/meta/character-creation.js','js/meta/quiz.js','js/meta/save.js']){const local=await readFile(root+'/arpg/'+file),served=Buffer.from(await(await fetch(base+'/arpg/'+file,{cache:'no-store'})).arrayBuffer());assert.deepEqual(served,local,file);report.sourceBinding[file]=createHash('sha256').update(local).digest('hex');}
 async function setup(width,fixture={},suffix=''){
  const mobile=width===390,ctx=await browser.newContext({viewport:{width,height:844},isMobile:mobile,hasTouch:mobile,reducedMotion:'reduce'}),page=await ctx.newPage(),errors=[],writes=[];
  page.setDefaultTimeout(15000);page.on('pageerror',e=>{errors.push(e.message);report.errors.push(e.message);});
  await page.route('**/www.googletagmanager.com/**',r=>r.fulfill({body:''}));
  await page.addInitScript(f=>{if(!sessionStorage.getItem('seeded')){for(const[k,v]of Object.entries(f))localStorage.setItem(k,v);sessionStorage.setItem('seeded','1');}},fixture);
  const cdp=await ctx.newCDPSession(page);await cdp.send('DOMStorage.enable');for(const event of ['domStorageItemAdded','domStorageItemUpdated','domStorageItemRemoved'])cdp.on('DOMStorage.'+event,e=>{if(e.storageId.isLocalStorage)writes.push(e.key);});
  const press=async selector=>{const el=page.locator(selector).first();await el.scrollIntoViewIfNeeded();if(mobile)await el.tap();else{await el.focus();await page.keyboard.press('Enter');}};
  await page.goto(base+'/arpg/'+suffix);await page.waitForFunction(()=>window.__arpg);writes.length=0;
  const raw=key=>page.evaluate(k=>localStorage.getItem(k),key);
  const draft=async()=>{await press('[data-action="choose-human"]');await press('[data-action="name"]');await page.locator('#hero-name').fill(width===390?'모바일기억':'숨은기억');await press('#name-next');};
  return{ctx,page,press,errors,writes,raw,draft,cdp};
 }
 for(const width of [1280,390]){
  const {ctx,page:p,press,errors,writes,raw,draft,cdp}=await setup(width);
  await draft();assert.equal(await p.locator('[data-action="answer"]').count(),4);await p.locator('[data-action="answer-skeleton"]').waitFor();
  // A synthetic independent human arrives while this empty-human creation draft is open.
  // This models cross-tab occupancy and proves hidden selection acquires knight ownership.
  const seeded=new Promise(resolve=>cdp.once('DOMStorage.domStorageItemAdded',resolve));
  await p.evaluate(([key,value])=>localStorage.setItem(key,value),[humanKey,humanRaw]);await seeded;writes.length=0;
  await press('[data-action="answer-skeleton"]');assert.equal(await p.locator('[data-action="answer-skeleton"]').count(),0);
  for(const choice of [1,2,3,0])await press(`[data-action="answer"][data-choice="${choice}"]`);
  assert.match(await p.locator('#meta-screen').innerText(),/해골.*검/);assert.equal(await p.locator('[data-action="override"]').count(),0);await press('#quiz-start');
  await p.locator('#inn-name').waitFor();assert.match(await p.locator('#meta-screen').innerText(),/잊힌 묘지/);
  const born=JSON.parse(await raw(knightKey));assert.ok(validateSave(born));assert.equal(born.lineage,'skeleton_knight');assert.equal(born.name,width===390?'모바일기억':'숨은기억');assert.deepEqual(born.quiz.answers,[0,1,2,3,0]);assert.equal(await raw(humanKey),humanRaw);
  const launch=async id=>{await press('[data-action="board"]');await press(`[data-action="sortie"][data-stage="${id}"]`);await press('#sortie-confirm');await p.waitForFunction(id=>__arpg.world?.round.stageId===id&&__arpg.world.tick>0,id);};
  await launch('S1');let w=await p.evaluate(()=>JSON.parse(JSON.stringify(__arpg.world)));assert.equal(w.round.playerSide,'right');assert.equal(await p.evaluate(()=>__arpg.mode),'skeleton_knight');assert.ok(w.entities[0].x>w.arena.w/2);
  if(width===390)await press('#dodge');else await p.keyboard.press('Space');await p.waitForFunction(()=>__arpg.world.entities[0].dodge.cdLeft>0);
  await p.waitForFunction(()=>__arpg.art.visuals.some(v=>v.presentation==='skeleton_knight'&&v.mode==='paperdoll'&&v.id==='player-skeleton-equipment'),null,{timeout:60000});
  const art=await p.evaluate(()=>JSON.parse(JSON.stringify(__arpg.art)));
  await p.waitForFunction(()=>__arpg.world.round.state==='clear',null,{timeout:60000});
  const s1=JSON.parse(await raw(knightKey));assert.equal(s1.cleared.S1,true);assert.equal(s1.lastReceipt.stageId,'S1');assert.equal(s1.lastReceipt.terminal,'clear');
  if(await p.locator('#allocation-confirm').count()){
   let budget=100;while(await p.locator('#allocation-confirm').isDisabled()&&budget--)await press('[data-action="stat-plus"]:not(:disabled)');assert.ok(budget>0);await press('#allocation-confirm');
  }
  await press('[data-action="result-inn"]');await launch('S2');await press('#scroll');await p.waitForFunction(()=>__arpg.world.entities[0].terminal==='return_scroll',null,{timeout:20000});await press('[data-action="result-inn"]');
  const after=await raw(knightKey);await p.reload();await p.locator('#inn-name').waitFor();assert.equal(await raw(knightKey),after);assert.equal(await p.evaluate(()=>__arpg.save.lineage),'skeleton_knight');assert.equal(await raw(humanKey),humanRaw);
  assert.ok(writes.filter(k=>k.startsWith(humanKey)).every(k=>k===knightKey),JSON.stringify(writes));
  await press('[data-action="character-choice"]');await press('[data-action="choose-human"]');await p.locator('#inn-name').waitFor();assert.equal(await p.evaluate(()=>__arpg.save.name),'인간원문보존');assert.equal(await raw(humanKey),humanRaw);assert.equal(await raw(knightKey),after);assert.deepEqual(errors,[]);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  report.rows.push({case:'hidden creation, real timer victory, next sortie, reload, human return',width,input:width===390?'native touch':'keyboard Enter/Space',answers:born.quiz.answers,name:born.name,art,s1Receipt:s1.lastReceipt,nextReceipt:JSON.parse(after).lastReceipt,humanBytesExact:true,reloadExact:true});await ctx.close();console.log('hidden campaign PASS',width);
  const existing=JSON.stringify({...createSkeletonSave(opts),gold:77});
  {
   const {ctx,page,press,raw,draft,writes}=await setup(width,{[knightKey]:existing});await draft();const name=await page.locator('#meta-screen').innerText();await press('[data-action="answer-skeleton"]');await page.locator('[data-action="skeleton-resume"]').waitFor();assert.equal(await raw(knightKey),existing);assert.deepEqual(writes,[]);await press('[data-action="skeleton-resume-cancel"]');assert.equal(await page.locator('#meta-screen').innerText(),name);await press('[data-action="answer-skeleton"]');await press('[data-action="skeleton-resume"]');await page.locator('#inn-name').waitFor();assert.equal(await raw(knightKey),existing);assert.equal(await page.evaluate(()=>__arpg.save.name),opts.name);assert.deepEqual(writes,[]);report.rows.push({case:'occupied hidden resume/cancel preserves draft and exact bytes',width});await ctx.close();
  }
  {
   const old=createSkeletonSave(opts);old.stacks.scroll_enchant_weapon=2;const value=JSON.stringify(old),{ctx,page,press,raw,draft,writes}=await setup(width,{[knightKey]:value});await draft();await press('[data-action="answer-skeleton"]');await page.locator('[data-action="skeleton-resume"]').waitFor();assert.equal(await raw(knightKey),value);assert.deepEqual(writes,[]);await press('[data-action="skeleton-resume-cancel"]');assert.equal(await raw(knightKey),value);await press('[data-action="answer-skeleton"]');await press('[data-action="skeleton-resume"]');await page.locator('#inn-name').waitFor();assert.equal(JSON.parse(await raw(knightKey)).retiredScrolls[0].count,2);report.rows.push({case:'legacy hidden preview/cancel does not write; explicit resume safely archives with backup',width});await ctx.close();
  }
  for(const [kind,value,error] of [['json','{broken',/JSON/],['scroll',JSON.stringify({...createSkeletonSave(opts),stacks:{potion:3,mana_potion:1,return_scroll:1,scroll_enchant_weapon:-1}}),/scroll_enchant_weapon/]]){
   const {ctx,page,press,raw,draft,writes}=await setup(width,{[knightKey]:value});await draft();await press('[data-action="answer-skeleton"]');assert.match(await page.locator('#meta-error').innerText(),error);assert.equal(await raw(knightKey),value);assert.deepEqual(writes,[]);await press('[data-action="answer"][data-choice="1"]');assert.match(await page.locator('#meta-screen').innerText(),/문답 · 2/);report.rows.push({case:'corrupt '+kind+' concrete error, occupied bytes preserved, human draft usable',width});await ctx.close();
  }
  for(const [kind,profile] of [['valid',createSkeletonSave(opts)],['v4',toOldScale(createSkeletonSave(opts))],['retired-scroll',(()=>{const s=createSkeletonSave(opts);s.stacks.scroll_enchant_weapon=2;s.stacks.scroll_blessed_armor=1;return s;})()],['twohand',(()=>{const s=createSkeletonSave(opts);s.items[0].id='rune_greatsword';s.items.push({uid:'shield',id:'round_shield',enhance:0,affixes:[],rolledAt:0});s.equipped.offhand='shield';return s;})()]]){
   const value=JSON.stringify(profile),{ctx,page,press,raw,writes}=await setup(width,{[humanKey]:humanRaw,[knightKey]:value});await press('[data-action="choose-skeleton"]');await page.locator('#inn-name').waitFor();assert.equal(await raw(humanKey),humanRaw);const save=JSON.parse(await raw(knightKey));assert.ok(validateSave(save));if(kind==='valid'){assert.equal(await raw(knightKey),value);assert.deepEqual(writes,[]);}else{const backup=await page.evaluate(([prefix,expected])=>Object.keys(localStorage).some(k=>k.startsWith(prefix+'.recovery.')&&localStorage.getItem(k)===expected),[knightKey,value]);assert.ok(backup);assert.match(await page.locator('.equipment-notice').innerText(),/원본.*백업/);}if(kind==='retired-scroll'){await press('.retired-scrolls summary');assert.match(await page.locator('.retired-scrolls').innerText(),/무기 강화 주문서 2개/);await press('[data-action="board"]');await press('[data-action="sortie"][data-stage="S1"]');await press('#sortie-confirm');await page.waitForFunction(()=>__arpg.world?.round.stageId==='S1'&&__arpg.world.tick>0);assert.equal(await page.evaluate(()=>__arpg.mode),'skeleton_knight');await press('#scroll');await page.waitForFunction(()=>__arpg.world.entities[0].terminal==='return_scroll');await press('[data-action="result-inn"]');}await page.reload();await page.locator('#inn-name').waitFor();report.rows.push({case:'ordinary skeleton '+kind+' resume and reload',width,humanBytesExact:true,sourceBackup:kind!=='valid'});await ctx.close();
  }
 }
 // Cancellation must not load/quarantine a human that changed while the prompt was open.
 {const {ctx,page,press,draft,raw}=await setup(390,{[knightKey]:JSON.stringify(createSkeletonSave(opts))});await draft();await press('[data-action="answer-skeleton"]');await page.evaluate(k=>localStorage.setItem(k,'CONCURRENT HUMAN RAW'),humanKey);await press('[data-action="skeleton-resume-cancel"]');assert.equal(await raw(humanKey),'CONCURRENT HUMAN RAW');for(let i=0;i<5;i++)await press('[data-action="answer"][data-choice="0"]');await press('#quiz-start');assert.match(await page.locator('#meta-error').innerText(),/저장 슬롯이 변경/);assert.equal(await raw(humanKey),'CONCURRENT HUMAN RAW');report.rows.push({case:'prompt cancel preserves concurrently changed human raw and rejects stale creation',width:390});await ctx.close();}
 // Direct ordinary skeleton creation remains available without duplicate narrative action.
 {const {ctx,page,press}=await setup(1280);await press('[data-action="choose-skeleton"]');await page.locator('#hero-name').fill('정상해골시작');await press('#name-next');assert.equal(await page.locator('[data-action="answer-skeleton"]').count(),0);for(let i=0;i<5;i++)await press('[data-action="answer"][data-choice="0"]');await press('#quiz-start');await page.locator('#inn-name').waitFor();assert.equal(await page.evaluate(()=>__arpg.mode),'skeleton_knight');report.rows.push({case:'fresh direct ordinary skeleton creation still enters graveyard'});await ctx.close();}
 // Explicit human URL must not force hidden choice back into the human owner.
 {const{ctx,page,press,draft}=await setup(1280,{},'?character=human');await page.locator('[data-action="name"]').waitFor();await press('[data-action="name"]');await page.locator('#hero-name').fill('인간URL');await press('#name-next');await press('[data-action="answer-skeleton"]');assert.match(page.url(),/character=skeleton_knight/);for(let i=0;i<4;i++)await press('[data-action="answer"][data-choice="0"]');await press('#quiz-start');await page.locator('#inn-name').waitFor();assert.equal(await page.evaluate(()=>__arpg.mode),'skeleton_knight');report.rows.push({case:'explicit human URL respects hidden knight ownership'});await ctx.close();}
 assert.deepEqual(report.errors,[]);report.status='PASS';
}catch(error){report.status='FAIL';report.failure=error.stack;throw error;}finally{await writeFile(output,JSON.stringify(report,null,2)+'\n');await browser.close();server?.kill();}
