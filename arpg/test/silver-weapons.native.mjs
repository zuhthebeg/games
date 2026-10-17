// Ordinary /arpg/, fresh isolated saves only. Native input; readonly world observations.
import {chromium}from '/home/cocy/.openclaw/workspace/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';import {spawn,execFileSync}from 'node:child_process';import{readFile,writeFile}from 'node:fs/promises';import{createHash}from 'node:crypto';import{fileURLToPath}from 'node:url';
const root=fileURLToPath(new URL('../..',import.meta.url)),port=Number(process.env.ARPG_SILVER_PORT||8951),base=`http://127.0.0.1:${port}`;
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
const browser=await chromium.launch({executablePath:'/home/cocy/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
const report={status:'RUNNING',head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),url:base+'/arpg/',rows:[],sourceBinding:{},screenshots:0,liveWorldWrites:0,existingUserStorage:0,errors:[]};
try{
 for(let i=0;i<40;i++){try{if((await fetch(base+'/arpg/')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}assert.equal(server.exitCode,null);
 for(const path of ['arpg/js/meta/items.js','arpg/js/meta/stats.js','arpg/js/content/combat.js','arpg/js/sim/world.js','arpg/js/net/protocol.js','arpg/js/ui/gear-view.js','arpg/js/ui/hub.js','arpg/js/ui/icons.js','arpg/js/ui/item-art.js']){const local=await readFile(root+'/'+path),served=Buffer.from(await(await fetch(base+'/'+path)).arrayBuffer());assert.deepEqual(served,local);report.sourceBinding[path]=createHash('sha256').update(local).digest('hex');}
 for(const width of [1280,390]){
  const mobile=width===390,ctx=await browser.newContext({viewport:{width,height:844},isMobile:mobile,hasTouch:mobile,reducedMotion:'reduce'}),page=await ctx.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>report.errors.push(e.message));
  await page.route('**/www.googletagmanager.com/**',r=>r.fulfill({body:''}));
  const press=async selector=>{const n=page.locator(selector).first();await n.scrollIntoViewIfNeeded();if(mobile)await n.tap();else{await n.focus();await page.keyboard.press('Enter');}};
  const save=()=>page.evaluate(()=>JSON.parse(JSON.stringify(__arpg.save)));
  await page.goto(base+'/arpg/');await page.waitForFunction(()=>window.__arpg);
  const fixture=await page.evaluate(async()=>{
   const {createSave,validateSave,SaveStore}=await import('./js/meta/save.js'),{trained}=await import('./test/fixtures/trained.js'),{BASE_STATS,STAT_KEYS,statBudget}=await import('./js/meta/stats.js'),{noteMaterials}=await import('./js/meta/recipe-discovery.js'),{createTracker,trackRound,settleRound}=await import('./js/meta/run.js');
   let s=trained(createSave({name:'은궁 여정',weapon:'bow',answers:[0,0,0,0,0],createdAt:1}),30);s.stats={...BASE_STATS,str:45,agi:45,int:45};s.statPoints=statBudget(30)-STAT_KEYS.reduce((n,k)=>n+s.stats[k]-BASE_STATS[k],0);
   for(const id of Object.keys(s.cleared)){s.cleared[id]=true;s.stageThreat[id]=1;}s.flags.chiefPity=true;
   // Reward fixture goes through real T2 construct kill/tracker/settlement.
   // Seeded journeys supply ingots; no synthesized loot or receipt fields.
   s.stacks.return_scroll=10;
   let journeys=0;
   for(let seed=1;seed<=2000&&(s.stacks.silver_ingot||0)<6;seed++){
    const events=[{type:'kill',id:100+seed,monster:'rune_guardian',stageId:'S9',threat:1,elite:false,xp:0}];
    const{tracker}=trackRound(s,createTracker(seed),events);
    if(!tracker.tempLoot.stacks.silver_ingot)continue;
    s=settleRound(s,{stageId:'S9',terminal:'return_scroll',...tracker,used:{scrolls:1}}).save;journeys++;
   }
   const undead=trackRound(s,createTracker(1),[{type:'kill',id:999,monster:'necropolis_lord',stageId:'S27',threat:1,elite:false,xp:0}]).tracker;
   if(undead.tempLoot.stacks.silver_ingot)throw Error('undead must not drop ingots');
   s.gold=10000;s.stacks={...s.stacks,wood:100,hide:30,frost_shard:30,dragon_scale:1,potion:30,mana_potion:10,return_scroll:3};s=noteMaterials(s);if(!validateSave(s))throw Error('invalid isolated fixture');if(s.stacks.silver_ingot<6)throw Error('insufficient authentic ingots');new SaveStore(localStorage).save(s);return{journeys,monster:'rune_guardian',stage:'S9',undeadBossIngots:undead.tempLoot.stacks.silver_ingot||0,ingots:s.stacks.silver_ingot,receipt:s.lastReceipt};
  });
  await page.reload();await press('[data-action="choose-human"]');await page.locator('[data-action="craft-hub"]').waitFor();assert.ok(!new URL(page.url()).searchParams.has('debug')&&!new URL(page.url()).searchParams.has('dev'));
  await press('[data-action="character"]');assert.match(await page.locator('.receipt [data-premium="silver_ingot"]').innerText(),/득템 · 은 주괴/);await press('[data-action="inn"]');
  await press('[data-action="board"]');await press('[data-action="map-region"][data-region="pass"]');const sourceRegionText=await page.locator('.map-quests:not([hidden]) .silver-source').innerText();assert.match(sourceRegionText,/은 주괴.*T2.*구조물/);
  await press('[data-action="sortie"][data-stage="S9"]');const sourceSortieText=await page.locator('.departure-check .silver-source').innerText();assert.match(sourceSortieText,/고링·룬 수호자·가고일/);await press('[data-action="board"]');await press('[data-action="inn"]');
  await press('[data-action="craft-hub"]');const recipeText=await page.locator('[data-action="craft"][data-id="silver_bow"]').locator('..').innerText();assert.match(recipeText,/제작 전용.*언데드.*\+50%/);assert.match(recipeText,/은 주괴.*T2.*구조물/);const before=await save();await press('[data-action="craft"][data-id="silver_bow"]');assert.match(await page.locator('.craft-notice').innerText(),/은촉 장궁 제작 완료/);const after=await save(),made=after.items.at(-1);assert.equal(made.id,'silver_bow');assert.equal(after.stacks.silver_ingot,before.stacks.silver_ingot-6);assert.equal(after.gold,before.gold-360);
  await press('[data-action="forge-tab"][data-tab="salvage"]');await press('.forge-salvage [data-action="equip"]');if(await page.locator('[data-action="weapon-confirm"]').count())await press('[data-action="weapon-confirm"]');assert.equal((await save()).equipped.weapon,made.uid);
  await press('[data-action="inn"]');await press('[data-action="socket"][data-slot="weapon"]');const itemText=await page.locator('.item-details').innerText();assert.match(itemText,/언데드.*무기 공격 피해 \+50%/);assert.match(itemText,/제작 전용/);assert.match(itemText,/은 주괴.*T2.*구조물/s);assert.match(itemText,/힐·턴 언데드·지속피해·마법 스킬 제외/);await press('[data-action="close-sheet"]');
  const equipped=await save();await page.reload();await page.locator('#inn-name').waitFor();assert.deepEqual(await save(),equipped);
  await press('[data-action="board"]');await press('[data-action="map-region"][data-region="graveyard"]');const regionText=await page.locator('.map-quests:not([hidden]) .undead-recommendation').innerText();assert.match(regionText,/성속성·턴 언데드·은 무기 추천/);await press('[data-action="sortie"][data-stage="S21"]');const sortieText=await page.locator('.departure-check .undead-recommendation').innerText();assert.match(sortieText,/일반 무기도 가능/);assert.match(sortieText,/보스.*낮은 확률/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const observations=[];
  for(const [stage,lifeState,multiplier]of [['S21','undead',1.5],['S2','living',1]]){
   if(stage==='S2'){await page.reload();await page.locator('#inn-name').waitFor();await press('[data-action="board"]');await press('[data-action="map-region"][data-region="outskirts"]');await press('[data-action="sortie"][data-stage="S2"]');}
   await press('#sortie-confirm');await page.waitForFunction(stage=>__arpg.world?.round?.stageId===stage&&__arpg.world.tick>0,stage);
   await page.evaluate(async()=>{
    const {comboDef}=await import('./js/sim/basic-combo.js'),{MONSTER_VARIANTS}=await import('./js/content/monsters.js');window.silverObserved=[];let last=-1;window.silverObserve=true;
    function sample(){const w=__arpg.world;if(w&&w.tick!==last){last=w.tick;const p=w.entities[0];for(const e of w.events){if(e.type!=='hit'||e.src!==p.id||e.ability!=='arrow'||e.exposed||e.crit)continue;const t=w.entities.find(t=>t.id===e.dst);if(!t||t.burn||t.sunder)continue;const def=comboDef('arrow',e.step,p.weaponForm);silverObserved.push({tick:w.tick,stage:w.round.stageId,target:t.type,lifeState:MONSTER_VARIANTS[t.type].lifeState,damage:e.dmg,baseDamage:def.damage,sourceMult:p.dmgMult.bow,silverWeapon:p.silverWeapon,event:{...e}});}}if(silverObserve)requestAnimationFrame(sample);}requestAnimationFrame(sample);
   });
   await press('[data-battle-settings]');await press('[data-battle-auto="on"]');await press('[data-battle-settings]');
   const cdp=await ctx.newCDPSession(page);let held=new Set(),touching=false;const joy={x:70,y:480,id:1};const deadline=Date.now()+45000;
   while(Date.now()<deadline){const obs=await page.evaluate(()=>silverObserved);if(obs.some(o=>o.lifeState===lifeState))break;const w=await page.evaluate(()=>JSON.parse(JSON.stringify(__arpg.world))),p=w.entities[0];assert.ok(!p.dead,'survive real combat fixture');const target=w.entities.filter(e=>e.kind==='monster'&&!e.dead&&!(e.spawnLeft>0)).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];let mx=0,my=0;if(target){const dx=target.x-p.x,dy=target.y-p.y,d=Math.hypot(dx,dy);if(d>280){mx=dx/d;my=dy/d;}}
    if(mobile){if(!touching){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[joy]});touching=true;}await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...joy,x:joy.x+mx*42,y:joy.y+my*42}]});}else{const next=new Set([...(mx<-.2?['KeyA']:mx>.2?['KeyD']:[]),...(my<-.2?['KeyW']:my>.2?['KeyS']:[])]);for(const k of held)if(!next.has(k))await page.keyboard.up(k);for(const k of next)if(!held.has(k))await page.keyboard.down(k);held=next;}await page.waitForTimeout(100);
   }
   for(const k of held)await page.keyboard.up(k);if(touching)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
   const observed=await page.evaluate(()=>{window.silverObserve=false;return silverObserved;});const hit=observed.find(o=>o.lifeState===lifeState);assert.ok(hit,`actual ${lifeState} damage observed: ${JSON.stringify(observed)}`);assert.equal(hit.silverWeapon,true);assert.equal(hit.damage,Math.round(hit.baseDamage*hit.sourceMult*multiplier));observations.push({...hit,expectedMultiplier:multiplier});console.log('silver native combat',width,stage,JSON.stringify(hit));
  }
  assert.deepEqual(report.errors,[]);report.rows.push({width,input:mobile?'native touch/CDP joystick':'keyboard Enter/WASD',fixture,crafted:made,ingotCost:6,goldCost:360,equipped:true,reloadExact:true,recipeText,itemText,sourceRegionText,sourceSortieText,regionText,sortieText,observations});await ctx.close();
 }
 report.status='PASS';console.log(JSON.stringify(report));
}catch(e){report.status='FAIL';report.failure=e.stack;throw e;}finally{await writeFile(process.env.ARPG_SILVER_RESULT||'/home/cocy/.openclaw/workspace/tmp/arpg-silver-source-native.json',JSON.stringify(report,null,2)+'\n');await browser.close();server.kill();}
