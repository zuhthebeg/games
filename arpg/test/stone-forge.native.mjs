import {chromium} from '/home/cocy/.openclaw/workspace/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../..',import.meta.url)),port=Number(process.env.ARPG_STONE_PORT||8947),base=`http://127.0.0.1:${port}`;
const out=process.env.ARPG_STONE_EVIDENCE||'/home/cocy/.openclaw/workspace/tmp/arpg-craft-a-native.json';
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
const browser=await chromium.launch({executablePath:'/home/cocy/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
const report={head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),url:base+'/arpg/',rows:[],errors:[],screenshots:0,existingUserStorage:0,sourceBinding:{}};
try{
 for(let i=0;i<40;i++){try{if((await fetch(base+'/arpg/')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 assert.equal(server.exitCode,null,'test must own its unique server port');
 for(const path of ['arpg/js/meta/economy.js','arpg/js/meta/enchant.js','arpg/js/meta/items.js','arpg/js/ui/hub.js','arpg/js/ui/enchant-fx.js','arpg/css/game.css']){
  const local=await readFile(root+'/'+path),served=Buffer.from(await(await fetch(base+'/'+path)).arrayBuffer());assert.deepEqual(served,local);report.sourceBinding[path]=createHash('sha256').update(local).digest('hex');
 }
 for(const width of [1280,390]){
  const mobile=width===390,context=await browser.newContext({viewport:{width,height:844},isMobile:mobile,hasTouch:mobile,reducedMotion:'reduce'}),page=await context.newPage();
  page.setDefaultTimeout(10000);page.on('pageerror',e=>report.errors.push(e.message));
  const press=async selector=>{const n=page.locator(selector).first();await n.scrollIntoViewIfNeeded();if(mobile)await n.tap();else{await n.focus();await page.keyboard.press('Enter');}};
  const state=()=>page.evaluate(async()=>{const {SaveStore}=await import('./js/meta/save.js');return new SaveStore(localStorage).load();});
  const cleanText=async()=>{assert.doesNotMatch(await page.locator('#meta-screen').innerText(),/주문서|undefined|NaN/);};
  const closeFx=async()=>{const fx=page.locator('dialog.enchant-fx[open]');await fx.waitFor();await press('dialog.enchant-fx[open] button');if(await fx.count())await press('dialog.enchant-fx[open] button');await fx.waitFor({state:'detached'});};
  await page.goto(base+'/arpg/');
  const fixture=async({level=0,stone='enhance_stone_1',to=null,outcome=null}={})=>{
   const expected=await page.evaluate(async({level,stone,to,outcome})=>{
    const {createSave,SaveStore,validateSave}=await import('./js/meta/save.js');const {instance}=await import('./js/meta/items.js');const {enchant}=await import('./js/meta/enchant.js');const {noteMaterials}=await import('./js/meta/recipe-discovery.js');
    for(let seed=1;seed<=20000;seed++){
     let s=createSave({name:'강화 검증',answers:[0,0,0,0,0],createdAt:seed});s.stacks={...s.stacks,enhance_stone_1:100,enhance_stone_blessed:10,enhance_stone_cursed:10};s.items[0].enhance=level;s.items.push({...instance('drop:fixture:gear','iron_sword',1,[]),enhance:9});
     s=noteMaterials(s);const attempt=enchant(s,s.equipped.weapon,stone);if(to!==null&&attempt.result.to!==to||outcome&&attempt.result.outcome!==outcome)continue;
     if(!validateSave(s))throw new Error('invalid isolated fixture');new SaveStore(localStorage).save(s);return{seed,result:attempt.result,save:attempt.save};
    }throw new Error('no legitimate deterministic fixture');
   },{level,stone,to,outcome});
   await page.goto(base+'/arpg/');await press('[data-action="choose-human"]');await page.waitForSelector('[data-action="forge"]');await press('[data-action="forge"]');assert.ok(!new URL(page.url()).searchParams.has('debug')&&!new URL(page.url()).searchParams.has('dev')); await cleanText();return expected;
  };
  const rows=[];
  // Ordinary safe stone chain through the safe/risky boundary, using only native user input.
  await fixture();
  assert.equal(await page.locator('.stone-picker').evaluate(n=>getComputedStyle(n).display),'grid');
  const layout=await page.locator('.stone-picker').evaluate(n=>({overflow:document.documentElement.scrollWidth>innerWidth,buttons:[...n.querySelectorAll('button')].map(b=>({width:b.getBoundingClientRect().width,left:b.getBoundingClientRect().left,right:b.getBoundingClientRect().right})),width:innerWidth}));assert.equal(layout.overflow,false);assert.ok(layout.buttons.every(b=>b.left>=0&&b.right<=width+1&&b.width>44));
  for(let level=1;level<=6;level++){await press('[data-action="enhance"]');await closeFx();const s=await state();assert.equal(s.items.find(i=>i.uid===s.equipped.weapon).enhance,level);assert.equal(s.stacks.enhance_stone_1,100-level*5);}
  assert.match(await page.locator('.action-footer').innerText(),/성공 50%.*파괴 위험/);rows.push({case:'plain safe +0 to +6',stones:70,layout});
  for(const spec of [{level:6,stone:'enhance_stone_1',outcome:'destroyed'},{level:6,stone:'enhance_stone_1',to:7},{level:5,stone:'enhance_stone_blessed',to:7},{level:9,stone:'enhance_stone_blessed',to:11},{level:7,stone:'enhance_stone_cursed',to:6},{level:7,stone:'enhance_stone_cursed',to:7},{level:7,stone:'enhance_stone_cursed',to:10}]){
   const expected=await fixture(spec);await press(`[data-action="pick-stone"][data-id="${spec.stone}"]`);
   const odds=await page.evaluate(async stone=>{const {enchantPreview}=await import('./js/meta/enchant.js');const p=enchantPreview(__arpg.save,__arpg.save.equipped.weapon,stone);return p.probabilities.filter(r=>r.chance>0).map(r=>(r.to===null?'파괴':'+'+r.to)+' '+Number((r.chance*100).toFixed(3))+'%');},spec.stone);for(const row of odds)assert.ok((await page.locator('.forge-probabilities').innerText()).includes(row));
   await press('[data-action="enhance"]');await closeFx();assert.deepEqual(await state(),expected.save);await cleanText();
   if(spec.to===6&&spec.stone==='enhance_stone_cursed')assert.match(await page.locator('.enchant-notice').innerText(),/약화/);
   if(spec.to===7&&spec.stone==='enhance_stone_cursed')assert.match(await page.locator('.enchant-notice').innerText(),/변화 없음/);
   const saved=await state();await page.reload();await page.waitForSelector('[data-action="forge"]');assert.deepEqual(await state(),saved);rows.push({...spec,seed:expected.seed,result:expected.result});
  }
  await fixture();assert.deepEqual(await page.locator('[data-action="forge-tab"]').evaluateAll(ns=>ns.map(n=>n.dataset.tab)),['enhance','craft','salvage']);assert.equal(await page.locator('[data-action="crack-greater"]').count(),0);rows.push({case:'greater opening removed'});
  await press('[data-action="forge-tab"][data-tab="salvage"]');await press('[data-action="select-gear"][data-uid="drop:fixture:gear"]');assert.equal(await page.locator('dialog[open]').count(),0);assert.match(await page.locator('.forge-salvage').innerText(),/강화석: 94/);assert.equal(await page.locator('.forge-salvage [data-action="equip"]').count(),0);
  const before=await state();await press('.forge-salvage [data-action="dismantle"]');assert.match(await page.locator('dialog[open]').innerText(),/강화석: 94/);await press('[data-action="confirm-dismantle"]');const after=await state();assert.equal(after.stacks.enhance_stone_1-before.stacks.enhance_stone_1,94);assert.equal(after.stacks.enhance_stone_3,undefined);assert.ok(!after.items.some(i=>i.uid==='drop:fixture:gear'));await cleanText();rows.push({case:'drop gear salvage +9',plain:94});
  // Removed-scroll save never crashes the real ordinary boot and returns to character creation.
  await page.evaluate(async()=>{const {createSave,SAVE_KEY}=await import('./js/meta/save.js');const old=createSave({name:'구 저장',answers:[0,0,0,0,0],createdAt:1});old.stacks.scroll_enchant_weapon=1;localStorage.setItem(SAVE_KEY,JSON.stringify(old));});await page.reload();await page.waitForSelector('[data-action="name"]');assert.equal(await state(),null);rows.push({case:'removed-scroll old save ordinary boot no crash'});
  report.rows.push({width,nativeInput:mobile?'touch':'keyboard Enter',rows});await context.close();
 }
 assert.deepEqual(report.errors,[]);report.status='PASS';console.log(JSON.stringify(report));
}catch(e){report.status='FAIL';report.failure=e.stack;throw e;}finally{await writeFile(out,JSON.stringify(report,null,2)+'\n');await browser.close();server.kill();}
