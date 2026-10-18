import test from 'node:test';
import assert from 'node:assert/strict';
import {ITEMS,RECIPES,craft,dismantle,dismantleMaterial,dismantleRefund,rollDrops} from '../js/meta/items.js';
import {ENCHANT} from '../js/meta/economy.js';
import {createSave,validateSave,SaveStore} from '../js/meta/save.js';
import {noteMaterials} from '../js/meta/recipe-discovery.js';
import {HubUI} from '../js/ui/hub.js';
import {itemDetailsHtml} from '../js/ui/gear-view.js';
const fresh=()=>createSave({name:'제작 검증',answers:[0,0,0,0,0],createdAt:1});
const rich=()=>({...fresh(),gold:100000,stacks:{...fresh().stacks,...Object.fromEntries(Object.entries(ITEMS).filter(([,d])=>d.kind==='material'&&!d.legacy).map(([id])=>[id,1000]))}});
test('B every T2+ non-dropOnly equipment including rarity variants has a recipe and roundtrips lossily',()=>{
 let covered=0;
 for(const [id,def] of Object.entries(ITEMS).filter(([,d])=>d.slot&&d.huntTier>=2)){
  if(def.dropOnly){assert.equal(RECIPES[id],undefined);continue;}
  const recipe=RECIPES[id];assert.ok(recipe,`missing ${id}`);const s=noteMaterials(rich()),made=craft(s,id),item=made.items.at(-1);
  assert.equal(item.enhance,0);assert.ok(validateSave(made),id);
  const data=new Map(),store=new SaveStore({getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)});store.save(made);assert.deepEqual(store.load(),made);
  const primary=dismantleMaterial(item),salvaged=dismantle(made,item.uid);
  assert.ok(recipe[primary]>0);assert.equal(salvaged.stacks[primary],s.stacks[primary]-recipe[primary]+dismantleRefund(item));assert.ok(salvaged.stacks[primary]<s.stacks[primary]);assert.equal(salvaged.gold,s.gold-recipe.gold);assert.ok(validateSave(salvaged));covered++;
 }
 assert.ok(covered>100);console.log('B craft coverage',covered);
});
test('B dropped enhanced gear provenance appears in receipt and detail; enhanced and premium loot highlight',()=>{
 const save=rich(),hub=Object.create(HubUI.prototype);hub.save=save;hub.lootState={};hub.revealed=1;
 let drop;for(let seed=1;seed<1000&&!drop;seed++)drop=rollDrops('goblin_chief',seed,{huntTier:2}).items.find(i=>i.enhance>0);
 save.items.push(drop);const receipt={lootKept:{gold:0,items:[drop],stacks:{rune_shard:1,frost_shard:1,dragon_scale:1,scrap:1}},lootLost:{gold:0,items:[],stacks:{}},used:{},restored:{},xpGained:0,xpLost:0,levelsGained:0,statPointsGained:0};
 const receiptHtml=hub.receiptHtml(receipt),reveal=hub.revealHtml(receipt);
 for(const html of [receiptHtml,reveal,itemDetailsHtml(drop)])assert.match(html,/누군가 떨군 장비를 몬스터가 쓰고 있었다/);
 for(const html of [receiptHtml,reveal])assert.match(html,/loot-highlight[\s\S]*득템/);
 for(const id of ['rune_shard','frost_shard','dragon_scale'])assert.match(receiptHtml,new RegExp(`data-premium="${id}"`));
 assert.doesNotMatch(itemDetailsHtml(save.items[0]),/누군가 떨군/);
 const before=save.stacks.enhance_stone_1||0,next=dismantle(save,drop.uid);assert.equal(next.stacks.enhance_stone_1-before,ENCHANT.dismantleStones[drop.enhance]);
});
test('B crafting stays under smith and incomplete recipes state exact shortages',()=>{
 const hub=Object.create(HubUI.prototype);hub.save=noteMaterials({...fresh(),gold:2,stacks:{...fresh().stacks,scrap:1}});hub.forgeTab='salvage';hub.showInnPanel=(_t,html)=>hub.html=html;hub.showForge();
 hub.action('forge-recipe-mode',{mode:'all'}); // Shortages are intentionally hidden by the craftable-only default.
 assert.match(hub.html,/고철 7개 부족/);assert.match(hub.html,/58 G 부족/);assert.match(hub.html,/aria-describedby="craft-reason-iron_sword"/);
 hub.recoverVitals=()=>{};hub.show=html=>hub.html=html;hub.showInn();assert.doesNotMatch(hub.html,/data-action="craft-hub"/);assert.match(hub.html,/data-action="forge"/);
 hub.showForge=()=>hub.forgeTab;assert.equal(hub.action('forge',{}),'enhance');assert.equal(hub.action('forge-tab',{tab:'salvage'}),'salvage');
});
test('B native craft action commits once, selects result and announces success',()=>{
 const hub=Object.create(HubUI.prototype);hub.save=rich();hub.commit=s=>hub.save=s;hub.showInnPanel=(_t,html)=>hub.html=html;
 const before=hub.save.gold;hub.action('craft',{id:'rune_blade'});assert.equal(hub.save.gold,before-RECIPES.rune_blade.gold);assert.equal(hub.selectedUid,hub.save.items.at(-1).uid);assert.match(hub.html,/제작 완료/);
});
