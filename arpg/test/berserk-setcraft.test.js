import test from 'node:test';
import assert from 'node:assert/strict';
import {HubUI} from '../js/ui/hub.js';
import {trained} from './weapon-loadout-fixture.js';
import {setStatus,setBonuses} from '../js/meta/stats.js';
import {ITEMS,RECIPES} from '../js/meta/items.js';
import {noteMaterials} from '../js/meta/recipe-discovery.js';
test('weapon confirmation describes berserk with target handedness',()=>{
 globalThis.document={activeElement:null};const h=Object.create(HubUI.prototype);h.save=trained();h.save.equipped.weapon='blunt';h.save.stats.str=90;h.save.loadout=['berserk',null,null];h.save.items.push({uid:'warden',id:'warden_blade',enhance:0,affixes:[],rolledAt:0});h.root={querySelector:()=>null};h.mountSheet=html=>{h.html=html};h.beginEquipment('equip','warden');assert.ok(h.pendingEquipment);assert.ok(!h.html.includes('광전사 · 사용 불가</dd>'),'target two-hand berserk must be usable');
});
test('set craft read model uses canonical slots and active stat tiers',()=>{
 const h=Object.create(HubUI.prototype);h.save=trained();h.save.gold=100000;h.save.stacks=Object.fromEntries(Object.values(RECIPES).flatMap(r=>Object.keys(r)).filter(k=>k!=='gold').map(k=>[k,500]));h.save=noteMaterials(h.save);h.forgeRecipeMode='all';h.forgeRecipeSet='set:warden';
 for(const id of ['warden_blade_rare','warden_maul','warden_plate'])h.save.items.push({uid:id,id,enhance:3,affixes:[]});
 for(const worn of [false,true]){if(worn){h.save.equipped.weapon='warden_blade_rare';h.save.equipped.body='warden_plate';}const html=h.forgeRecipesHtml(),s=setStatus(h.save,'warden');assert.match(html,/2 \/ 2 보유/);assert.ok(html.includes(`${s.count} / 2 착용`));assert.match(html,/data-action="forge-piece"/);assert.equal((html.match(/data-action="craft"/g)||[]).length,1);assert.equal(html.includes('2세트 · 활성'),worn);assert.equal(!!setBonuses(h.save).ac,worn);}
});
