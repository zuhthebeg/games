import test from 'node:test';
import assert from 'node:assert/strict';
import {createSave,validateSave,DEFAULT_AUTO_BUY} from '../js/meta/save.js';
import {deriveMods,effectiveStats} from '../js/meta/stats.js';
import {ITEMS,buy,carriedWeight} from '../js/meta/items.js';
import {buildRoundMods,usedConsumables,currentLoad,createTracker,settleRound} from '../js/meta/run.js';
import {createWorld,addPlayer,startStage,step,emptyInput} from '../js/sim/world.js';
import {encodeSnapshot,decodeSnapshot,InputSender,InputQueue,InputLatch,EDGES} from '../js/net/protocol.js';
import {predictPlayerTick} from '../js/net/player-prediction.js';
import {PLAYER_BASE} from '../js/content/combat.js';
const fresh=()=>createSave({name:'용사',answers:[0,0,0,0,0],createdAt:123});
const keys=['speed','attackSpeedBonus','dodgeCdMult','iframeBonusMs'];
function setup(save=fresh(),round=true) {const w=createWorld({seed:3});const p=addPlayer(w,{pid:'g',mods:buildRoundMods(save)});if(round){startStage(w,'S2');w.entities=w.entities.filter(e=>e.kind==='player');w.round.pending=[];w.round.goal='timer';w.round.timerTicks=1e6;}return {w,p};}
const use={...emptyInput(),greenEdge:true};
for(const [agi,gear] of [[10,0],[50,0],[100,0],[100,4],[1000,4]])test('effective AGI+20 exact, capped mods and immutable save '+agi+' gear '+gear,()=>{
 const s=fresh();s.stats.agi=agi;s.items[1].affixes=gear?[{k:'agi_flat',v:gear}]:[];s.stacks.green_potion=2;const old=JSON.stringify(s);
 const {w,p}=setup(s);const before=Object.fromEntries(keys.map(k=>[k,p[k]]));const expected=deriveMods({...s,stats:{...s.stats,agi:agi+20}});
 step(w,{g:use});assert.equal(p.greenActive,true);assert.equal(p.greenPotions,1);assert.equal(p.effectiveAgi,effectiveStats(s).agi+20);
 for(const k of keys)assert.equal(p[k],k==='speed'?PLAYER_BASE.speed*expected.speedMult:expected[k],k);
 step(w,{g:use});assert.equal(p.greenPotions,1);assert.equal(JSON.stringify(s),old);
 w.round.state='clear';step(w,{g:use});assert.equal(p.greenActive,false);for(const k of keys)assert.equal(p[k],before[k]);
});
test('legacy save zero, manual supply price/weight/default and settlement',()=>{
 const s=fresh();assert.equal(validateSave(s),true);assert.equal(buildRoundMods(s).greenPotions??0,0);assert.equal(DEFAULT_AUTO_BUY.green_potion,0);
 assert.equal(ITEMS.green_potion.price,10);assert.equal(ITEMS.green_potion.weight,.1);const bought=buy({...s,gold:100},'green_potion',2);assert.equal(bought.stacks.green_potion,2);assert.equal(bought.gold,80);
 const {w,p}=setup(bought);const startWeight=carriedWeight(bought);step(w,{g:use});const used=usedConsumables(bought,p);assert.equal(used.greenPotions,1);
 assert.ok(Math.abs(currentLoad(bought,createTracker(1),used).weight-(startWeight-.1))<1e-9);
 for(const terminal of ['clear','death','return_scroll']) {const result=settleRound(bought,{stageId:'S2',terminal,used});assert.equal(result.save.stacks.green_potion,1);assert.equal(result.receipt.used.green_potion,1);assert.equal(validateSave(result.save),true);assert.equal(setup(result.save).p.greenActive??false,false);}
 assert.throws(()=>settleRound(bought,{stageId:'S2',terminal:'clear',used:{greenPotions:3}}));assert.equal(bought.stacks.green_potion,2);
});
test('empty/dead/terminal/no hunt reject and terminal clears once',()=>{
 for(const condition of ['empty','dead','terminal','nohunt','ended']) {const s=fresh();s.stacks.green_potion=condition==='empty'?0:2;const {w,p}=setup(s,condition!=='nohunt');if(condition==='dead')p.dead=true;if(condition==='terminal')p.terminal='death';if(condition==='ended')w.round.state='clear';step(w,{g:use});assert.equal(p.greenActive??false,false,condition);assert.equal(p.greenPotions??0,s.stacks.green_potion,condition);}
 for(const condition of ['dead','terminal','ended']) {const s=fresh();s.stacks.green_potion=2;const {w,p}=setup(s);step(w,{g:use});if(condition==='dead')p.dead=true;if(condition==='terminal')p.terminal='return_scroll';if(condition==='ended')w.round.state='clear';step(w);assert.equal(p.greenActive,false);assert.equal(p.greenPotions,1);}
});
test('host and guest prediction agree, reconnect snapshot retains but never reconsumes',()=>{
 const s=fresh();s.stacks.green_potion=2;const {w,p}=setup(s);for(let i=0;i<12;i++){const v=decodeSnapshot(JSON.parse(JSON.stringify(encodeSnapshot(w))),'g');const input={...use,mx:1,attack:i>1};const predicted=predictPlayerTick(v.entities[0],input,{arena:w.arena,tick:w.tick});step(w,{g:input});for(const k of [...keys,'greenPotions','greenActive','effectiveAgi'])assert.equal(predicted[k],p[k],k);}
 const view=decodeSnapshot(JSON.parse(JSON.stringify(encodeSnapshot(w))),'g');assert.equal(view.entities[0].greenActive,true);assert.equal(view.entities[0].greenPotions,1);assert.equal(predictPlayerTick(view.entities[0],use,{arena:w.arena}).greenPotions,1);
});
test('green edge inherits bounded queues and duplicate packet dedup',()=>{
 assert.ok(EDGES.includes('greenEdge'));for(const Queue of [InputQueue,InputLatch]){const sender=new InputSender(),queue=new Queue();const s=fresh();s.stacks.green_potion=3;const {w,p}=setup(s);const packet=sender.packet(use);queue.receive(packet,0);queue.receive(packet,0);for(let i=0;i<35;i++)step(w,{g:queue.consume(40+i)});assert.equal(p.greenPotions,2);assert.equal(queue.pending.greenEdge,0);const flood=sender.packet(use);flood.edges.greenEdge=1e6;queue.receive(flood,80);queue.consume(120);assert.ok(queue.pending.greenEdge<=30);}
});

test('malformed green snapshot is rejected',()=>{
 const s=fresh();s.stacks.green_potion=2;const {w}=setup(s);const packet=encodeSnapshot(w);packet.entities[0].greenPotions=-1;assert.equal(decodeSnapshot(packet,'g'),null);
});
test('ordinary UI has manual accessible button, count and active value badge',async()=>{
 const {readFile}=await import('node:fs/promises');const html=await readFile(new URL('../index.html',import.meta.url),'utf8');const hud=await readFile(new URL('../js/ui/hud.js',import.meta.url),'utf8');const input=await readFile(new URL('../js/input.js',import.meta.url),'utf8');
 assert.match(html,/data-input="greenEdge"/);assert.match(html,/aria-label="초록물약"/);assert.match(hud,/greenActive/);assert.match(hud,/greenPotions/);assert.match(input,/KeyF: 'greenEdge'/);
});


test('real sessions own consumption, reconnect resync and settlement without duplicate spend',async()=>{
 const {CoopSession}=await import('../js/net/session.js');const {createMemoryTransport}=await import('../js/net/loopback.js');
 const net=createMemoryTransport(),sessions={},saves={};
 for(const uid of ['host','guest']){const save=fresh();save.stacks.green_potion=2;save.cleared.S1=true;saves[uid]=save;const transport=net.connect(uid,(from,p)=>p.t==='action'?sessions[uid].action(p.action):sessions[uid].rt(from,p));sessions[uid]=new CoopSession({uid,host:'host',players:['host','guest'],config:{stageId:'S2',threat:1,seed:9},profile:{name:uid,level:save.level,weapon:'blade',mods:buildRoundMods(save),threats:{S2:1},lineage:'human',role:'hunter',rewardSave:save},...transport});}
 const h=sessions.host,g=sessions.guest;g.update(34,emptyInput());assert.equal(h.phase,'running');
 // Keep this network test away from enemy contacts; no presentation/UI bypass.
 h.world.entities=h.world.entities.filter(e=>e.kind==='player');h.world.round.pending=[];h.world.round.goal='timer';h.world.round.timerTicks=1e6;
 for(let i=0;i<20;i++){g.update(34,i<5?use:emptyInput());h.update(34,i<5?use:emptyInput());}
 for(const p of h.world.entities){assert.equal(p.greenActive,true);assert.equal(p.greenPotions,1);assert.equal(usedConsumables(saves[p.pid],p).greenPotions,1);}
 const guest=h.world.entities.find(p=>p.pid==='guest');g.suspend();g.resume();assert.equal(g.awaitingResync,false);assert.equal(g.view().entities[0].greenActive,true);assert.equal(g.view().entities[0].greenPotions,1);
 for(let i=0;i<8;i++){g.update(34,use);h.update(34,use);}assert.equal(guest.greenPotions,1);
 for(const p of h.world.entities){p.terminal='return_scroll';const result=settleRound(saves[p.pid],{stageId:'S2',terminal:p.terminal,used:usedConsumables(saves[p.pid],p)});assert.equal(result.save.stacks.green_potion,1);assert.equal(result.receipt.used.green_potion,1);}
 step(h.world);assert.ok(h.world.entities.every(p=>!p.greenActive));
});

test('green remains manual by default and does not alter automatic HP/MP/return inputs',async()=>{
 const {applyAutoUse,DEFAULT_AUTO_USE}=await import('../js/meta/auto-use.js');const s=fresh();s.stacks.green_potion=2;const {p}=setup(s);
 for(const hp of [1,p.maxHp]){p.hp=hp;const inp=applyAutoUse(emptyInput(),p,DEFAULT_AUTO_USE);assert.equal(inp.greenEdge??false,false);}
});


test('legacy unused green supply never adds a save stack or receipt key',()=>{
 const s=fresh();const {w,p}=setup(s);const {save,receipt}=settleRound(s,{stageId:'S2',terminal:'return_scroll',used:usedConsumables(s,p)});
 assert.equal(Object.hasOwn(save.stacks,'green_potion'),false);assert.equal(Object.hasOwn(receipt.used,'green_potion'),false);assert.equal(validateSave(save),true);
});
test('snapshot repeated application and delayed old input never spend persistent inventory',()=>{
 const s=fresh();s.stacks.green_potion=2;const {w,p}=setup(s);step(w,{g:use});const packet=encodeSnapshot(w);for(let i=0;i<20;i++){const view=decodeSnapshot(packet,'g');assert.equal(view.entities[0].greenPotions,1);assert.equal(view.entities[0].effectiveAgi,p.effectiveAgi);}assert.equal(s.stacks.green_potion,2);
});

test('settlement rejects more than one green potion in a hunt even with inventory',()=>{
 const s=fresh();s.stacks.green_potion=5;assert.throws(()=>settleRound(s,{stageId:'S2',terminal:'return_scroll',used:{greenPotions:2}}),/Invalid consumable claim/);
 assert.equal(s.stacks.green_potion,5);
});

test('host rebuilds green capability from validated save, not a forged guest mod bag',async()=>{
 const {CoopSession}=await import('../js/net/session.js');
 for(const legacy of [false,true]){const s=fresh();s.cleared.S1=true;const profile={combatVersion:2,name:'g',level:s.level,weapon:'blade',mods:{...buildRoundMods(s),greenPotions:999,effectiveAgi:999,greenMods:{speedMult:99,attackSpeedBonus:99,dodgeCdMult:0,iframeBonusMs:99}},threats:{S2:1},...(legacy?{}:{lineage:'human',role:'hunter',rewardSave:s})};
 const h=new CoopSession({uid:'h',host:'h',players:['h','g'],profile,config:{stageId:'S2',threat:1}});h.rt('g',{t:'profile',profile});assert.equal(h.phase,'running');for(const p of h.world.entities){assert.equal(p.greenPotions??0,0);assert.equal(p.greenMods,undefined);}}
});
