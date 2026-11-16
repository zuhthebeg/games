// Ephemeral solo owner. No storage, wallet, room, analytics or real-save references.
import {Sim} from './sim.js?v=20261117mt1';
import {MONSTERS} from 'bh/data';
export class Training {
 constructor(realSave){
  this.save=JSON.parse(JSON.stringify(realSave));this.stage='move';this.elapsed=0;this.distance=0;this.dodged=false;this.light=false;this.heavy=false;this.done=false;
  this.quest={id:'practice',mon:'boar',hr:0,shards:0,gold:0};
  const sim=this.sim=new Sim(this.quest,this.save,0x33129);
  sim.def=JSON.parse(JSON.stringify(MONSTERS.boar));sim.def.brk={};sim.def.hp=360;sim.def.dmg=.35;sim.def.speed=3;
  sim.result=()=>({win:sim.win,time:sim.time,carts:sim.carts,quest:{...this.quest},loot:{},broke:{}});
  sim.m.hp=sim.m.maxHp=360;sim.m.legTh=0;sim.p.z=0;sim.m.z=8;
  const normalStep=sim.step.bind(sim),normalAttack=sim.startMonAtk.bind(sim),normalMonster=sim.updMon.bind(sim);
  sim.startMonAtk=k=>{normalAttack(k);if(sim.m.atk)sim.m.atk={...sim.m.atk,w:sim.m.atk.w*1.8,r:sim.m.atk.r*1.3};};
  sim.updMon=dt=>{if(this.done)return;if(this.stage==='fight')normalMonster(dt);else {sim.m.state='idle';sim.m.t=0;sim.m.think=1;}};
  sim.step=inputs=>{
   if(this.done)return normalStep({});
   const before={x:sim.p.x,z:sim.p.z,state:sim.p.state,t:sim.p.t};normalStep(inputs);this.elapsed+=1/60;
   const p=sim.p;
   if(this.stage==='move'){
    if(p.moving&&p.state==='idle')this.distance+=Math.hypot(p.x-before.x,p.z-before.z);
    if(p.state==='roll'&&(before.state!=='roll'||p.t<before.t))this.dodged=true;
    if(this.distance>=4&&this.dodged)this.stage='attack';
   }else if(this.stage==='attack'){
    // Evidence is the real attack's active interval, not a UI key press. Charge
    // must actually RELEASE into GS/Bow heavy; DB must reach its special hit window.
    if(p.state==='atk'&&p.cur&&p.t+1e-9>=p.cur.h0){
     if(p.combo>=0)this.light=true;
     if(p.combo<0&&(p.weapon==='db'||p.frac>=.25))this.heavy=true;
    }
    if(this.light&&this.heavy){this.stage='fight';sim.m.hp=sim.m.maxHp;sim.m.stag=0;sim.m.think=1.5;}
   }
   if(sim.carts>0||this.elapsed>=180){this.done=true;this.stage='failed';sim.finish(false,0);}
   if(sim.over){this.done=true;this.stage=sim.win?'complete':'failed';}
   return sim.events;
  };
  // Early stages cannot farm damage/loot or accidentally complete the exercise.
  const hit=sim.hitMonster.bind(sim);sim.hitMonster=(...args)=>{if(this.stage==='fight')return hit(...args);};
 }
 dispose(){this.done=true;this.sim.clearInputs();this.sim.events=[];}
}
// Active identity, never a caller-supplied result flag, chooses the settlement path.
export function deliverHuntResult(active,owner,practice,result,normal,exercise){
 if(active!==owner)return false;
 if(practice){if(practice.owner!==owner)return false;exercise(result);}
 else normal(result);
 return true;
}

// Input is page-owned; detach ephemeral gesture ownership without changing its
// shared controls or installing/removing any global event listeners.
export function clearPracticeInput(input,touchRoot){
 input.clear();input.drag=false;input.camTouch=null;if(input.joy)input.joy.id=null;
 for(const el of touchRoot?.querySelectorAll?.('.on')||[])el.classList.remove('on');
 for(const el of touchRoot?.querySelectorAll?.('#joyKnob')||[])el.style.transform='translate(0px,0px)';
}
