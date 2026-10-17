import {chromium} from '/home/cocy/.openclaw/workspace/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../..',import.meta.url)),port=Number(process.env.ARPG_CRAFT_PORT||8948),base=`http://127.0.0.1:${port}`;
const out=process.env.ARPG_CRAFT_EVIDENCE||'/home/cocy/.openclaw/workspace/tmp/arpg-craft-b-native.json';
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
const browser=await chromium.launch({executablePath:'/home/cocy/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
const report={head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),url:base+'/arpg/',rows:[],errors:[],screenshots:0,existingUserStorage:0,sourceBinding:{}};
try{
 for(let i=0;i<40;i++){try{if((await fetch(base+'/arpg/')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 assert.equal(server.exitCode,null,'must own isolated server port');
 for(const path of ['arpg/js/meta/economy.js','arpg/js/meta/items.js','arpg/js/ui/hub.js','arpg/js/ui/gear-view.js','arpg/css/game.css']){
  const local=await readFile(root+'/'+path),served=Buffer.from(await(await fetch(base+'/'+path)).arrayBuffer());assert.deepEqual(served,local);report.sourceBinding[path]=createHash('sha256').update(local).digest('hex');
 }
 for(const width of [1280,390]){
  const mobile=width===390,context=await browser.newContext({viewport:{width,height:844},isMobile:mobile,hasTouch:mobile,reducedMotion:'reduce'}),page=await context.newPage();
  page.setDefaultTimeout(12000);page.on('pageerror',e=>report.errors.push(e.message));
  const press=async selector=>{const n=page.locator(selector).first();await n.scrollIntoViewIfNeeded();if(mobile)await n.tap();else{await n.focus();await page.keyboard.press('Enter');}};
  const state=()=>page.evaluate(async()=>{const {SaveStore}=await import('./js/meta/save.js');return new SaveStore(localStorage).load();});
  const clean=async()=>{assert.doesNotMatch(await page.locator('#meta-screen').innerText(),/undefined|NaN/);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);};
  await page.goto(base+'/arpg/');
  // Valid persisted fixture from real authored S5 kill events -> tracker -> settlement.
  // No world/sim/runtime-context overrides, no direct HubUI method invocation.
  const fixture=await page.evaluate(async()=>{
   const {createSave,SaveStore,validateSave}=await import('./js/meta/save.js');const {noteMaterials}=await import('./js/meta/recipe-discovery.js');const {STAGES}=await import('./js/content/combat.js');const {createTracker,trackRound,settleRound}=await import('./js/meta/run.js');const {ENCHANT}=await import('./js/meta/economy.js');
   for(let seed=1;seed<=20000;seed++){
    let s=createSave({name:'제작 여정',answers:[0,0,0,0,0],createdAt:1});
    for(let i=1;i<=4;i++){s.cleared[`S${i}`]=true;s.stageThreat[`S${i}`]=1;}s.flags.chiefPity=true;
    const events=STAGES.S5.spawns.map((spawn,i)=>({type:'kill',id:i+100,monster:spawn.monster,elite:true,stageId:'S5',threat:1,xp:0,x:spawn.fx*1400,y:spawn.fy*860}));
    const {tracker}=trackRound(s,createTracker(seed),events),drop=tracker.tempLoot.items.find(i=>i.enhance>0);
    if(!drop||!(tracker.tempLoot.stacks.rune_shard||tracker.tempLoot.stacks.frost_shard))continue;
    s=settleRound(s,{stageId:'S5',terminal:'return_scroll',...tracker,used:{scrolls:1}}).save;
    s.gold=1000;s.stacks={...s.stacks,scrap:100,wood:100,hide:30,fang:30,rune_shard:30,frost_shard:30,enhance_stone_1:100};s=noteMaterials(s);
    if(!validateSave(s))throw new Error('invalid seeded reward fixture');new SaveStore(localStorage).save(s);
    return{seed,drop,plainRefund:ENCHANT.dismantleStones[drop.enhance],premium:Object.keys(s.lastReceipt.lootKept.stacks).filter(id=>['rune_shard','frost_shard'].includes(id))};
   }throw new Error('no actual enhanced + premium seed');
  });
  await page.goto(base+'/arpg/');await press('[data-action="choose-human"]');await page.waitForSelector('[data-action="craft-hub"]');
  assert.match(await page.locator('[data-action="craft-hub"]').innerText(),/장비 제작/);assert.ok(!new URL(page.url()).searchParams.has('dev')&&!new URL(page.url()).searchParams.has('debug'));
  await press('[data-action="character"]');
  const receiptText=await page.locator('.receipt').innerText();assert.match(receiptText,/누군가 떨군 장비를 몬스터가 쓰고 있었다/);assert.match(receiptText,/득템 · 강화 장비/);assert.match(receiptText,new RegExp(`\\+${fixture.drop.enhance}`));
  for(const id of fixture.premium){const material=page.locator(`.receipt [data-premium="${id}"]`);assert.match(await material.innerText(),/득템/);assert.ok(await material.evaluate(n=>getComputedStyle(n).borderTopStyle!=='none'));}
  await clean();await press('[data-action="inn"]');await press('[data-action="inventory"]');await press(`[data-action="open-item"][data-uid="${fixture.drop.uid}"]`);assert.match(await page.locator('.item-details').innerText(),/누군가 떨군 장비를 몬스터가 쓰고 있었다/);await press('[data-action="close-sheet"]');await press('[data-action="inn"]');
  await press('[data-action="craft-hub"]');await page.waitForSelector('[data-forge-tab="salvage"]');await press(`[data-action="select-gear"][data-uid="${fixture.drop.uid}"]`);
  assert.match(await page.locator('.forge-salvage').innerText(),new RegExp(`강화석: ${fixture.plainRefund}`));
  const beforeDrop=await state();await press('.forge-salvage [data-action="dismantle"]');await press('[data-action="confirm-dismantle"]');const afterDrop=await state();assert.ok(!afterDrop.items.some(i=>i.uid===fixture.drop.uid));assert.equal(afterDrop.stacks.enhance_stone_1-beforeDrop.stacks.enhance_stone_1,fixture.plainRefund);
  // A newly covered T3 recipe is actually produced, enhanced, then dismantled via native input.
  const beforeCraft=await state();await press('[data-action="craft"][data-id="warden_blade"]');assert.match(await page.locator('.craft-notice').innerText(),/파수꾼의 대검 제작 완료/);const made=await state(),crafted=made.items.at(-1);assert.equal(crafted.id,'warden_blade');assert.equal(crafted.enhance,0);assert.equal(made.gold,beforeCraft.gold-240);assert.equal(made.stacks.scrap,beforeCraft.stacks.scrap-24);
  await press('[data-action="enhance"]');await page.locator('dialog.enchant-fx[open]').waitFor();await press('dialog.enchant-fx[open] button');if(await page.locator('dialog.enchant-fx[open]').count())await press('dialog.enchant-fx[open] button');await page.locator('dialog.enchant-fx[open]').waitFor({state:'detached'});
  const enhanced=await state();assert.equal(enhanced.items.find(i=>i.uid===crafted.uid).enhance,1);assert.equal(enhanced.stacks.enhance_stone_1,made.stacks.enhance_stone_1-5);
  await press('[data-action="forge-tab"][data-tab="salvage"]');assert.match(await page.locator('.forge-salvage').innerText(),/강화석: 1/);await press('.forge-salvage [data-action="dismantle"]');await press('[data-action="confirm-dismantle"]');const salvaged=await state();assert.equal(salvaged.stacks.enhance_stone_1,enhanced.stacks.enhance_stone_1+1);assert.equal(salvaged.stacks.scrap,enhanced.stacks.scrap+6);assert.ok(!salvaged.items.some(i=>i.uid===crafted.uid));await clean();
  await page.reload();await page.waitForSelector('[data-action="craft-hub"]');assert.deepEqual(await state(),salvaged);
  const shortage=await page.evaluate(async()=>{const {createSave,SaveStore,validateSave}=await import('./js/meta/save.js');const {noteMaterials}=await import('./js/meta/recipe-discovery.js');const s=noteMaterials({...createSave({name:'부족 확인',answers:[0,0,0,0,0],createdAt:1}),gold:2,stacks:{scrap:1}});if(!validateSave(s))throw new Error('invalid shortage fixture');new SaveStore(localStorage).save(s);return s;});
  await page.reload();await page.waitForSelector('[data-action="craft-hub"]');await press('[data-action="craft-hub"]');const why=await page.locator('#craft-reason-iron_sword').innerText();assert.match(why,/고철 7개 부족/);assert.match(why,/58 G 부족/);assert.equal(await page.locator('[data-action="craft"][data-id="iron_sword"]').isDisabled(),true);assert.deepEqual(await state(),shortage);await clean();
  report.rows.push({width,nativeInput:mobile?'touch':'keyboard Enter',seed:fixture.seed,enhancedDrop:fixture.drop,premium:fixture.premium,receiptText,dropStoneRefund:fixture.plainRefund,crafted:crafted.id,craftGold:240,craftPrimary:24,craftDismantlePrimary:6,craftEnhanceStoneRefund:1,shortage:why,reload:true});await context.close();
 }
 assert.deepEqual(report.errors,[]);report.status='PASS';console.log(JSON.stringify(report));
}catch(e){report.status='FAIL';report.failure=e.stack;throw e;}finally{await writeFile(out,JSON.stringify(report,null,2)+'\n');await browser.close();server.kill();}
