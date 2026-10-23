import test from 'node:test';
import assert from 'node:assert/strict';
import { HUD, remainingMonsters } from '../js/ui/hud.js';
test('clear immediately reports zero monsters even with a pending wave',()=>{
 const world={entities:[{kind:'monster',dead:true}],round:{state:'clear',pending:[{}]}};
 assert.equal(remainingMonsters(world),0);
 world.round.state='running'; assert.equal(remainingMonsters(world),1);
});

test('HUD clear banner is visible until result transition',()=>{
 const prior=globalThis.document;
 const nodes=[];
 globalThis.document={createElement:()=>({setAttribute(){},remove(){nodes.pop()}}),querySelector:()=>({append(node){nodes.push(node)}})};
 try {
   const hud={clearBanner:null};
   HUD.prototype.showClear.call(hud);
   assert.equal(nodes.length,1);
   assert.equal(nodes[0].textContent,'스테이지 클리어!');
   HUD.prototype.hideClear.call(hud);
   assert.equal(nodes.length,0);
 } finally { globalThis.document=prior; }
});
