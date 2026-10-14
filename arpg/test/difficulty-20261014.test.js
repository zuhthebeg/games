import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {BALANCE} from '../js/content/balance.js';
import {ITEMS,shopPrice,buy} from '../js/meta/items.js';
import {createSave,validateSave} from '../js/meta/save.js';
const original=execFileSync('git',['show','eefca2c:arpg/js/content/balance.js'],{encoding:'utf8'});
const {BALANCE:old}=await import('data:text/javascript;base64,'+Buffer.from(original).toString('base64'));
test('user requested twenty percent HP and damage reduction preserves other balance fields',()=>{
 assert.ok(Math.abs(BALANCE.monsterHp-old.monsterHp*.8)<1e-12);
 assert.equal(Object.keys(BALANCE.stages).length,27);
 for(const [id,stage] of Object.entries(BALANCE.stages)){
  assert.ok(Math.abs(stage.damage-old.stages[id].damage*.8)<1e-12,id);
  assert.deepEqual({...stage,damage:old.stages[id].damage},old.stages[id],id+' other encounter settings');
 }
 assert.deepEqual({...BALANCE,monsterHp:old.monsterHp,stages:old.stages},old);
});
test('HP3 MP5 return10 shop purchases charge exact current prices and preserve valid save',()=>{
 let save=createSave({name:'price-check',answers:[0,0,0,0,0],createdAt:123});save.gold=100;
 for(const [id,price] of [['potion',3],['mana_potion',5],['return_scroll',10]]){
  assert.equal(ITEMS[id].price,price);assert.equal(shopPrice(save,id),price);
  const count=save.stacks[id]||0,gold=save.gold;save=buy(save,id,2);
  assert.equal(save.gold,gold-price*2);assert.equal(save.stacks[id],count+2);
 }
 validateSave(save);
});
