import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {register} from 'node:module';register('./offline-loader.mjs',import.meta.url);
const {Training,deliverHuntResult,clearPracticeInput}=await import('../js/training.js');const {QUESTS}=await import('../js/data.js');
const real=()=>({v:1,weapon:'gs',w:{gs:2,db:3,bow:2},armor:2,mats:{b_tail:2},shards:123,clears:{q1:{n:3,best:17}}});
function steps(s,n,input={}){for(let i=0;i<n;i++){s.step({p1:input});s.drainEvents();}}
for(const weapon of ['gs','db','bow'])test('practice actual '+weapon+' controls: movement/dodge, active light and released heavy, cloned save',()=>{
 const save=real();save.weapon=weapon;const before=JSON.stringify(save),p=new Training(save),s=p.sim;
 assert.notEqual(p.save.w,save.w);p.save.mats.b_tail=99;assert.equal(save.mats.b_tail,2);
 steps(s,55,{moveZ:127});assert.equal(p.stage,'move');steps(s,1,{dodge:true});steps(s,45);assert.equal(p.stage,'attack');
 steps(s,1,{light:true});steps(s,90);assert.equal(p.light,true);assert.equal(p.heavy,false);
 steps(s,1,{heavy:true,heavyHeld:true});if(weapon!=='db'){steps(s,60,{heavyHeld:true});assert.equal(p.heavy,false);steps(s,1,{heavyHeld:false});}steps(s,100);assert.equal(p.heavy,true);assert.equal(p.stage,'fight');
 s.m.hp=10;s.hitMonster('body',50,0,0,1);steps(s,240);assert.equal(p.stage,'complete');assert.equal(JSON.stringify(save),before);p.dispose();
});
test('untrusted result flags and stale owner cannot enter normal settlement; all writes zero',()=>{
 const owner={},p={owner};let wallet=0,storage=0,rooms=0,settles=0,training=0;
 const normal=()=>{wallet++;storage++;rooms++;settles++;};
 for(const forged of [{win:true,quest:QUESTS[7],loot:{w_gem:999}},{win:true,training:false},{training:true}]){
 assert.equal(deliverHuntResult(owner,owner,p,forged,normal,()=>training++),true);
 assert.equal(deliverHuntResult({},owner,p,forged,normal,()=>training++),false);
 }
 assert.equal(training,3);assert.deepEqual([wallet,storage,rooms,settles],[0,0,0,0]);
});
const src=fs.readFileSync(new URL('../js/main.js',import.meta.url),'utf8');
function fn(name,next){return src.slice(src.indexOf('function '+name+'('),src.indexOf(next,src.indexOf('function '+name+'(')));}
test('actual main settlement handler refuses training before persistence/wallet/room paths',()=>{
 let writes=0;const ctx={practice:{},hunt:{},persist:()=>writes++,SharedWallet:{addGold:()=>writes++}};vm.createContext(ctx);
 vm.runInContext(fn('onHuntEnd','function endHunt'),ctx);ctx.onHuntEnd({win:true,quest:QUESTS[7],loot:{w_gem:999}});assert.equal(writes,0);
});
test('actual main loading callback cannot enable old hunt after skip/retry',async()=>{
 let resolve;const ready=new Promise(r=>resolve=r),owner={G:{status:'loading',ready},sim:{clearInputs(){}},ticker:{reset(){}},stopAudio(){}};
 const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,{});return elements.get(id);};let clears=0;
 const ctx={hunt:owner,loadGeneration:0,input:{enabled:true,clear:()=>clears++},$:get,t:x=>x,document:{hidden:false}};vm.createContext(ctx);vm.runInContext(fn('watchMonster','function startPractice'),ctx);
 ctx.watchMonster(owner);assert.equal(ctx.input.enabled,false);ctx.hunt=null;ctx.loadGeneration++;owner.G.status='ready';resolve();await ready;await Promise.resolve();assert.equal(ctx.input.enabled,false);assert.ok(clears>0);
});
test('training fails on faint or timeout and dispose drops pending inputs',()=>{for(const reason of ['faint','timeout']){const p=new Training(real());if(reason==='faint')p.sim.carts=1;else p.elapsed=180;p.sim.step({});assert.equal(p.stage,'failed');p.sim.p.buffer={heavy:10};p.dispose();assert.deepEqual(p.sim.p.buffer,{});}});
test('normal cooperative plan decoder rejects practice id; no permanent training key',()=>{
 assert.equal(QUESTS.some(q=>q.id==='practice'),false);
 const coop=fs.readFileSync(new URL('../js/net/coop.js',import.meta.url),'utf8');assert.ok(coop.includes('const quest=QUESTS.find(q=>q.id===plan.quest);if(!quest)return;'));
 assert.ok(!fs.readFileSync(new URL('../js/training.js',import.meta.url),'utf8').includes('localStorage'));
});

test('actual practice entry retry skip and result callbacks preserve whole save and selected quest; writes zero',()=>{
 const elements=new Map(),$=id=>{if(!elements.has(id))elements.set(id,{hidden:true,classList:{add(){},remove(){}}});return elements.get(id);};
 const save=real(),before=JSON.stringify(save);let disposed=0,writes=0;
 const ctx={practice:null,hunt:null,coop:null,sel:'q1',loadGeneration:0,Training,deliverHuntResult,clearPracticeInput,QUESTS,save,renderer:{},ui:{setMon(){}},input:{clear(){},isTouch:false,enabled:false},$,t:x=>x,document:{hidden:false,body:{classList:{add(){},remove(){}}}},attachGSChargePresentation(){},attachBowChargePresentation(){},resize(){},clearCombatUI(){},unlocked:()=>true,makePreview(){},renderHub(){},onHuntEnd(){writes++;},persist(){writes++;},localStorage:{setItem(){writes++;}},SharedWallet:{addGold(){writes++;}},Hunt:class{constructor(r,q,s,u,i,onEnd,session,practice){this.G={status:'ready',ready:Promise.resolve()};this.sim=practice.sim;this.ticker={reset(){}};this.onEnd=onEnd;this.stopAudio=()=>{};this.dispose=()=>disposed++;}}};
 vm.createContext(ctx);vm.runInContext(fn('watchMonster','function startHunt')+fn('endHunt',"$('resBack').onclick"),ctx);
 ctx.startPractice();const first=ctx.hunt;assert.notEqual(ctx.practice.save,save);first.onEnd({win:true,quest:QUESTS[7],loot:{w_gem:999}});assert.equal(writes,0);ctx.startPractice();assert.equal(disposed,1);assert.notEqual(ctx.hunt,first);first.onEnd({win:true});assert.equal(writes,0);ctx.endHunt();assert.equal(disposed,2);assert.equal(ctx.practice,null);assert.equal(ctx.hunt,null);assert.equal(ctx.sel,'q1');assert.equal(JSON.stringify(save),before);assert.equal(writes,0);assert.equal($('practiceHud').hidden,true);assert.equal($('assetLoad').hidden,true);
});

test('actual pause/visibility pause cancels practice charge and buffers, keeps real state and loading gate',()=>{
 const exercise=new Training(real());exercise.sim.p.state='charge';exercise.sim.p.t=1;exercise.sim.p.buffer={heavy:5};let stopped=0,cleared=0;
 const hunt={over:false,G:{status:'loading'},sim:exercise.sim,p:exercise.sim.p,ticker:{reset(){}},stopAudio(){stopped++;}},elements={};
 const ctx={hunt,clearPracticeInput,practice:exercise,$:id=>elements[id]??={},input:{enabled:true,clear(){cleared++;}},t:x=>x,document:{pointerLockElement:null}};vm.createContext(ctx);vm.runInContext(fn('setPaused',"$('resume').onclick"),ctx);
 ctx.setPaused(true);assert.equal(hunt.paused,true);assert.equal(ctx.input.enabled,false);assert.equal(exercise.sim.p.state,'idle');assert.deepEqual(exercise.sim.p.buffer,{});assert.equal(stopped,1);ctx.setPaused(false);assert.equal(ctx.input.enabled,false);assert.ok(cleared>=2);
});

test('practice cleanup drops touch ownership, camera drag, knob/button visuals without changing global Input',async()=>{const {clearPracticeInput}=await import('../js/training.js');assert.equal(typeof clearPracticeInput,'function');const input={joy:{x:1,y:1,id:99},camTouch:{id:4},drag:true,clear(){this.joy.x=this.joy.y=0;}};let cleared=0;clearPracticeInput(input,{querySelectorAll(){return [{style:{},classList:{remove(){cleared++;}}}];}});assert.equal(input.joy.id,null);assert.equal(input.camTouch,null);assert.equal(input.drag,false);assert.ok(cleared>0);});
test('actual completed practice releases pointer lock so replay/return buttons are reachable',()=>{let unlocked=0;const ctx={clearPracticeInput,practice:{owner:null},hunt:{stopAudio(){},sim:{clearInputs(){}}},input:{clear(){},releaseAll(){}},$:()=>({}),updatePractice(){},document:{pointerLockElement:{},exitPointerLock(){unlocked++;}}};ctx.practice.owner=ctx.hunt;vm.createContext(ctx);vm.runInContext(fn('finishPractice','function startHunt'),ctx);ctx.finishPractice();assert.equal(unlocked,1);});

function mainHarness(weapon,role=null){
 const save=real();save.weapon=weapon;const bytes=JSON.stringify(save),writes={save:0,wallet:0,room:0,ranking:0,normal:0};let disposals=0,releases=0;
 const els=new Map(),$=id=>{if(!els.has(id))els.set(id,{hidden:true,classList:{add(){},remove(){}},querySelectorAll:()=>[]});return els.get(id);};
 const ctx={Training,deliverHuntResult,clearPracticeInput,practice:null,hunt:null,coop:role?{role,close(){writes.room++;}}:null,sel:'q2',loadGeneration:0,QUESTS,save,renderer:{},ui:{setMon(){}},input:{joy:{id:4,x:1,y:1},camTouch:{id:9},drag:true,clear(){},isTouch:false,enabled:false},$,t:x=>x,document:{hidden:false,pointerLockElement:{},exitPointerLock(){releases++;this.pointerLockElement=null;},body:{classList:{add(){},remove(){}}}},attachGSChargePresentation(){},attachBowChargePresentation(){},resize(){},clearCombatUI(){},unlocked:()=>true,makePreview(){},renderHub(){},onHuntEnd(){writes.normal++;},persist(){writes.save++;},localStorage:{setItem(){writes.save++;}},sessionStorage:{setItem(){writes.room++;}},SharedWallet:{addGold(){writes.wallet++;}},rankings:{submit(){writes.ranking++;}},Hunt:class{constructor(r,q,s,u,i,onEnd,session,exercise){assert.equal(session,null);this.G={status:'ready',ready:Promise.resolve()};this.sim=exercise.sim;this.p=this.sim.p;this.ticker={reset(){}};this.onEnd=onEnd;this.stopAudio=()=>{};this.dispose=()=>disposals++;}}};
 vm.createContext(ctx);vm.runInContext(fn('watchMonster','function startHunt')+fn('endHunt',"$('resBack').onclick")+fn('setPaused',"$('resume').onclick"),ctx);
 return {ctx,writes,bytes,save,check(){assert.equal(JSON.stringify(save),bytes);assert.equal(ctx.sel,'q2');assert.deepEqual(Object.values(writes),[0,0,0,0,0]);},disposals:()=>disposals,releases:()=>releases};
}
for(const weapon of ['gs','db','bow'])for(const path of ['complete','death','timeout','skip','retry','pause','abort-load'])test('actual '+weapon+' practice '+path+' preserves full save/wallet/rank/room bytes and fences stale callbacks',async()=>{
 const h=mainHarness(weapon),c=h.ctx;c.startPractice();const old=c.hunt,exercise=c.practice;
 if(path==='complete'){exercise.stage='fight';old.sim.hitMonster('body',9999,0,0,1);}
 if(path==='death')old.sim.carts=1;
 if(path==='timeout')exercise.elapsed=180;
 if(['complete','death','timeout'].includes(path)){for(let i=0;i<260;i++){old.sim.step({});for(const e of old.sim.drainEvents())if(e.type==='result')old.onEnd(e.result);}assert.equal(exercise.stage,path==='complete'?'complete':'failed');assert.equal(c.input.enabled,false);assert.equal(h.releases(),1);}
 if(path==='pause'){old.p.state='charge';old.p.buffer={heavy:8};c.setPaused(true);assert.equal(old.p.state,'idle');assert.deepEqual(old.p.buffer,{});c.document.hidden=true;c.setPaused(false);assert.equal(c.input.enabled,false);}
 if(path==='retry'){c.startPractice();assert.notEqual(c.hunt,old);assert.equal(h.disposals(),1);}
 if(path==='abort-load'){old.G.status='loading';c.watchMonster(old);c.endHunt();old.G.status='ready';await old.G.ready;await Promise.resolve();assert.equal(c.input.enabled,false);}
 if(c.hunt)c.endHunt();
 // Adversarial terminal output after leaving/re-entering or joining a normal hunt.
 c.hunt={normal:true};old.onEnd({win:true,quest:QUESTS[7],time:1,loot:{w_gem:999999},training:false});c.hunt=null;h.check();
 assert.equal(c.practice,null);assert.equal(c.input.joy.id,null);assert.equal(c.input.camTouch,null);assert.equal(c.input.drag,false);
});
for(const role of ['host','guest'])test('actual '+role+' lobby/session cannot enter practice or write room state',()=>{const h=mainHarness('gs',role);h.ctx.startPractice();assert.equal(h.ctx.hunt,null);assert.equal(h.ctx.practice,null);h.check();});
