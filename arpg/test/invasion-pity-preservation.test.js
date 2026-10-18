import test from 'node:test';
import assert from 'node:assert/strict';
import {createSave,validateSave} from '../js/meta/save.js';
import {createSkeletonSave} from '../js/meta/character-creation.js';
import {instance,buy,carriedWeight,capacity} from '../js/meta/items.js';
import {InvasionLoot} from '../js/net/invasion-loot.js';
import {settleInvasion} from '../js/meta/run.js';

test('S4 chief overflow pity never replaces transferred invasion gear and replay is idempotent',()=>{
let h=createSave({name:'Hunter',answers:[0,0,0,0,0],createdAt:1});
const g=createSkeletonSave({lineage:'skeleton_knight',name:'Invader',answers:[0,0,0,0,0],createdAt:2});
for(const [id,s] of [['h',h],['g',g]]){Object.assign(s.cleared,{S1:true,S2:true,S3:true});s.activeInvasion='review-'+id;assert.equal(validateSave(s),true);}
h.gold=10000;h=buy(h,'potion',876);assert.equal(validateSave(h),true);
console.log('legal departure',JSON.stringify({weight:carriedWeight(h),capacity:capacity(h)}));
const ledger=new InvasionLoot({h:{rewardSave:h,role:'hunter'},g:{rewardSave:g,role:'invader'}},42,'s4-run','S4',1);
// Legal live-ledger state: invader holds two earlier stolen current-sortie pieces.
const earned=[instance('loot:s4-run:previous:1','iron_sword',5),instance('loot:s4-run:previous:2','hunter_bow',6)];
ledger.accounts.g.tracker.tempLoot={gold:0,items:earned,stacks:{}};
const hp={id:1,pid:'h',kind:'player',team:1,x:300,y:300,hp:100,potions:h.stacks.potion,manaPotions:h.stacks.mana_potion,scrolls:h.stacks.return_scroll};
const gp={id:2,pid:'g',kind:'player',team:2,x:300,y:300,hp:0,dead:true,terminal:'death',potions:g.stacks.potion,manaPotions:g.stacks.mana_potion,scrolls:g.stacks.return_scroll};
const w={tick:1,entities:[hp,gp],events:[]};
ledger.tick(w,[],['h']);assert.equal(ledger.drops[0].claimedBy,'h');assert.deepEqual(ledger.accounts.h.tracker.tempLoot.items,earned);
// The real S4 chief kill runs the normal tracker: its 18kg guaranteed maul cannot fit.
w.tick++;ledger.tick(w,[{type:'kill',monster:'goblin_chief',stageId:'S4',xp:50,threat:1,x:300,y:300}],['h']);
assert.deepEqual(ledger.accounts.h.tracker.tempLoot.items,earned);
assert.equal(ledger.accounts.h.tracker.tempLoot.chiefAwarded,undefined);
hp.terminal='clear';w.tick++;ledger.tick(w,[],['h']);
const result=settleInvasion(h,ledger.state('h'));
const present=earned.map(i=>({uid:i.uid,kept:result.save.items.some(j=>j.uid===i.uid)}));
console.log(JSON.stringify({before:earned.map(i=>i.uid),present,receiptItems:result.receipt.lootKept.items.map(i=>i.uid),pityGranted:result.receipt.pityGranted,saveValid:validateSave(result.save)},null,2));
assert.equal(present.filter(i=>i.kept).length,2,'both transferred items survive first-clear pity');
assert.equal(result.receipt.lootKept.items.length,3);
assert.equal(result.receipt.pityGranted,true);
assert.equal(validateSave(result.save),true);
for (const item of earned) assert.deepEqual(result.save.items.find(i=>i.uid===item.uid),item);
assert.deepEqual(settleInvasion(result.save,ledger.state('h')).save,result.save);

});
