import test from 'node:test';import assert from 'node:assert/strict';
import {createWorld,spawnMonster} from '../js/sim/world.js';
import {MONSTERS,ABILITIES} from '../js/content/combat.js';
import {BALANCE,monsterSizeProfile} from '../js/content/balance.js';
import {atlasScale} from '../js/render/atlas-state.js';
import {VisualProvider} from '../js/render/visual-provider.js';
test('seeded size range and sample means rise from S1 to S7, radius and atlas scale use same factor',()=>{
 let previous=0;
 for(let stage=1;stage<=7;stage++) {
  const mu=1+(stage-1)*BALANCE.size.step;let total=0;
  for(let seed=1;seed<=2000;seed++) {
   const w=createWorld({seed}),m=spawnMonster(w,'goblin_grunt',500,400,{stageId:`S${stage}`});
   assert.ok(m.sizeScale>=mu*.9-1e-12&&m.sizeScale<=mu*1.1+1e-12);
   assert.equal(m.r,MONSTERS.goblin_grunt.r*m.sizeScale);assert.equal(atlasScale(m),m.sizeScale);
   assert.equal(m.maxHp,Math.round(MONSTERS.goblin_grunt.hp*m.sizeHpMult));
   const clone=spawnMonster(createWorld({seed}),'goblin_grunt',500,400,{stageId:`S${stage}`});assert.deepEqual(m,clone);
   total+=m.sizeScale;
  }
  const mean=total/2000;assert.ok(Math.abs(mean-mu)<.005);assert.ok(mean>previous);previous=mean;
 }
});
test('boss/elite absolute visual scale is capped at 1.35; HP is weakly coupled without multiplying by stage mean',()=>{
 for(const stageId of ['S1','S4','S7','S99'])for(const type of ['goblin_grunt','goblin_chief'])for(const elite of [false,true]) {
  for(const roll of [0,.5,1]) {
   const size=monsterSizeProfile(stageId,elite,type==='goblin_chief',roll);
   assert.ok(size.scale*(type==='goblin_chief'?1.3:1)<=1.35+1e-12);
   assert.ok(size.hp>.9&&size.hp<1.1);
  }
  const m=spawnMonster(createWorld({seed:42}),type,500,400,{stageId,elite});
  assert.ok(atlasScale(m)<=1.35+1e-12);assert.equal(m.r,MONSTERS[type].r*m.sizeScale);
 }
});
test('procedural geometry is scaled exactly once, with the same physics ratio; ability ranges unchanged',()=>{
 const abilities=JSON.stringify(ABILITIES);
 const m=spawnMonster(createWorld({seed:42}),'goblin_grunt',500,400,{stageId:'S7',elite:true});
 const provider=new VisualProvider({atlases:false}),view=provider.createVisual(m);
 assert.equal(view.container.children[0].scale.x,m.sizeScale);
 assert.equal(view.container.children[0].children[0].scale.x,1);
 assert.equal(JSON.stringify(ABILITIES),abilities);view.destroy();
});
