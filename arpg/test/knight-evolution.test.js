import test from 'node:test';
import assert from 'node:assert/strict';
import { createSkeletonSave } from '../js/meta/character-creation.js';
import { validateSave, SAVE_KEY, createSave } from '../js/meta/save.js';
import { playerForm } from '../js/content/player-lineages.js';
import { equip, instance, ITEMS } from '../js/meta/items.js';
import { addXp, xpSpan } from '../js/meta/progression.js';
import { CharacterStores } from '../js/meta/selected-character.js';
import { SLOT_SAVE_KEYS } from '../js/meta/character-slots.js';
import { HubUI } from '../js/ui/hub.js';
import { shopStock } from '../js/meta/shop.js';
import { portraitHtml } from '../js/ui/gear-view.js';
const slots={hands:'hands_light_common_t1',feet:'feet_light_common_t1',body:'cloth_tunic',head:'head_light_common_t1'};
export function fixture(level=30){
 let s=createSkeletonSave({lineage:'skeleton_knight',name:'영구기사',answers:[0,0,0,0,0],createdAt:1});
 let xp=0;for(let l=1;l<level;l++)xp+=xpSpan(l);s=addXp(s,xp);s.gold=10000;
 for(const [slot,id] of Object.entries(slots))s.items.push(instance(slot,id,0,[]));
 assert.equal(validateSave(s),true);return s;
}
const storage=s=>{const data=new Map([[SAVE_KEY,'HUMAN SENTINEL'],[SLOT_SAVE_KEYS.skeleton_knight,JSON.stringify(s)]]),writes=[];return{data,writes,fail:false,getItem:k=>data.get(k)??null,setItem(k,v){if(this.fail)throw Error('quota');writes.push([k,v]);data.set(k,v);},removeItem(){assert.fail('no quarantine');}};};
function hub(s,store){return Object.assign(Object.create(HubUI.prototype),{save:s,persist:next=>store.persist(next),root:{dataset:{page:'bag'},querySelector:()=>null},returnToPanel(){},showMerchant(){},showReceipt(){},lootState:{}});}
test('real equip checks exact thresholds and only five actual occupied slots latch permanent form',()=>{
 for(const [slot,min] of [['hands',8],['feet',15],['body',22],['head',30]]){
  assert.throws(()=>equip(fixture(min-1),slot),new RegExp(`Lv.${min}`));
  const s=equip(fixture(min),slot);assert.equal(s.equipped[slot],slot);assert.notEqual(s.permanentDeathKnight,true);
 }
 let s=fixture();assert.equal(playerForm(s),'skeleton_knight');assert.equal(playerForm('skeleton_knight',30),'skeleton_knight');
 for(const slot of ['hands','feet','body'])s=equip(s,slot);
 assert.equal(playerForm(s),'skeleton_knight');const old=structuredClone(s);const next=equip(s,'head');
 assert.equal(next.permanentDeathKnight,true);assert.equal(playerForm(next),'death_knight');assert.equal(validateSave(next),true);assert.deepEqual(s,old);
 const unequipped={...next,equipped:{...next.equipped,head:null,body:null,hands:null,feet:null}};
 assert.equal(playerForm(unequipped),'death_knight');assert.equal(validateSave(unequipped),true);
});
test('schema strictly validates optional permanent boolean only on knight; malformed/foreign reads never quarantine/fallback',()=>{
 assert.equal(validateSave({...fixture(),permanentDeathKnight:true}),true);
 for(const value of [null,0,1,'true',{},[],undefined])assert.equal(validateSave({...fixture(),permanentDeathKnight:value}),false);
 assert.equal(validateSave({...fixture(29),permanentDeathKnight:true}),false);
 for(const value of [false,true])assert.equal(validateSave({...createSave({name:'Human',answers:[0,0,0,0,0],createdAt:1}),permanentDeathKnight:value}),false);
 for(const bad of [{...fixture(),permanentDeathKnight:'true'},{...fixture(),lineage:'human'},{...fixture(),equipped:{...fixture().equipped,head:'body'}}]){
  const f=storage(bad),before=new Map(f.data);assert.throws(()=>new CharacterStores(f).selectKnight(),/손상/);assert.deepEqual(f.data,before);assert.deepEqual(f.writes,[]);
 }
});
test('normal hub equip/loot-equip/buy-equip commit final gear and latch once; failure leaves UI/raw/owner unchanged',()=>{
 const doc=globalThis.document;globalThis.document={activeElement:null};
 try{for(const action of ['equip','loot-equip','buy-equip'])for(const fail of [true,false]){
  let s=fixture();for(const slot of ['hands','feet','body'])s=equip(s,slot);
  let uid='head';if(action==='buy-equip'){
   let target;for(let n=0;n<100&&!target;n++){s.shopRefresh=n;target=shopStock(s.createdAt,n).find(i=>ITEMS[i.id].kind==='head'&&ITEMS[i.id].armorClass!=='heavy');}assert.ok(target);uid=target.uid;
  }
  const f=storage(s),stores=new CharacterStores(f);s=stores.selectKnight();const h=hub(s,stores),raw=f.getItem(SLOT_SAVE_KEYS.skeleton_knight),ownerRaw=stores.active.raw,before=structuredClone(s);f.fail=fail;
  if(fail){assert.throws(()=>h.action(action,{uid}),/quota/);assert.deepEqual(h.save,before);assert.equal(f.getItem(SLOT_SAVE_KEYS.skeleton_knight),raw);assert.equal(stores.active.raw,ownerRaw);assert.deepEqual(f.writes,[]);f.fail=false;}
  h.action(action,{uid});assert.equal(h.save.permanentDeathKnight,true);assert.equal(f.writes.length,1);const persisted=JSON.parse(f.writes[0][1]);assert.equal(persisted.permanentDeathKnight,true);assert.ok(persisted.equipped.head);assert.equal(validateSave(persisted),true);
  const removed={...h.save,equipped:{...h.save.equipped,head:null}};h.commit(removed);assert.equal(new CharacterStores(f).selectKnight().permanentDeathKnight,true);assert.equal(f.getItem(SAVE_KEY),'HUMAN SENTINEL');
 }}finally{globalThis.document=doc;}
});
test('public inn/name/portrait distinguish real permanent state and honestly disclose unchanged art',()=>{
 const s=fixture(),h=Object.assign(Object.create(HubUI.prototype),{save:s,show(html){this.html=html;},recoverVitals(){}});
 assert.match(h.topBar(),/해골/);assert.doesNotMatch(h.topBar(),/데스나이트/);
 h.save={...s,permanentDeathKnight:true};assert.match(h.topBar(),/데스나이트/);h.showInn();assert.match(h.html,/영구/);assert.match(h.html,/기존 해골 외형/);assert.doesNotMatch(h.html,/전환 미연결/);assert.match(portraitHtml(h.save),/데스나이트/);
});

test('latch is an identity flag only: no extra stats, bonuses, costs or automatic level-30 migration',()=>{
 let s=fixture();for(const slot of ['hands','feet','body'])s=equip(s,slot);
 const next=equip(s,'head'),expected=structuredClone(s);expected.equipped.head='head';expected.permanentDeathKnight=true;
 assert.deepEqual(next,expected);
 const f=storage(fixture()),stores=new CharacterStores(f);const legacy=stores.selectKnight();assert.notEqual(legacy.permanentDeathKnight,true);assert.equal(playerForm(legacy),'skeleton_knight');assert.deepEqual(f.writes,[]);
 const human=createSave({name:'Human',answers:[0,0,0,0,0],createdAt:1});human.items.push(instance('head',slots.head,0,[]));
 const h=equip(human,'head');assert.equal(Object.hasOwn(h,'permanentDeathKnight'),false);assert.equal(playerForm(h),'human');
 const incomplete={...s,equipped:{...s.equipped,feet:'nonexistent'}};assert.notEqual(equip(incomplete,'head').permanentDeathKnight,true);assert.equal(validateSave(equip(incomplete,'head')),false);
});
