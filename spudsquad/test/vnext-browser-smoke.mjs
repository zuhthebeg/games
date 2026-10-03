import assert from 'node:assert/strict';
import fs from 'node:fs';
const {chromium}=await import('/home/cocy/.openclaw/workspace/node_modules/playwright/index.mjs');
const base=process.env.SPUD_URL||'http://127.0.0.1:8863/spudsquad/';
const browser=await chromium.launch({headless:true,executablePath:'/home/cocy/bin/chromium',args:['--no-sandbox','--disable-gpu']});
const report={screenshots:0,errors:[],ads:[],missingTierAssets:[],blockedWrites:0,viewports:[]};
try{
 for(const [width,height]of [[390,844],[844,390],[320,568]]){
 const ctx=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true});
 await ctx.route('**/*',r=>{const q=r.request();if(q.method()!=='GET'){report.blockedWrites++;return r.abort();}if(/googletagmanager|googlesyndication|doubleclick/.test(q.url())){report.ads.push(q.url());return r.abort();}if(/weapon_.*_t[56]/.test(q.url()))report.missingTierAssets.push(q.url());return r.continue();});
 const p=await ctx.newPage();p.on('pageerror',e=>report.errors.push(e.message));await p.goto(base+'?debug=1');await p.waitForFunction(()=>SPUD.main&&document.querySelector('[data-act=solo]'));
 await p.waitForFunction(()=>Object.values(SPUD.render.images).every(i=>i.complete));
 const badAssets=await p.evaluate(()=>Object.entries(SPUD.render.images).filter(([id,i])=>!i.ok||!i.naturalWidth).map(([id])=>id));assert.deepEqual(badAssets,[]);
 assert.equal(await p.locator('#ultBtn').isVisible(),false);
 await p.locator('[data-act=solo]').click();await p.locator('[data-act=basic]').click();await p.waitForFunction(()=>SPUD.main.mode==='wave');
 await p.evaluate(()=>{const w=SPUD.main.session.world,p=w.players.solo;w.spawnClock=-1e9;w.tm=999;p.immune=1e9;p.mats=10000;p.weapons=[['pistol',4],['pistol',4]];['whistle','white_flag','alien_baby','robot_arm','potato_crown','peacock_feather','bandage','bandage'].forEach(id=>SPUD.sim.grantItem(p,id));});
 await p.waitForFunction(()=>!document.getElementById('ultBtn').hidden);assert.equal(await p.locator('#ultBtn').isVisible(),true);
 // Actual host loop must keep ticking while stats dialog is open in multiplayer.
 await p.evaluate(()=>{const ses=SPUD.main.session;ses.players.ally={user:'ally'};ses.world.players.ally=SPUD.sim.createPlayer('ally');ses.world.players.ally.immune=1e9;});
 await p.locator('#statsBtn').click();const before=await p.evaluate(()=>SPUD.main.session.world.tick);await p.locator('[data-act="item:whistle"]').click();
 assert.ok(await p.locator('.item-detail .negative').count());assert.ok(await p.locator('.item-detail .positive').count());
 const tickAfter=await p.evaluate(()=>SPUD.main.session.world.tick);assert.ok(tickAfter>before,'host dialog does not pause simulation');
 await p.keyboard.press('Escape');assert.equal(await p.evaluate(()=>document.activeElement.id),'statsBtn');
 // Finish an actual wave, then drive shop handlers.
 await p.evaluate(()=>{delete SPUD.main.session.players.ally;delete SPUD.main.session.world.players.ally;SPUD.main.session.world.enemies=[];SPUD.main.session.world.tm=0;});await p.waitForFunction(()=>SPUD.main.mode==='shop'&&document.querySelector('.shop-screen'));
 assert.equal(await p.locator('#ultBtn').isVisible(),false);assert.equal(await p.locator('#ultBtn').isDisabled(),true);
 await p.locator('[data-act=slot0]').click();await p.locator('[data-act=merge]').click();assert.deepEqual(await p.evaluate(()=>SPUD.main.session.world.players.solo.weapons),[['pistol',5]]);
 await p.evaluate(()=>SPUD.main.session.world.players.solo.weapons.push(['pistol',5]));await p.locator('[data-act=slot0]').click();await p.locator('[data-act=merge]').click();assert.deepEqual(await p.evaluate(()=>SPUD.main.session.world.players.solo.weapons),[['pistol',6]]);
 await p.locator('[data-act="owned:bandage"]').tap();assert.ok((await p.locator('.item-detail').textContent()).includes('×2'));await p.keyboard.press('Escape');assert.equal(await p.locator('[data-act="owned:bandage"]').evaluate(n=>n===document.activeElement),true);await p.keyboard.press('Enter');assert.ok(await p.locator('.item-detail').count());await p.keyboard.press('Shift+Tab');await p.keyboard.press('Tab');assert.equal(await p.locator('.sheet-close').evaluate(n=>n===document.activeElement),true);await p.keyboard.press('Escape');
 // Locked old quote not rerolled with changed owner mean, exact displayed debit.
 const priced=await p.evaluate(()=>{const P=SPUD.main,p=P.session.world.players.solo;P.offers[0]={id:'pistol',weapon:true,tier:2,price:19,locked:true};return p.mats;});
 await p.locator('[data-act=roll]').click();assert.equal(await p.evaluate(()=>SPUD.main.offers[0].price),19);const current=await p.evaluate(()=>SPUD.main.session.world.players.solo.mats);await p.locator('[data-act=buy0]').click();assert.equal(await p.evaluate(()=>SPUD.main.session.world.players.solo.mats),current-19);
 await p.reload();await p.waitForFunction(()=>SPUD.main.mode==='shop'&&document.querySelector('.shop-screen'));assert.deepEqual(await p.evaluate(()=>SPUD.main.session.world.players.solo.weapons),[['pistol',6],['pistol',2]]);
 await p.locator('[data-act=ready]').click();await p.waitForFunction(()=>SPUD.main.mode==='wave'&&!document.getElementById('ultBtn').hidden);assert.equal(await p.locator('#ultBtn').isVisible(),true);
 // Cast all 15 actual host mechanics and JSON loopback packets, paint all T6 weapons.
 const loopback=await p.evaluate(()=>{const S=SPUD.sim,N=SPUD.net,D=SPUD.data,out=[];
 for(const char of Object.keys(D.chars)){const h=new N.Session({uid:'host',host:'host'}),g=new N.Session({uid:'guest',host:'host',sendRt:q=>h.rt('guest',JSON.parse(JSON.stringify(q)))});const roster={players:[{user:'host'},{user:'guest'}],hostUser:'host'};h.roster(roster);g.roster(roster);const start={type:'WAVE_START',payload:{w:1,players:{host:{char:'basic'},guest:{char,weapons:[['laser',6]]}}}};h.receive(JSON.parse(JSON.stringify(start)));g.receive(JSON.parse(JSON.stringify(start)));h.world.players.guest.hp/=2;const e=S.spawn(h.world,'tank',800+20,600);e.hp=e.maxHp=500;g.rt('host',JSON.parse(JSON.stringify(N.encode(h.world))),1000);const used=g.requestUlt();const packet=JSON.parse(JSON.stringify(N.encode(h.world)));g.rt('host',packet,1001);out.push({char,used,hp:e.hp,spent:h.world.players.guest.ultUsed,fx:packet.fx.filter(e=>e[0]==='ult').length});}
 const w=SPUD.main.session.world;w.players.solo.weapons=['smg','laser','shotgun','crossbow','potato_cannon','pistol'].map(id=>[id,6]);w.players.solo.immune=1e9;w.spawnClock=-1e9;w.tm=999;return out;});
 assert.equal(loopback.length,15);assert.ok(loopback.every(v=>v.used&&v.spent&&v.fx===1&&v.hp<500));
 await p.waitForFunction(()=>SPUD.main.session.world.tick>5);
 // Actual endless W21 boss shop/reward -> W22, then normal W20 victory UI.
 await p.evaluate(()=>{const ses=SPUD.main.session;ses.endless=true;ses.start(21);const w=ses.world;w.spawnClock=-1e9;w.looterRolled=true;w.players.solo.immune=1e9;w.players.solo.cool=[1e9];});
 await p.waitForFunction(()=>SPUD.main.session.world.bossSpawned);
 assert.equal(await p.evaluate(()=>SPUD.main.session.world.enemies.filter(e=>e.type.startsWith('boss_')).length),1);
 await p.evaluate(()=>{const w=SPUD.main.session.world;w.tm=0;});
 await p.waitForFunction(()=>SPUD.main.session.world.tick>5);assert.equal(await p.evaluate(()=>SPUD.main.mode),'wave');
 await p.evaluate(()=>{const w=SPUD.main.session.world,b=w.enemies.find(e=>e.type.startsWith('boss_'));b.hp=0;SPUD.sim.kill(w,b,'solo');});
 await p.waitForFunction(()=>SPUD.main.mode==='shop'&&document.querySelector('[data-act=take]'));
 assert.equal(await p.locator('#ultBtn').isVisible(),false);const bossItem=await p.evaluate(()=>SPUD.main.session.world.players.solo.pendingCrates[0].itemId);assert.ok(await p.evaluate(id=>(SPUD.data.items[id].tier||1)>=2,bossItem));
 await p.locator('[data-act=take]').click();await p.waitForFunction(()=>document.querySelector('[data-act=ready],[data-act=pick0]'));for(let i=0;i<40&&await p.locator('[data-act=pick0]').count();i++)await p.locator('[data-act=pick0]').click();await p.waitForFunction(()=>document.querySelector('[data-act=ready]'));await p.locator('[data-act=ready]').click();await p.waitForFunction(()=>SPUD.main.session.world.wave===22&&SPUD.main.session.world.bossSpawned);assert.equal(await p.evaluate(()=>SPUD.main.session.world.bossKills),0);
 await p.evaluate(()=>{const w=SPUD.main.session.world,p=w.players.solo;p.immune=0;p.revived=true;w.rng=()=>.99;SPUD.sim.hurtPlayer(w,p,1e9,null);});await p.waitForFunction(()=>SPUD.main.mode==='end');assert.equal(await p.evaluate(()=>SPUD.main.session.world.ended&&!SPUD.main.session.world.win),true);await p.locator('[data-act=back]').click();await p.locator('[data-act=solo]').click();await p.locator('[data-act=basic]').click();await p.waitForFunction(()=>SPUD.main.mode==='wave');
 await p.evaluate(()=>{const ses=SPUD.main.session;ses.endless=false;ses.start(20);const w=ses.world;w.spawnClock=-1e9;w.looterRolled=true;w.players.solo.immune=1e9;w.players.solo.cool=[1e9];});await p.waitForFunction(()=>SPUD.main.session.world.bossSpawned);
 await p.evaluate(()=>{const w=SPUD.main.session.world,b=w.enemies.find(e=>e.type==='boss_2');b.hp=0;SPUD.sim.kill(w,b,'solo');});await p.waitForFunction(()=>SPUD.main.mode==='end');assert.equal(await p.evaluate(()=>SPUD.main.session.world.win),true);assert.equal(await p.locator('#ultBtn').isVisible(),false);
 report.viewports.push({width,height,endless21BossTake22:true,endless22ActualDeathUI:true,allRenderAssetsDecoded:true,normal20WinUI:true,shopUltHidden:true,t6Handlers:true,oldPrice:19,hostNoPause:true,loopback});await ctx.close();
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.ads,[]);assert.deepEqual(report.missingTierAssets,[]);report.passed=true;
}finally{await browser.close();fs.writeFileSync('/home/cocy/.openclaw/workspace/tmp/spud-vnext-browser.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
