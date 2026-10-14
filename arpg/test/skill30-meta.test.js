import test from 'node:test';
import assert from 'node:assert/strict';
import { MASTERY_THRESHOLDS, MASTERY_SKILLS, masteryLevel, masteryLabel, setMasteryLevel, settleMastery } from '../js/meta/skill-mastery.js';
import { createSave, SaveStore, validateSave } from '../js/meta/save.js';
import { settleRound } from '../js/meta/run.js';
const fresh=()=>createSave({name:'30',weapon:'focus',answers:[0,0,0,0,0],createdAt:1});
test('30 unique ceil-interpolated integer thresholds preserve legacy anchors; late anchors are parent defaults',()=>{
 assert.equal(MASTERY_THRESHOLDS.length,30);
 for(const [count,level] of [[0,1],[30,5],[100,10],[250,15],[500,20],[900,25],[1500,30],[Number.MAX_SAFE_INTEGER,30]]) assert.equal(masteryLevel(count),level);
 for(let i=0;i<30;i++){const t=MASTERY_THRESHOLDS[i];assert.ok(Number.isSafeInteger(t));assert.equal(masteryLevel(t),i+1);if(i){assert.ok(t>MASTERY_THRESHOLDS[i-1]);assert.equal(masteryLevel(t-1),i);}}
 assert.deepEqual(MASTERY_THRESHOLDS,[0,8,15,23,30,44,58,72,86,100,130,160,190,220,250,300,350,400,450,500,580,660,740,820,900,1020,1140,1260,1380,1500]);
});
test('counts survive reinterpretation/settlement/storage and MAX is only 30',()=>{
 const s=fresh();s.skillMastery=Object.fromEntries(MASTERY_SKILLS.map((id,i)=>[id,[0,30,100,250,500,1600][i%6]]));const before=structuredClone(s.skillMastery);
 assert.deepEqual(settleMastery(s,{}).skillMastery,before);assert.deepEqual(s.skillMastery,before);
 for(let level=1;level<=30;level++){const next=setMasteryLevel(s,'ember_bolt',level);assert.equal(masteryLevel(next.skillMastery.ember_bolt),level);assert.equal(masteryLabel(next,'ember_bolt').includes('최대'),level===30);assert.ok(validateSave(next));}
 for(const invalid of [0,31,1.5,'30',NaN])assert.throws(()=>setMasteryLevel(s,'ember_bolt',invalid));assert.throws(()=>setMasteryLevel(s,'unknown',30));
 const near={...s,skillMastery:{...s.skillMastery,ember_bolt:1499}};
 const result=settleRound(near,{stageId:'S2',terminal:'return_scroll',skillMastery:{ember_bolt:1}});assert.deepEqual(result.receipt.masteryRises,[{id:'ember_bolt',level:30}]);assert.ok(validateSave(result.save));
 const mem=new Map(),storage={getItem:k=>mem.get(k)??null,setItem:(k,v)=>mem.set(k,v),removeItem:k=>mem.delete(k)};const store=new SaveStore(storage);store.save(result.save);assert.deepEqual(store.load().skillMastery,result.save.skillMastery);assert.equal(mem.size,1);
 assert.throws(()=>settleMastery({...s,skillMastery:{ember_bolt:Number.MAX_SAFE_INTEGER}},{ember_bolt:1}));
});
test('invalid counts rejected and historical receipt levels are preserved, never replayed as new rises',()=>{
 const s=fresh();for(const count of [-1,1.5,'30',NaN,Infinity])assert.equal(validateSave({...s,skillMastery:{ember_bolt:count}}),false);
 assert.equal(validateSave({...s,skillMastery:{unknown:0}}),false);
 const result=settleRound({...s,skillMastery:{ember_bolt:99}},{stageId:'S2',terminal:'return_scroll',skillMastery:{ember_bolt:1}});
 for(const level of [2,3,4,5]){const old={...result.save,lastReceipt:{...result.receipt,masteryRises:[{id:'ember_bolt',level}]}};assert.ok(validateSave(old));const counts=structuredClone(old.skillMastery);assert.deepEqual(settleMastery(old,{}),{skillMastery:counts,rises:[]});assert.equal(old.lastReceipt.masteryRises[0].level,level);}
});
