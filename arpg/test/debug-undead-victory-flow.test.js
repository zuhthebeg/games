import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createUndeadSession } from '../js/debug/undead-start.js';
import { step, emptyInput } from '../js/sim/world.js';
import { TICK_MS } from '../js/sim/core.js';
import { HUD } from '../js/ui/hud.js';
const source=readFileSync(new URL('../js/main.js',import.meta.url),'utf8');
const frameSource=source.slice(source.indexOf('  function frameUndead'),source.indexOf('  function closeCoop'));
function fixture(){return createUndeadSession({factories:new Map([['blade',()=>{}],['skeleton_warrior',()=>{}]]),register(k,f){this.factories.set(k,f);}});}
for(const terminal of ['victory','death','returned']) test(`actual main ${terminal} frame owns visible result, neutral rendering and no extra simulation`,()=>{
 const session=fixture(), encounter=session.restart();
 for(let i=0;i<4000&&session.state(encounter)==='running';i++)step(encounter.world,{local:{...emptyInput(),attack:terminal==='victory',autoAttack:terminal==='victory',scrollEdge:terminal==='returned'&&i===0}});
 assert.equal(session.state(encounter),terminal);
 const raw=JSON.stringify(encounter.world);let shown=null,rendered=null;
 const renderer={views:new Map([[0,{visual:{debug:{mode:'atlas'}}}],[1,{visual:{debug:{mode:'atlas'}}}]]),root:{},snapshot(){},render(w){rendered=w;},events(){}};
 const hud={nodes:{notice:{}},update(){},showUndeadResult(state,actions){shown={state,actions};}};
 const input={enabled:true,reset(){this.cleared=true;},consume(){throw Error('terminal consumed input');}};
 const actions={next:()=>{},restart:()=>{},leave:()=>{}};
 const frame=new Function('undead','undeadEncounter','world','renderer','hud','input','document','TICK_MS','step','emptyInput','audio','startUndead','leaveUndead',`let accumulator=0;${frameSource};return frameUndead;`)(session,encounter,encounter.world,renderer,hud,input,{querySelector:()=>null},TICK_MS,step,emptyInput,{},actions.next,actions.leave);
 frame(34);frame(200);
 assert.ok(shown,'terminal must present visible result actions, not only notice text');assert.equal(shown.state,terminal);
 assert.equal(typeof shown.actions.next,'function');assert.equal(typeof shown.actions.restart,'function');assert.equal(typeof shown.actions.leave,'function');
 assert.equal(input.enabled,false);assert.equal(input.cleared,true);assert.equal(JSON.stringify(encounter.world),raw);
 assert.notEqual(rendered,encounter.world,'neutral terminal presentation is not authoritative simulation');
 for(const entity of rendered.entities){assert.equal(entity.act,null);assert.equal(entity.moving,false);assert.equal(entity.staggerLeft,0);assert.equal(entity.dodge?.dashLeft||0,0);}
 assert.deepEqual(rendered.entities.map(e=>e.dead),encounter.world.entities.map(e=>e.dead));
 session.leave();
});
class Node {
 constructor(){this.children=[];this.hidden=false;this.dataset={};this.attributes={};this.listeners={};}
 append(...nodes){this.children.push(...nodes);for(const n of nodes)n.parent=this;}
 setAttribute(k,v){this.attributes[k]=v;}
 addEventListener(k,f){this.listeners[k]=f;}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}
}
test('HUD result has honest native buttons, single ownership and restores original actions visibility',()=>{
 const nodes={'#hud':new Node(),'#actions':new Node()};const previous=globalThis.document;
 globalThis.document={querySelector:s=>nodes[s],createElement:()=>new Node()};
 try {const hud=Object.create(HUD.prototype);let next=0,restart=0,leave=0;const actions={next:()=>next++,restart:()=>restart++,leave:()=>leave++};
 hud.showUndeadResult('victory',actions);const panel=nodes['#hud'].children[0];assert.equal(panel.attributes.role,'region');assert.equal(nodes['#actions'].hidden,true);
 const buttons=panel.children.filter(n=>n.tag==='button'||n.dataset.undeadAction);assert.deepEqual(buttons.map(n=>n.textContent),['다음 전투','다시 시작','인간으로 돌아가기']);
 for(const b of buttons)b.listeners.click({detail:0});assert.deepEqual([next,restart,leave],[1,1,1]);
 hud.showUndeadResult('victory',actions);assert.equal(nodes['#hud'].children.length,1);
 hud.clearUndeadResult();assert.equal(nodes['#hud'].children.length,0);assert.equal(nodes['#actions'].hidden,false);
 nodes['#actions'].hidden=true;hud.showUndeadResult('death',actions);assert.equal(nodes['#hud'].children[0].children.filter(n=>n.dataset.undeadAction).length,2);hud.clearUndeadResult();assert.equal(nodes['#actions'].hidden,true);
 }finally{globalThis.document=previous;}
});

test('actual main running frames consume unchanged controls and publish actions on the winning tick',()=>{
 const session=fixture(),encounter=session.restart();let shown=null,consumed=0;
 const renderer={views:new Map([[0,{visual:{debug:{mode:'atlas'}}}],[1,{visual:{debug:{mode:'atlas'}}}]]),root:{},snapshot(){},events(){},render(){}};
 const hud={nodes:{notice:{}},events(){},update(){},showUndeadResult(state,actions){shown={state,actions};}};
 const input={enabled:true,reset(){},consume(){consumed++;return {...emptyInput(),attack:true,autoAttack:true};}};
 const frame=new Function('undead','undeadEncounter','world','renderer','hud','input','document','TICK_MS','step','emptyInput','audio','startUndead','leaveUndead',`let accumulator=0;${frameSource};return frameUndead;`)(session,encounter,encounter.world,renderer,hud,input,{querySelector:()=>null},TICK_MS,step,emptyInput,{events(){}},()=>{},()=>{});
 frame(TICK_MS);assert.equal(input.enabled,true);assert.equal(shown,null);assert.equal(consumed,1);
 for(let i=0;i<4000&&!shown;i++)frame(TICK_MS);
 assert.equal(shown?.state,'victory');assert.equal(input.enabled,false);assert.ok(encounter.human.dead);
 const count=consumed,tick=encounter.world.tick;frame(250);assert.equal(consumed,count);assert.equal(encounter.world.tick,tick);session.leave();
});

test('result rejects a trailing pointer click from the held attack, but accepts deliberate pointer/keyboard activation',()=>{
 const nodes={'#hud':new Node(),'#actions':new Node()},previous=globalThis.document;
 globalThis.document={querySelector:s=>nodes[s],createElement:()=>new Node()};
 try {const hud=Object.create(HUD.prototype);let calls=0;hud.showUndeadResult('victory',{next:()=>calls++,restart:()=>calls++,leave:()=>calls++});
 const button=nodes['#hud'].children[0].children.find(n=>n.dataset.undeadAction==='leave');
 button.listeners.click({detail:1});assert.equal(calls,0,'old attack release must not return to human');
 button.listeners.pointerdown();button.listeners.click({detail:1});assert.equal(calls,1);
 button.listeners.click({detail:0});assert.equal(calls,2);hud.clearUndeadResult();
 }finally{globalThis.document=previous;}
});
