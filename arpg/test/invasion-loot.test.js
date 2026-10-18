import test from 'node:test';
import assert from 'node:assert/strict';
import {pair} from './invasion-session.test.js';
import {settleInvasion} from '../js/meta/run.js';
import {validateSave} from '../js/meta/save.js';
import {instance} from '../js/meta/items.js';
import {emptyInput} from '../js/sim/world.js';
test('host alone owns current sortie drops, death removes victim before hostile claim; replay cannot mint',()=>{
 const{s,saves}=pair();const w=s.host.world,[h,g]=w.entities,ledger=s.host.lootLedger;
 assert.ok(ledger);const original=structuredClone(saves.host);
 const earned={gold:17,stacks:{undead_bone:3},items:[instance('earned1','iron_sword',5),instance('earned2','hunter_bow',6),instance('earned3','ember_wand',7)]};
 ledger.accounts.host.tracker.tempLoot=structuredClone(earned);h.dead=true;h.hp=0;h.terminal='death';w.tick++;ledger.tick(w,[{type:'death',pid:'host',id:h.id}],['host','guest']);
 assert.deepEqual(ledger.accounts.host.tracker.tempLoot,{gold:0,items:[],stacks:{}});assert.equal(ledger.drops.length,1);const drop=ledger.drops[0];
 assert.equal(ledger.claim(w,'guest',{id:drop.id,loot:{gold:9999}}),false);g.x=h.x;g.y=h.y;g.dead=true;assert.equal(ledger.claim(w,'guest',{id:drop.id}),false);g.dead=false;
 assert.equal(ledger.claim(w,'guest',{id:drop.id,owner:'fake',gold:9999}),true);assert.equal(ledger.claim(w,'guest',{id:drop.id}),false);assert.deepEqual(ledger.accounts.guest.tracker.tempLoot,earned);
 ledger.tick(w,[{type:'death',pid:'host',id:h.id}],['host','guest']);assert.equal(ledger.drops.length,1);
 const victim=settleInvasion(saves.host,ledger.state('host'));assert.deepEqual(victim.receipt.lootLost,earned);assert.equal(victim.save.gold,original.gold);assert.deepEqual(victim.save.items,original.items);assert.deepEqual(victim.save.stacks,original.stacks);
 g.terminal='return_scroll';w.tick++;ledger.tick(w,[],[]);const account=ledger.state('guest'),got=settleInvasion(saves.guest,account);assert.equal(got.save.gold,saves.guest.gold+17);assert.equal(got.save.items.length,saves.guest.items.length+3);assert.equal(got.save.stacks.undead_bone,3);assert.ok(validateSave(got.save));
 assert.deepEqual(settleInvasion(JSON.parse(JSON.stringify(got.save)),account).save,got.save);assert.deepEqual(settleInvasion(victim.save,ledger.state('host')).save,victim.save);assert.deepEqual(saves.host,original);
});
test('current-sortie normal drops are host seeded; invader never rolls monster XP or loot',()=>{const{s}=pair();const w=s.host.world,l=s.host.lootLedger;w.tick++;l.tick(w,[{type:'kill',monster:'goblin_grunt',stageId:'S2',xp:5,threat:1,x:5,y:5}],['host','guest']);assert.equal(l.accounts.host.tracker.killIndex,1);assert.equal(l.accounts.guest.tracker.killIndex,0);assert.equal(l.accounts.guest.tracker.depositedXp,0);const before=structuredClone(l.accounts);l.tick(w,[],['host','guest']);assert.deepEqual(l.accounts,before);});
test('revival is not death and forged claim values never create drops or settlement',()=>{const{s}=pair();s.host.update(34,emptyInput());const w=s.host.world,l=s.host.lootLedger;assert.equal(l.claim(w,'guest',{id:'nonexistent',gold:9999}),false);w.tick++;l.tick(w,[{type:'revive',pid:'host'}],['host']);assert.equal(l.drops.length,0);assert.equal(l.state('host').terminal,null);assert.throws(()=>settleInvasion(s.host.profile.rewardSave,l.state('host')));});
test('actual transport snapshots/journal replay and out-of-order claims cannot regrant a transfer',()=>{
 const{s,saves}=pair(),w=s.host.world,[h,g]=w.entities,l=s.host.lootLedger;
 l.accounts.host.tracker.tempLoot={gold:23,stacks:{undead_bone:2},items:[]};h.hp=0;h.dead=true;h.terminal='death';g.x=h.x;g.y=h.y;
 s.host.update(34,emptyInput());assert.equal(l.drops.length,1);assert.equal(l.drops[0].claimedBy,'guest');assert.equal(l.accounts.guest.tracker.tempLoot.gold,23);
 s.host.broadcast();const a=structuredClone(s.guest.invasionAccount);s.host.rt('guest',{t:'claim',id:l.drops[0].id,gold:999999});s.host.broadcast();assert.deepEqual(s.guest.invasionAccount,a);
 for(let i=0;i<305;i++)s.host.update(34,emptyInput());s.host.broadcast();assert.equal(s.guest.invasionAccount.terminal,'return_scroll');const result=settleInvasion(saves.guest,s.guest.invasionAccount);assert.equal(result.receipt.goldGained,23);assert.equal(result.receipt.xpGained,0);assert.equal(result.save.cleared.S2,false);
 const packet=structuredClone(s.guest.buffer.frames.at(-1).world);s.guest.rt('stranger',{...packet,t:'snapshot',invasionAccounts:{guest:{...a,tempLoot:{gold:9999,items:[],stacks:{}}}}});assert.equal(s.guest.invasionAccount.tempLoot.gold,23);
});
test('settlement tokens reject old receipt after a new sortie and preserve S1 stolen gear without normal cap',()=>{
 const{s,saves}=pair(),l=s.host.lootLedger,w=s.host.world,g=w.entities.find(e=>e.pid==='guest');
 l.accounts.guest.tracker.tempLoot={gold:1,stacks:{},items:[instance('s1stolen','iron_sword',1)]};g.terminal='return_scroll';w.tick++;l.tick(w,[],[]);const a=l.state('guest');a.stageId='S1';const got=settleInvasion(saves.guest,a);assert.ok(got.save.items.some(i=>i.uid==='s1stolen'));const next={...got.save,activeInvasion:'another-sortie'};assert.deepEqual(settleInvasion(next,a).save,next);assert.throws(()=>settleInvasion({...saves.guest,activeInvasion:'another-sortie'},a));
});
