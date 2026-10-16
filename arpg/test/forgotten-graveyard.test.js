import {HubUI} from '../js/ui/hub.js';
import {createSave} from '../js/meta/save.js';
import {settleRound} from '../js/meta/run.js';
import {createHash} from 'node:crypto';import {readFileSync} from 'node:fs';import test from 'node:test';import assert from 'node:assert/strict';
import {createSkeletonSave} from '../js/meta/character-creation.js';
globalThis.matchMedia=()=>({matches:false});globalThis.CustomEvent=class{};
const save=createSave({name:'<H & test>',answers:[0,0,0,0,0],createdAt:1});
const {receipt}=settleRound(save,{stageId:'S1',terminal:'clear',depositedXp:0,tempLoot:{gold:0,stacks:{},items:[]},used:{potions:0,manaPotions:0,scrolls:0},skillMastery:{}});
test('Human hub HTML stays byte-exact to 169f44a across twelve panels',()=>{
const rows={};for(const method of ['showInn','showInventory','showBag','showShop','showMerchant','showForge','showTrainer','showAllocation','showBoard','showSortie','showReceipt','showSettings']){const h=Object.assign(Object.create(HubUI.prototype),{save,dev:false,receipt:null,recoverVitals(){},pendingReceipt:{receipt},revealed:0,lootState:{},show(html){this.html=html;}});if(method==='showSettings') h.presentationHtml=()=>'<sound-fixture>';h[method](...(method==='showSortie'?['S1']:[]));rows[method]=createHash('sha256').update(h.html).digest('hex');}
assert.deepEqual(rows,JSON.parse(readFileSync(new URL('./fixtures/human-hub-169f44a.json',import.meta.url))));
});

function hub(save) {
 return Object.assign(Object.create(HubUI.prototype),{save,dev:false,receipt:null,recoverVitals(){this.recovered=(this.recovered||0)+1;},pendingReceipt:{receipt},revealed:0,lootState:{},show(html,page){this.html=html;this.page=page;}});
}
test('Skeleton and permanent DK keep every hub action and themed panel, without mutating saves',()=>{
 for(const permanentDeathKnight of [false,true]){
 const s={...createSkeletonSave({lineage:'skeleton_knight',name:'<S & test>',answers:[0,0,0,0,0],createdAt:1}),permanentDeathKnight};
 const before=JSON.stringify(s), h=hub(s);h.showInn();
 for(const text of ['잊힌 묘지','관에서 안식','묘실의 유품함','영혼의 제단','묘지 밖으로 출정','도굴꾼','저주받은 대장장이','아카데미','가방'])assert.ok(h.html.includes(text),text);
 assert.ok(h.html.includes('&lt;S &amp; test&gt;'));assert.equal(h.recovered,1);
 const human=hub(save);human.showInn();
 const actions=html=>[...html.matchAll(/data-action="([^"]+)"/g)].map(m=>m[1]);assert.deepEqual(actions(h.html),actions(human.html));
 for(const [method,label] of [['showInventory','묘실의 유품함'],['showAllocation','영혼의 제단'],['showBoard','묘지 밖으로 출정'],['showMerchant','도굴꾼'],['showForge','저주받은 대장장이'],['showReceipt','잊힌 묘지로']]){h[method]();assert.ok(h.html.includes(label),method);}
 for(const tab of ['material','consumable']){h.stashTab=tab;h.showInventory();assert.ok(h.html.includes('유품함 · 무게 없음'));}
 h.showAllocation(true);assert.ok(h.html.includes('영혼의 제단 · 레벨이 올랐다'));
 h.showBag();assert.ok(h.html.includes('유품함으로 맡기기'));
 assert.ok(h.receiptHtml({...receipt,pityGranted:true}).includes('유품함에 맡겼다'));
 h.action('result-inn',{});assert.equal(h.page,'inn');assert.equal(JSON.stringify(s),before);
 }
});
test('character choice switches graveyard back to the untouched Human inn',()=>{
 const s=createSkeletonSave({lineage:'skeleton_knight',name:'S',answers:[0,0,0,0,0],createdAt:1}),h=hub(s);
 h.initialCharacters={human:()=>save,read:()=>s};h.action('character-choice',{});assert.equal(h.page,'character-choice');
 h.action('choose-human',{});assert.ok(h.html.includes('잿빛 여관'));assert.ok(!h.html.includes('잊힌 묘지'));
 h.action('choose-skeleton',{});assert.ok(h.html.includes('잊힌 묘지'));
 h.creationLineage='skeleton_knight';h.name='S';h.answers=[0,0,0,0,0];h.showQuizResult();assert.ok(h.html.includes('해골 생성 · 잊힌 묘지로'));
});

test('HUD return/clear context keeps Human text and themes Skeleton/DK without changing death causes',async()=>{
 const {HUD}=await import('../js/ui/hud.js');const h=Object.create(HUD.prototype);
 for(const terminal of ['clear','return_scroll']){
 const world={entities:[{terminal}],round:{}};
 assert.equal(h.deathExplanation(world),terminal==='clear'?'인장에 힘이 깃들었다. 난로 곁에서 다음 길을 준비하자.':'주문서의 빛이 당신을 여관으로 이끌었습니다.');
 world.round.presentation={lineage:'skeleton_knight'};assert.ok(h.deathExplanation(world).includes('잊힌 묘지'));
 }
});
