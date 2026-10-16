import test from 'node:test';
import assert from 'node:assert/strict';
import { knightEquipmentAllowed } from '../js/meta/knight-equipment.js';
import { HubUI } from '../js/ui/hub.js';
import { CharacterStores } from '../js/meta/selected-character.js';
import { createSkeletonSave } from '../js/meta/character-creation.js';
import { addXp, xpSpan } from '../js/meta/progression.js';
import { SLOT_SAVE_KEYS } from '../js/meta/character-slots.js';
import { SAVE_KEY } from '../js/meta/save.js';
test('approved one-by-one armor gates: hands8 feet15 body22 head30; human unaffected',()=>{
 for(const [kind,min] of [['hands',8],['feet',15],['body',22],['head',30]])for(const level of [1,min-1,min,30]){
  assert.equal(knightEquipmentAllowed({lineage:'skeleton_knight',level},{kind}),level>=min,`${kind} at ${level}`);
  assert.equal(knightEquipmentAllowed({level},{kind}),true);
 }
});
test('single skeleton choice directly enters existing creation; no mage/archer/classes even disabled',()=>{
 let page;const h=Object.assign(Object.create(HubUI.prototype),{initialCharacters:{read:()=>null},show(html){this.html=html;},showName(){page='name';}});
 h.showCharacterChoice();assert.doesNotMatch(h.html,/기사|마법사|궁수|unavailable/);h.action('choose-skeleton',{});assert.equal(page,'name');
});
test('reload retains approved unlocked armor rather than clearing every armor slot',()=>{
 let s=createSkeletonSave({lineage:'skeleton_knight',name:'해골',answers:[0,0,0,0,0],createdAt:1});let xp=0;for(let l=1;l<22;l++)xp+=xpSpan(l);s=addXp(s,xp);assert.equal(s.level,22);
 s.items.push({uid:'old:tunic',id:'cloth_tunic',enhance:0,affixes:[],rolledAt:0});s.equipped.body='old:tunic';
 const data=new Map([[SAVE_KEY,'CORRUPT HUMAN'],[SLOT_SAVE_KEYS.skeleton_knight,JSON.stringify(s)]]),writes=[];
 const store=new CharacterStores({getItem:k=>data.get(k)??null,setItem(k,v){writes.push(k);data.set(k,v);},removeItem(){assert.fail();}});
 assert.deepEqual(store.selectKnight(),s);assert.deepEqual(writes,[]);assert.equal(data.get(SAVE_KEY),'CORRUPT HUMAN');
});
