import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Graphics,Container} from '../vendor/pixi-8.22.0.min.mjs';
import {SkillVfx,SKILL_VFX,VFX_CAPS} from '../js/render/skill-vfx.js';
import {MasterySkillVfx} from '../js/render/mastery-vfx.js';
import {paintRootGrip,drawCursedGround} from '../js/render/skeleton-vfx.js';
import {HUD} from '../js/ui/hud.js';
import {ABILITIES} from '../js/content/combat.js';
import {createWorld,addPlayer,startStage,step} from '../js/sim/world.js';
import {encodeSnapshot,decodeSnapshot} from '../js/net/protocol.js';
import {ArenaRenderer} from '../js/render/renderer.js';
import {VisualProvider} from '../js/render/visual-provider.js';
const vfx=()=>new SkillVfx(Graphics,new Container(),{effekseer:false});
const world=()=>({tick:20,entities:[],projectiles:[]});
const actor=()=>({id:1,kind:'player',x:300,y:300,r:18,act:{id:'blood_spear',def:ABILITIES.blood_spear,growth:{range:700},facing:.4,phase:'windup',elapsed:3,total:10}});
const shape=g=>g.context.instructions.map(i=>({action:i.action,path:i.data.path?.instructions}));

test('hands eruption rises from the ground, reduced mode keeps full hands without rise and uses fewer pooled particles',()=>{
 const normal=vfx(),reduced=vfx(),e={type:'handsBurst',ability:'cursed_hands',x:300,y:300,radius:130};
 for(const [v,r] of [[normal,false],[reduced,true]]){v.event(e,world(),r);v.update(world(),1,.016,r);const s=v.effects.find(s=>s.left>0);assert.ok(s.wave.visible);assert.equal(s.kind,'hands');assert.ok(s.node.getLocalBounds().width>=250);if(r)assert.equal(s.wave.scale.y,1);else {assert.ok(s.wave.scale.y<.5);assert.ok(s.wave.y>300);v.update(world(),1,.17,r);assert.equal(s.wave.scale.y,1);assert.equal(s.wave.y,300);}}
 assert.ok(reduced.particles.filter(p=>p.left>0).length<=normal.particles.filter(p=>p.left>0).length/4);
});

test('root clutches each target for its authoritative expiry, boss releases early, death and end clean immediately',()=>{
 const g=new Graphics(),view={},target={id:4,r:28,rootUntil:35};
 assert.ok(paintRootGrip(g,view,target,20,false));const first=shape(g);g.clear();assert.ok(paintRootGrip(g,view,target,25,false));assert.notDeepEqual(shape(g),first);
 g.clear();assert.ok(paintRootGrip(g,view,target,34,false));assert.equal(view.rootEnd,35);
 g.clear();assert.ok(paintRootGrip(g,view,{id:4,r:28},35,false));g.clear();assert.equal(paintRootGrip(g,view,{id:4,r:28},43,false),false);
 const normal={};assert.ok(paintRootGrip(g,normal,{id:5,r:18,rootUntil:65},43,false));assert.equal(normal.rootEnd,65);
 assert.equal(paintRootGrip(g,normal,{id:5,r:18,dead:true},44,false),false);assert.equal(normal.rootEnd,0);
 paintRootGrip(g,normal,{id:5,r:18,rootUntil:80},45,false);assert.equal(paintRootGrip(g,normal,{id:5,r:18,rootUntil:80},46,false,true),false);
});

test('reduced root grip has no struggling shake and same geometry on host/guest existing status fields',()=>{
 const h={},g={},a=new Graphics(),b=new Graphics(),target=Object.freeze({id:3,r:18,rootUntil:70});
 paintRootGrip(a,h,target,30,true);paintRootGrip(b,g,target,30,true);assert.deepEqual(shape(a),shape(b));const geometry=shape(a);
 a.clear();paintRootGrip(a,h,target,34,true);assert.deepEqual(shape(a),geometry);
});

test('blood guide is a narrow exact-range path from actual muzzle, never a cone; every pierced hit splashes and self cost bursts',()=>{
 const v=vfx(),w=world(),p=actor();w.entities=[p];const frozen=JSON.stringify(w);v.update(w,1,0,false);const s=v.actors[0],rect=s.guide.context.instructions[0].data.path.instructions.find(i=>i.action==='rect');
 assert.ok(s.guide.visible);assert.deepEqual(rect.data.slice(0,4),[22,-11,700,22]);assert.equal(s.guide.rotation,.4);assert.equal(s.guide.x,300);assert.ok(!s.guide.context.instructions.some(i=>i.data.path.instructions.some(p=>p.action==='arc')));
 v.event({type:'act',ability:'blood_spear',id:1},w,false);assert.ok(v.effects.some(s=>s.kind==='blood'&&s.left>0));
 for(const id of [2,3,4])v.event({type:'hit',ability:'blood_spear',src:1,id,x:350+id*30,y:300},w,false);
 assert.equal(v.effects.filter(s=>s.kind==='blood'&&s.left>0).length,4);assert.equal(JSON.stringify(w),frozen);
 p.act=null;v.update(w,1,.02,false);assert.equal(s.guide.visible,false);
});

test('blood trails use preallocated droplets, no new pool nodes over repeated casts, reduced mode hides droplets; disconnect/reset reclaims all',()=>{
 const v=vfx(),w=world(),p={id:9,abilityId:'blood_spear',x:300,y:300,r:11,vx:680,vy:0};w.projectiles=[p];const count=v.layer.children.length;
 for(let cycle=0;cycle<30;cycle++){p.id=9+cycle;for(let f=0;f<8;f++){p.x+=10;v.update(w,1,.03,false);}const s=v.projectiles.find(s=>s.id===p.id);assert.ok(s.drops.some(n=>n.visible));v.update(w,1,.01,true);assert.ok(s.drops.every(n=>!n.visible));w.projectiles=[];v.update(w,1,.01,false);assert.ok(s.drops.every(n=>!n.visible));w.projectiles=[p];}
 const owner={id:1,kind:'player',x:300,y:300};w.entities=[owner];v.event({type:'act',id:1,ability:'blood_spear'},w,false);owner.dead=true;v.update(w,1,.01,false);assert.ok(v.effects.every(s=>!s.node.visible));owner.dead=false;v.event({type:'act',id:1,ability:'blood_spear'},w,false);w.round={state:'complete'};v.update(w,1,.01,false);assert.ok(v.effects.every(s=>!s.node.visible));assert.ok(v.particles.every(s=>!s.node.visible));
 assert.equal(v.layer.children.length,count);assert.equal(v.effects.length,VFX_CAPS.effects);v.reset();assert.ok(v.actors.every(s=>!s.guide.visible));assert.ok(v.projectiles.every(s=>s.drops.every(n=>!n.visible)));assert.ok(v.effects.every(s=>!s.node.visible&&!s.wave.visible));
});

test('real encoded guest root/ground telegraph matches host draw and renderer reset/departure clears grips',()=>{
 const w=createWorld({seed:7});addPlayer(w,{pid:'local'});startStage(w,'S2');step(w,{local:{}});const p=w.entities[0];p.rootUntil=w.tick+15;
 const make=()=>new ArenaRenderer({stage:new Container(),screen:{width:1280,height:844}},new VisualProvider({atlases:false}));const h=make(),g=make();h.reset(w);const guest=decodeSnapshot(encodeSnapshot(w),'local');g.reset(guest);h.render(w,1,.016);g.render(guest,1,.016);
 assert.deepEqual(shape(h.views.get(p.id).statusRing),shape(g.views.get(p.id).statusRing));const view=h.views.get(p.id);h.reset(w);assert.ok(view.statusRing.destroyed);guest.entities=guest.entities.filter(e=>e.id===p.id);g.render(guest,1,.016);assert.equal(g.views.size,1);
 const a=new Graphics(),b=new Graphics();drawCursedGround(a,130,.6,false);drawCursedGround(b,130,.6,false);assert.deepEqual(shape(a),shape(b));
});

test('combat status events never display status/rule banners, existing poison badge is retained',()=>{
 const h={nodes:{notice:{textContent:''}},noticeLeft:0};HUD.prototype.events.call(h,['poison','poisonEnd','root','handsBurst','statusCast','revive','perfectDodge','counter'].map(type=>({type})));assert.equal(h.nodes.notice.textContent,'');assert.equal(h.noticeLeft,0);
 const src=readFileSync(new URL('../js/ui/hud.js',import.meta.url),'utf8');assert.doesNotMatch(src,/장판을 벗어나|반격 준비|이번 출정 부활 소진|귀환해야 확보/);
 assert.match(readFileSync(new URL('../js/render/renderer.js',import.meta.url),'utf8'),/if \(poison\)/);
});
