import test from 'node:test';import assert from 'node:assert/strict';
import {ITEMS,instance}from '../js/meta/items.js';import {createSave}from '../js/meta/save.js';import {HubUI}from '../js/ui/hub.js';import {itemDetailsHtml}from '../js/ui/gear-view.js';import {itemArtKey,itemArtPath}from '../js/ui/item-art.js';
const ids=['silver_blade','silver_maul','silver_bow','silver_wand','silver_staff'];
test('C silver details explain craft-only, undead +50%, direct attacks and exclusions for every rarity',()=>{
 for(const id of ids)for(const suffix of ['','_common','_rare','_epic']){const text=itemDetailsHtml(instance('detail',id+suffix,1,[]));assert.match(text,/제작 전용/);assert.match(text,/언데드.*무기 공격 피해 \+50%/);assert.match(text,/힐·턴 언데드·지속피해·마법 스킬 제외/);assert.match(text,/일반 생물.*없음/);assert.doesNotMatch(text,/undefined|NaN/);}
 assert.ok(itemArtPath(itemArtKey('silver_ingot',ITEMS.silver_ingot)));
});
test('C every S21-S27 sortie and both undead regions recommend holy/turn/silver with viable ordinary weapons and low boss turn chance',()=>{
 const save=createSave({name:'추천',answers:[0,0,0,0,0],createdAt:1});for(const id of Object.keys(save.cleared)){save.cleared[id]=true;save.stageThreat[id]=1;}
 const hub=Object.assign(Object.create(HubUI.prototype),{save,showInnPanel(_title,html){this.html=html;}});globalThis.matchMedia=()=>({matches:false});
 const check=html=>{for(const re of [/언데드 다수 출현/,/성속성·턴 언데드·은 무기 추천/,/일반 무기도 가능/,/보스.*턴 언데드.*낮은 확률/])assert.match(html,re);};
 for(let n=21;n<=27;n++){hub.showSortie('S'+n);check(hub.html);}hub.showSortie('S2');assert.doesNotMatch(hub.html,/undead-recommendation/);
 hub.showBoard();assert.equal((hub.html.match(/class="undead-recommendation"/g)||[]).length,2);check(hub.html);
});
test('C real silver ingots are highlighted in the actual reward receipt builder',()=>{
 const hub=Object.assign(Object.create(HubUI.prototype),{save:createSave({name:'영수증',answers:[0,0,0,0,0],createdAt:1}),receiptDetails:()=>''});
 const html=hub.receiptHtml({xpGained:0,lootKept:{gold:0,items:[],stacks:{silver_ingot:2}}});assert.match(html,/data-premium="silver_ingot"/);assert.match(html,/득템 · 은 주괴/);
});

test('C silver source descriptions appear in items, recipes and construct region/sortie hints',()=>{
 assert.match(ITEMS.silver_ingot.description,/T2.*구조물.*고링.*룬 수호자.*가고일/);
 const save=createSave({name:'은 출처',answers:[0,0,0,0,0],createdAt:1});for(const id of Object.keys(save.cleared)){save.cleared[id]=true;save.stageThreat[id]=1;}save.stacks.silver_ingot=6;
 const hub=Object.assign(Object.create(HubUI.prototype),{save,forgeTab:'salvage',showInnPanel(_title,html){this.html=html;}});globalThis.matchMedia=()=>({matches:false});
 assert.match(hub.stackRowsHtml(save.stacks,{kind:'material'}),/은 주괴.*T2.*구조물/);
 hub.showForge();hub.action('forge-recipe-mode',{mode:'all'});assert.match(hub.html,/은 주괴.*T2.*구조물/);assert.match(hub.html,/제작 전용.*언데드.*\+50%/);
 for(const stage of ['S9','S12','S14','S17','S19','M_THRONE_GARGOYLE']){hub.showSortie(stage);assert.match(hub.html,/silver-source/);assert.match(hub.html,/은 주괴.*T2.*구조물/);}
 for(const stage of ['S2','S6','S21','S27']){hub.showSortie(stage);assert.doesNotMatch(hub.html,/silver-source/);}
 hub.showBoard();assert.equal((hub.html.match(/class="silver-source"/g)||[]).length,4);
 for(const id of ids)assert.match(itemDetailsHtml(instance('source',id,1,[])),/은 주괴.*T2.*구조물/);
});
