import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,addPlayer,spawnMonster,step,emptyInput,startStage} from '../js/sim/world.js';
import {ABILITIES,weaponAttackMultiplier,canUseSkill} from '../js/content/combat.js';
import {BOOKS,learnSkill,equipSkill} from '../js/meta/skills.js';
import {createSave,validateSave} from '../js/meta/save.js';
import {trained} from './fixtures/trained.js';
import {trackMastery} from '../js/meta/skill-mastery.js';
import {encodeSnapshot,decodeSnapshot} from '../js/net/protocol.js';
import {predictPlayerTick} from '../js/net/player-prediction.js';
const setup=id=>{const w=createWorld({seed:25});const p=addPlayer(w,{pid:'p',weapon:'bow',x:500,y:400,mods:{skills:[id],mpRegen:0}});return{w,p};};
const mob=(w,x=700,y=400)=>{const t=spawnMonster(w,'ghoul',x,y);t.spawnLeft=0;t.frozenUntil=10000;t.hp=t.maxHp=10000;return t;};
const cast=w=>step(w,{p:{...emptyInput(),skillEdge:true}});
const run=(w,n)=>Array.from({length:n},()=>step(w)).flat();
for(const id of ['rain_arrow','spinning_shot']){
 test(`${id}: AGI book price, learn/equip/save/mastery and physical not twohand scaling`,()=>{assert.ok(BOOKS[id]);assert.equal(BOOKS[id].req.stat,'agi');let s=trained(createSave({name:'Arrows',answers:[0,0,0,0,0],weapon:'bow',createdAt:1}));s.gold=1000;const before=s.gold;s=equipSkill(learnSkill(s,id),'bow',id);assert.equal(s.gold,before-BOOKS[id].price);assert.ok(s.loadout.includes(id));assert.ok(validateSave(s));assert.equal(weaponAttackMultiplier(true,id,'undead',2),1.5);assert.equal(weaponAttackMultiplier(false,id,'undead',2),1);assert.equal(canUseSkill(id,'bow'),true);assert.equal(canUseSkill(id,'focus'),false);});
 test(`${id}: insufficient mana atomic, once-per-cast charge, finite cooldown`,()=>{const{w,p}=setup(id);assert.ok(ABILITIES[id]);p.mp=ABILITIES[id].manaCost-1;cast(w);assert.equal(p.act,null);assert.equal(w.projectiles.length,0);p.mp=100;cast(w);run(w,70);assert.equal(p.mp,100-ABILITIES[id].manaCost);assert.ok(p.cds[id]>0);assert.equal(cast(w).some(e=>e.type==='act'),false);});
}
test('rain locks target before windup, four delayed finite pulses, misses moved target and allied safe',()=>{
 const{w,p}=setup('rain_arrow');const t=mob(w),ally=mob(w);ally.team=p.team;cast(w);t.x=1100;run(w,12);assert.equal(w.zones[0].x,700);assert.equal(t.hp,10000);t.x=700;const trace=[];for(let i=0;i<70;i++)for(const e of step(w))if(e.type==='hit'&&e.ability==='rain_arrow')trace.push([w.tick-1,e]);assert.equal(trace.length,4);for(let i=1;i<4;i++)assert.equal(trace[i][0]-trace[i-1][0],9);assert.ok(trace.every(([,e])=>e.dmg===16&&e.zonePulse));assert.equal(ally.hp,10000);assert.equal(w.zones.length,0);
 const tr={};trackMastery(tr,[{type:'act',id:p.id,ability:'rain_arrow'},...trace.map(([,e])=>e)],{entities:w.entities,round:{stageId:'S1'}},'p');assert.equal(tr.skillMastery.rain_arrow,1);
});
test('rain pulse physical bow damage gets silver undead 1.5 only, no 2hand, no crit reroll or poise',()=>{
 const{w,p}=setup('rain_arrow');p.silverWeapon=true;p.handedness=2;p.dmgMult.bow=2;p.critChance=1;p.critMult=99;const t=mob(w);t.poise=999;cast(w);const hs=run(w,80).filter(e=>e.type==='hit'&&e.ability==='rain_arrow');assert.equal(hs.length,4);assert.ok(hs.every(e=>e.dmg===48&&!e.crit));assert.equal(t.poise,999);
});
test('spin launches twelve unique evenly distributed headings, actor full turn, no per-arrow cost',()=>{
 const{w,p}=setup('spinning_shot');const headings=[],seen=new Set(),facings=[];cast(w);for(let i=0;i<65;i++){step(w);if(p.act?.phase==='active')facings.push(p.facing);for(const pr of w.projectiles)if(!seen.has(pr.id)){seen.add(pr.id);headings.push((Math.atan2(pr.vy,pr.vx)+Math.PI*2)%(Math.PI*2));}}
 assert.equal(headings.length,12);headings.forEach((angle,i)=>assert.ok(Math.abs(angle-i*Math.PI/6)<1e-8));assert.ok(Math.max(...facings)>6.1);assert.equal(p.mp,78);assert.equal(w.projectiles.length,0);
});
test('spin arrows strike enemies behind caster, never allies, clean canceled/terminal flights',()=>{
 const{w,p}=setup('spinning_shot');const behind=mob(w,350,400),ally=mob(w,500,250);ally.team=p.team;cast(w);const es=run(w,80);assert.ok(es.some(e=>e.type==='hit'&&e.dst===behind.id&&e.ability==='spinning_shot'));assert.equal(ally.hp,10000);
 const f=setup('spinning_shot');cast(f.w);run(f.w,9);assert.ok(f.w.projectiles.length);f.p.terminal='return_scroll';run(f.w,20);assert.equal(f.w.projectiles.length,0);
});
test('spin host and guest predicted facing/action/mana stay aligned every tick; prediction cannot spawn',()=>{
 const{w,p}=setup('spinning_shot');let pred=structuredClone(p);for(let i=0;i<75;i++){const inp={...emptyInput(),skillEdge:i===0};pred=predictPlayerTick(pred,inp,{arena:w.arena,others:[],tick:w.tick});step(w,{p:inp});assert.equal(pred.facing,p.facing,`tick ${i}`);assert.equal(pred.mp,p.mp);assert.equal(pred.act?.phase,p.act?.phase);assert.equal(pred.projectiles,undefined);}
});
test('rain optional snapshots bounded delay/duration and death/removal cleanup',()=>{
 const{w,p}=setup('rain_arrow');startStage(w,'S1');cast(w);run(w,12);const packet=encodeSnapshot(w);assert.equal(decodeSnapshot(packet,'p').zones[0].abilityId,'rain_arrow');p.dead=true;step(w);assert.equal(w.zones.length,0);
});
test('bow UI icons/name/radius/sequential/spin details and reduced rain geometry are real and bounded',async()=>{
 const{skillIcon,skillCardHtml}=await import('../js/ui/skill-view.js');const{paintSpellZones,SPELL_ZONE_VFX}=await import('../js/render/spell-zones.js');const{Graphics}=await import('../vendor/pixi-8.22.0.min.mjs');const{SKILL_VFX}=await import('../js/render/skill-vfx.js');
 const s=trained(createSave({name:'UI',answers:[0,0,0,0,0],weapon:'bow',createdAt:1}));s.gold=2000;
 for(const id of ['rain_arrow','spinning_shot'])assert.match(skillIcon(id),/<path/);assert.match(skillCardHtml('rain_arrow',s),/반경 90/);assert.match(skillCardHtml('rain_arrow',s),/0.3초/);assert.match(skillCardHtml('spinning_shot',s),/360°/);assert.match(skillCardHtml('spinning_shot',s),/12발/);assert.equal(SPELL_ZONE_VFX.rain_arrow,ABILITIES.rain_arrow.zone);assert.equal(SKILL_VFX.spinning_shot.projectile,ABILITIES.spinning_shot.projectile);
 const{w}=setup('rain_arrow');cast(w);run(w,12);for(const reduced of [false,true]){const g=new Graphics();const before=JSON.stringify(w);paintSpellZones(g,w,reduced);assert.ok(g.context.instructions.length>0);assert.equal(JSON.stringify(w),before);g.destroy();}
});
test('bow guest cast is host-only with journal events matching and bounded predicted visual flights',async()=>{
 const{CoopSession}=await import('../js/net/session.js');const{createMemoryTransport}=await import('../js/net/loopback.js');for(const id of ['rain_arrow','spinning_shot']){const network=createMemoryTransport(),sessions={},events={host:[],guest:[]};for(const uid of ['host','guest']){const transport=network.connect(uid,(from,p)=>p.t==='action'?sessions[uid].action(p.action):sessions[uid].rt(from,p));sessions[uid]=new CoopSession({uid,host:'host',players:['host','guest'],profile:{name:uid,level:1,weapon:'bow',mods:{skills:[id],mpRegen:0},threats:{S2:1}},config:{stageId:'S2',threat:1,seed:33},...transport,onFrame:(view,es)=>events[uid].push(...es)});}
 sessions.guest.update(34,emptyInput());const w=sessions.host.world,p=w.entities.find(e=>e.pid==='guest');w.round.pending=[];mob(w,p.x+160,p.y);sessions.guest.update(34,{...emptyInput(),skillEdge:true});for(let i=0;i<160;i++)sessions.host.update(34,emptyInput());const hostHits=events.host.filter(e=>e.type==='hit'&&e.ability===id),guestHits=events.guest.filter(e=>e.type==='hit'&&e.ability===id);assert.ok(hostHits.length);assert.equal(hostHits.length,guestHits.length);assert.equal(sessions.guest.world,null);assert.equal(p.mp,100-ABILITIES[id].manaCost);assert.equal(w.zones?.length||0,0);assert.equal(w.projectiles.filter(pr=>pr.ownerId===p.id).length,0);
 }
});
test('new round cancels unreleased area/spin casts and clears spin flights',()=>{
 for(const id of ['rain_arrow','spinning_shot']){const{w,p}=setup(id);cast(w);startStage(w,'S1');run(w,70);assert.equal(w.zones?.length||0,0);assert.equal(w.projectiles.filter(pr=>pr.abilityId===id).length,0);assert.notEqual(p.act?.id,id);}
});
