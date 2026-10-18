import test from 'node:test';
import assert from 'node:assert/strict';
import { createSave, validateSave, SaveStore } from '../js/meta/save.js';
import { ITEMS, craft, rollDrops, instance, equip } from '../js/meta/items.js';
import { enchantPreview, enchant } from '../js/meta/enchant.js';
import { STONE, BLESSED_STONE, CURSED_STONE } from '../js/meta/economy.js';
import { recipeRevealed } from '../js/meta/recipe-discovery.js';
import { buildRoundMods } from '../js/meta/run.js';
const fresh=()=>createSave({name:'Bone',answers:[0,0,0,0,0],createdAt:123});
const ids=['bone_set_weapon','bone_set_head','bone_set_body','bone_set_hands','bone_set_feet'];
test('five bone parts craft atomically, discover, persist, exclude shield and arm a full set',()=>{
 let s=fresh();s.gold=10000;s.stacks.undead_bone=1000;
 assert.equal(ids.length,5);assert.ok(!ITEMS.bone_set_offhand);
 for(const id of ids){assert.ok(recipeRevealed(s,id));const before=structuredClone(s);assert.throws(()=>craft({...s,gold:0},id));assert.deepEqual(s,before);s=craft(s,id);s=equip(s,s.items.at(-1).uid);}
 assert.equal(buildRoundMods(s).boneRevival,true);assert.ok(validateSave(s));const memory=new Map(),store=new SaveStore({getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)});store.save(s);assert.deepEqual(store.load(),s);
 s.equipped.feet=null;assert.ok(!buildRoundMods(s).boneRevival);
});
test('every bone attempt including +0 and blessed/cursed risks destruction; ordinary specials unchanged',()=>{
 const s=fresh();s.items.push(instance('bone','bone_set_weapon',1));s.stacks={...s.stacks,[STONE]:100,[BLESSED_STONE]:10,[CURSED_STONE]:10};
 for(const stone of [STONE,BLESSED_STONE,CURSED_STONE]){const p=enchantPreview(s,'bone',stone);assert.equal(p.risky,true);assert.equal(p.chance,.8);assert.equal(enchantPreview(s,s.items[0].uid,stone).chance,1);}
 for(let level=0;level<12;level++){s.items.at(-1).enhance=level;for(const stone of [STONE,BLESSED_STONE,CURSED_STONE])assert.ok(enchantPreview(s,'bone',stone).chance<1);}s.items.at(-1).enhance=0;
 let destroyed=false;for(let i=1;i<100;i++){s.createdAt=i;if(enchant(s,'bone',BLESSED_STONE).result.outcome==='destroyed')destroyed=true;}assert.ok(destroyed);
});
test('bone material drops only from undead using an independent deterministic stream',()=>{
 let amount=0;for(let seed=0;seed<500;seed++){amount+=rollDrops('skeleton_warrior',seed,{huntTier:4}).stacks.undead_bone||0;assert.ok(!rollDrops('wolf',seed,{huntTier:2}).stacks.undead_bone);}assert.ok(amount>0);
});
