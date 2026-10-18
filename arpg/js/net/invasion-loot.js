import {createTracker, trackRound, currentLoad, usedConsumables, emptyLoot, selectThreat} from '../meta/run.js';
import {ITEMS} from '../meta/items.js';
// Host memory is the sole live ledger. On host loss no client may settle cached unbanked loot.
export class InvasionLoot {
  constructor(profiles, seed, runId, stageId, threat) {
    this.runId=runId;this.stageId=stageId;this.lastTick=-1;this.dropSeq=0;this.drops=[];
    this.accounts=Object.fromEntries(Object.entries(profiles).map(([pid,p],i)=>[pid,{
      save:selectThreat(p.rewardSave,stageId,threat),role:p.role,terminal:null,receipt:null,
      tracker:createTracker((seed ^ Math.imul(i+1,0x9e3779b9))>>>0),revision:0,
    }]));
  }
  state(pid) {
    const a=this.accounts[pid];
    return a && structuredClone(a.receipt || {id:`${this.runId}:${pid}`,token:a.save.activeInvasion,stageId:this.stageId,
      role:a.role,revision:a.revision,terminal:null,tempLoot:a.tracker.tempLoot,depositedXp:a.tracker.depositedXp,skillMastery:a.tracker.skillMastery||{}});
  }
  tick(world,events,participants) {
    if(world.tick<=this.lastTick)return;
    this.lastTick=world.tick;
    for(const [pid,a] of Object.entries(this.accounts)) {
      if(a.receipt)continue;
      const p=world.entities.find(e=>e.kind==='player'&&e.pid===pid);
      if(!p)continue;
      const before=new Set(a.tracker.tempLoot.items.map(i=>i.uid));
      const eligible=a.role==='hunter'&&participants.includes(pid);
      const progress=trackRound(a.save,a.tracker,eligible?events:events.filter(e=>e.type!=='kill'&&e.type!=='objectiveComplete'),usedConsumables(a.save,p),world,pid);
      a.tracker=progress.tracker;
      for(const item of a.tracker.tempLoot.items)if(!before.has(item.uid))item.uid=`loot:${this.runId}:${pid}:${item.uid}`;
      if(p.terminal==='death') {
        const loot=a.tracker.tempLoot;
        a.lostLoot=structuredClone(loot);
        a.tracker.tempLoot=emptyLoot(); // Remove from victim BEFORE publishing a claimable drop or receipt.
        if(loot.gold||loot.items.length||Object.values(loot.stacks).some(Boolean))this.drops.push({id:`${this.runId}:drop:${++this.dropSeq}`,owner:pid,team:p.team,x:p.x,y:p.y,
          loot:{gold:loot.gold,items:loot.items,stacks:loot.stacks},claimedBy:null});
      }
      a.revision++;
      if(p.terminal) {
        a.terminal=p.terminal;
        a.receipt={...this.state(pid),terminal:p.terminal,...(a.lostLoot ? {lostLoot:a.lostLoot} : {}),used:usedConsumables(a.save,p)};
      }
    }
    // Deterministic proximity pickup; guests never submit item/value/owner authority.
    for(const d of this.drops)if(!d.claimedBy)for(const p of world.entities)if(p.kind==='player'&&this.claim(world,p.pid,{id:d.id}))break;
  }
  claim(world,pid,request) {
    const a=this.accounts[pid],p=world.entities.find(e=>e.kind==='player'&&e.pid===pid),d=this.drops.find(d=>d.id===request?.id);
    if(!a||a.receipt||!p||p.dead||p.hp<=0||p.terminal||!d||d.claimedBy||d.owner===pid||p.team===d.team||(p.x-d.x)**2+(p.y-d.y)**2>48**2)return false;
    const loot=structuredClone(a.tracker.tempLoot);
    loot.gold+=d.loot.gold;loot.items.push(...d.loot.items);
    for(const[id,n]of Object.entries(d.loot.stacks))loot.stacks[id]=(loot.stacks[id]||0)+n;
    const used=usedConsumables(a.save,p),load=currentLoad(a.save,{...a.tracker,tempLoot:loot},used);
    if(load.ratio>1.2+1e-9||(a.save.stacks.return_scroll||0)-(used.scrolls||0)+(loot.stacks.return_scroll||0)>2)return false;
    // Whole piles stay on the ground if they do not fit; never truncate transferred gear.
    if(loot.items.some(i=>!ITEMS[i.id]))return false;
    d.claimedBy=pid;a.tracker.tempLoot=loot;a.revision++;
    world.events.push({type:'lootClaimed',id:d.id,pid,x:d.x,y:d.y});
    return true;
  }
  dropsView(){return this.drops.filter(d=>!d.claimedBy).map(({id,owner,x,y})=>({id,owner,x,y}));}
}
