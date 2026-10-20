import test from 'node:test';import assert from 'node:assert/strict';
import {SnapshotBuffer,encodeSnapshot,InputSender,InputQueue} from '../js/net/protocol.js';
import {createWorld,addPlayer,startStage,spawnMonster,step,emptyInput} from '../js/sim/world.js';
import {pair} from './fixtures/invasion-party.js';
const T=1000/30;
test('position timestamp names the fractional interpolated monster pose, not the current telegraph viewTick',()=>{
 const w=createWorld();addPlayer(w,{pid:'guest'});startStage(w,'S2');const b=new SnapshotBuffer('guest',100,{adaptive:false});
 for(let t=0;t<=10;t+=2){w.tick=t;w.entities[0].x=t*10;b.push(encodeSnapshot(w),t*T);}
 const v=b.sample(8.5*T+100,100);assert.equal(v.positionTick,8.5);assert.notEqual(v.positionTick,v.viewTick);
 const sender=new InputSender(),q=new InputQueue();const p=sender.packet({...emptyInput(),poseTick:v.positionTick,skillEdge:true,skillPoseTicks:{skillEdge:7.25}});q.receive(p,0);
 const decoded=q.consume(34);assert.equal(decoded.poseTick,8.5);assert.equal(decoded.skillPoseTicks.skillEdge,7.25);
});
test('host compensates a guest melee against a real bounded historical monster pose, leaving current pose unchanged',()=>{
 const {s}=pair({invasion:false,guestRole:'hunter',guestLineage:'human'}),w=s.host.world,p=w.entities.find(e=>e.pid==='guest');
 const m=spawnMonster(w,'goblin_grunt',p.x+85,p.y);m.spawnLeft=0;m.staggerLeft=1000;m.hp=m.maxHp=10000;w.entities=[p,m];w.round.pending=[];w.round.goal='timer';w.round.timerTicks=100000;
 for(let i=0;i<8;i++)step(w);
 let hits=0;
 for(let i=0;i<8;i++){m.x=p.x+85+i*10;hits+=step(w,{guest:{...emptyInput(),attack:i===0,aimX:1,poseTick:w.tick-5}}).filter(e=>e.type==='hit').length;}
 assert.ok(hits>0,'moving-out target that was inside the visible cone must receive a host-authoritative hit');assert.ok(m.x>=p.x+150,'rewind never writes target positions');
});
test('missing/future/extremely stale pose timestamps cannot invent a rewind hit',()=>{
 for(const poseTick of [undefined,NaN,Infinity,-1,100000,0]){
  const {s}=pair({invasion:false,guestRole:'hunter',guestLineage:'human'}),w=s.host.world,p=w.entities.find(e=>e.pid==='guest');const m=spawnMonster(w,'goblin_grunt',p.x+400,p.y);m.spawnLeft=0;m.staggerLeft=1000;w.entities=[p,m];w.round.pending=[];w.round.goal='timer';w.round.timerTicks=100000;
  for(let i=0;i<30;i++)step(w);
  const hp=m.hp;for(let i=0;i<10;i++)step(w,{guest:{...emptyInput(),attack:i===0,aimX:1,poseTick}});assert.equal(m.hp,hp);
 }
});

test('200ms cap cannot reach an older in-range pose; attacker origin, live target eligibility and arena bounds remain authoritative',async()=>{
 const {enableGuestAttackLag,recordAttackPoses,bindAttackPose,attackShapeHits,ATTACK_REWIND_TICKS}=await import('../js/sim/attack-lag.js');assert.equal(ATTACK_REWIND_TICKS,6);
 const w=createWorld(),p=addPlayer(w,{pid:'g',x:100,y:100}),m=spawnMonster(w,'goblin_grunt',130,100);m.spawnLeft=0;w.entities=[p,m];enableGuestAttackLag(w,'g');
 const shape={type:'circle',radius:20},act={def:{delivery:'shape'},facing:0};
 for(let t=0;t<=20;t++){w.tick=t;m.x=t<=13?130:170;recordAttackPoses(w);}
 bindAttackPose(w,p,act,{poseTick:12});assert.equal(attackShapeHits(w,p,act,shape,100,100,m),false,'cannot extend past 6 ticks to tick 12');
 // Fresh history at 20 is valid, but never expands radius or rewinds the attacker.
 m.x=130;w.tick=21;recordAttackPoses(w);m.x=170;w.tick=22;recordAttackPoses(w);bindAttackPose(w,p,act,{poseTick:21});
 assert.equal(attackShapeHits(w,p,act,shape,100,100,m),true);assert.equal(m.x,170);
 assert.equal(attackShapeHits(w,p,act,shape,300,100,m),false,'no rewind of attacker origin');
 m.x=400;assert.equal(attackShapeHits(w,p,act,shape,100,100,m),false,'teleport is not motion');m.x=170;
 m.dead=true;assert.equal(attackShapeHits(w,p,act,shape,100,100,m),false);m.dead=false;
 m.kind='player';assert.equal(attackShapeHits(w,p,act,shape,100,100,m),false,'no PvP rewind');m.kind='monster';
 assert.equal(attackShapeHits(w,p,act,shape,-1,100,m),false,'no attack through arena boundary');
 const projectile={def:{delivery:'projectile'},facing:0};bindAttackPose(w,p,projectile,{poseTick:21});assert.equal(attackShapeHits(w,p,projectile,shape,100,100,m),false);
});
