import test from 'node:test';
import assert from 'node:assert/strict';
import {Container} from '../vendor/pixi-8.22.0.min.mjs';
import {ArenaRenderer} from '../js/render/renderer.js';
import {VisualProvider} from '../js/render/visual-provider.js';
import {ABILITIES} from '../js/content/combat.js';
import {createWorld, addPlayer, spawnMonster, startStage, step, emptyInput} from '../js/sim/world.js';
import {decodeSnapshot, encodeSnapshot} from '../js/net/protocol.js';
for(const id of ['ground_slam','armor_break'])for(const reduced of [false,true])test(`B1 vector ${id} reduced=${reduced}: native cast, exact shape, orange/dust, no bake, sunder guest marker and reset`,()=>{
  const stage=new Container(),r=new ArenaRenderer({stage,screen:{width:390,height:844}},new VisualProvider({atlases:false}));
  const w=createWorld(),p=addPlayer(w,{pid:'local',x:400,y:400,mods:{skills:[id],weaponForm:'blunt'}});
  startStage(w,'S2');w.round.pending=[];w.round.goal='timer';w.round.timerTicks=10000;
  const m=spawnMonster(w,'scarecrow',470,400);m.spawnLeft=0;
  r.reset(w,reduced);let charge=false,active=false,hit=false;
  for(let t=0;t<40;t++) {
    r.snapshot(w);const journal=step(w,{local:{...emptyInput(),skillEdge:t===0,aimX:1}});const before=JSON.stringify(w);
    r.events(w,journal);r.render(w,1,1/30);assert.equal(JSON.stringify(w),before);
    const node=r.views.get(p.id).bluntCharge;
    if(node.visible){charge=true;const path=node.context.instructions[0].data.path.instructions;
      if(id==='ground_slam')assert.ok(path.some(n=>n.action==='circle'&&n.data[0]===40&&n.data[2]===128));
      else assert.ok(path.some(n=>n.action==='arc'&&n.data[2]===110));}
    const fx=r.effects.find(s=>s.kind==='blunt'&&s.node.visible);
    if(fx){active=true;const path=fx.node.context.instructions[0].data.path.instructions;
      assert.equal(fx.node.context.instructions[1].data.style.color,0xe88e50);
      if(id==='armor_break')assert.ok(path.some(n=>n.action==='arc'&&n.data[2]===110),'never shrink cone to legacy slash 78%');
      else assert.ok(path.some(n=>n.action==='circle'&&n.data[0]===40&&n.data[2]===128));}
    hit ||= journal.some(e=>e.type==='hit'&&e.ability===id);
  }
  assert.ok(charge&&active&&hit);assert.equal(r.skillVfx.fxLoads.has(id),false);
  if(id==='armor_break') {
    const guest=decodeSnapshot(encodeSnapshot(w),'local');r.reset(guest,reduced);r.render(guest,1,1/30);
    const marker=r.views.get(m.id).sunder;assert.equal(marker.visible,true);
    assert.ok(marker.context.instructions[0].data.path.instructions.filter(n=>n.action==='lineTo').length>=4,'crack shape, not color alone');
    guest.tick=guest.entities.find(e=>e.id===m.id).sunder.expiresTick;r.render(guest,1,1/30);assert.equal(marker.visible,false);
  }
  const old=r.views.get(p.id);r.reset(w,reduced);assert.ok(old.bluntCharge.destroyed&&old.sunder.destroyed);
  r.render(w,1,1/30);w.entities=w.entities.filter(e=>e.id!==m.id);r.render(w,1,1/30);assert.equal(r.views.has(m.id),false);
  stage.destroy({children:true});
});
