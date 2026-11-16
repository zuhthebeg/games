import { WTYPES, ATK, DMG_SCALE } from '../data.js?v=20261117mt1';
const finite=n=>typeof n==='number' && Number.isFinite(n);
const normal=(W,node)=>W?.light[node]||W?.combo?.moves[node];
const lane=(from,weapon)=>JSON.stringify([from,weapon]);
const interrupts=new Set(['roll','charge','guard','drink','hit','down','stun','dead']);
// 9 ticks normal grace + 6 ticks (100ms) view-tick/TCP-burst slack.
// These are playback bounds, never an arrival-time cooldown.
const CHAIN_GRACE=9, CHAIN_SLACK=6;
const spacing=a=>Math.floor((a.multi>1?(a.h1-a.h0)/(a.multi-1):a.dur*.65)*60);
export class HitClaims {
  constructor(hunt=null) {
    this.hunt=hunt;this.history=[];this.sequences=new Map();this.moves=new Map();this.shots=new Map();
    this.chains=new Map();this.pending=new Map();this.observed=new Map();this.floors=new Map();
    this.actions=new Map();this.actionChains=new Map();this.actionSeq=new Map();
    this.accepted=0;this.rejected=0;this.reasons={};this.schemaDetails={};
  }
  reset(from,tick) {
    for(const weapon of Object.keys(WTYPES)){const key=lane(from,weapon);this.chains.delete(key);this.pending.delete(key);this.actionChains.delete(key);}
    this.floors.set(from,Math.max(tick,this.floors.get(from)??-Infinity));
    // Cadence identities survive interruption: rolling is not a rate-limit bypass.
  }
  observe(player,sim) {
    const prev=this.observed.get(player.id);
    if(prev && (prev.weapon!==player.weapon || prev.state!==player.state && interrupts.has(player.state)))this.reset(player.id,sim.tick);
    this.observed.set(player.id,{weapon:player.weapon,state:player.state});
  }
  observeAction(from,event,seq,player,sim) {
    if(!event||event.id!==from||!Number.isSafeInteger(seq)||seq<0||seq<=(this.actionSeq.get(from)??-1)||
      !finite(event.startTick)||event.startTick>sim.tick||event.startTick<sim.tick-60)return false;
    this.actionSeq.set(from,seq);
    if(interrupts.has(event.state)){this.reset(from,event.startTick);return true;}
    if(event.state!=='atk')return event.state==='idle';
    const W=WTYPES[player.weapon],id=event.moveId;
    const node=typeof id==='string'&&/^light:[0-9]+$/.test(id)?Number(id.slice(6)):-1;
    const move=id==='heavy'?W?.heavy:node>=0?normal(W,node):null;
    if(!move)return false;
    const key=lane(from,player.weapon),tick=event.startTick;
    const actions=(this.actions.get(key)||[]).filter(a=>a.tick>=sim.tick-180);
    if(actions.some(a=>tick-a.tick<Math.floor(a.move.dur*.65*60)))return false;
    const prev=this.actionChains.get(key),delta=prev?tick-prev.tick:Infinity;
    if(node>0 && !(player.weapon==='gs'&&node===3)){
      const next=prev&&(W.combo?W.combo.next[prev.node]:[(prev.node+1)%W.light.length]);
      if(!prev||!next.includes(node)||delta<Math.floor(prev.move.dur*.65*60)||
        delta>Math.ceil(prev.move.dur*60)+CHAIN_GRACE+CHAIN_SLACK)return false;
    }
    if(tick<(this.floors.get(from)??-Infinity))return false;
    if(id==='heavy')this.reset(from,tick);
    else this.actionChains.set(key,{tick,node,move});
    // Already validated launches survive a later interruption, unlike authority
    // to START the next stage. In-flight arrows are not cancelled by rolling.
    actions.push({tick,node,move});this.actions.set(key,actions.slice(-16));return true;
  }
  record(sim) {
    for(const p of sim.players)this.observe(p,sim);
    this.history.push({tick:sim.tick,parts:sim.mParts().map(p=>({...p}))});
    while(this.history.length && this.history[0].tick<sim.tick-60)this.history.shift();
    for(const [key,list] of this.pending){const live=list.filter(c=>c.hostTick>=sim.tick-60);if(live.length)this.pending.set(key,live);else this.pending.delete(key);}
  }
  validate(from,c,player,sim) {
    const no=reason=>{this.rejected++;this.reasons[reason]=(this.reasons[reason]??0)+1;return {ok:false,reason};};
    if(!c || !player || player.id!==from || !Number.isSafeInteger(c.seq) || c.seq<0)return no('schema');
    if(c.seq<=(this.sequences.get(from)??-1))return no('duplicate');
    this.sequences.set(from,c.seq);this.observe(player,sim);
    const hit=this.check(from,c,player,sim);
    const key=lane(from,player.weapon);
    if(!hit.ok){
      // A newer short-flight arrow can hit before its predecessor. Retain at
      // most eight inert claims for one history window, never apply HP until
      // an accepted predecessor proves the chain. Sequence admission is ONCE.
      if(hit.reason==='chain' && player.weapon==='bow' && !interrupts.has(player.state) && c.actionTick>=(this.floors.get(from)??-Infinity)){
        const list=(this.pending.get(key)||[]).filter(p=>p.hostTick>=sim.tick-60);
        if(list.length<8)this.pending.set(key,[...list,{...c}]);
      }
      return no(hit.reason);
    }
    const ready=[];
    // Accepted predecessors, not retries from the wire, unlock inert arrows.
    let progress=true;
    while(progress){
      progress=false;
      const list=(this.pending.get(key)||[]).sort((a,b)=>a.actionTick-b.actionTick);
      this.pending.delete(key);
      for(const pending of list){
        const next=this.check(from,pending,player,sim);
        if(next.ok){ready.push(next);progress=true;}
        else if(next.reason==='chain' && pending.hostTick>=sim.tick-60)this.pending.set(key,[...(this.pending.get(key)||[]),pending]);
      }
    }
    return {...hit,ready};
  }
  check(from,c,player,sim) {
    const no=reason=>({ok:false,reason});
    if(sim.over || sim.m.state==='dead')return no('dead');
    if(!finite(c.hostTick) || c.hostTick>sim.tick || c.hostTick<sim.tick-60 ||
      !finite(c.raw) || c.raw<=0 || !finite(player.x) || !finite(player.z)) {
      const reason=!finite(c.hostTick)||!finite(c.raw)||!finite(player.x)||!finite(player.z)?'nonfinite':c.hostTick>sim.tick?'future':c.hostTick<sim.tick-60?'stale':'raw';
      this.schemaDetails[reason]=(this.schemaDetails[reason]??0)+1;return no('schema');
    }
    const W=WTYPES[player.weapon],moveId=c.moveId;
    const node=typeof moveId==='string' && /^light:[0-9]+$/.test(moveId)?Number(moveId.slice(6)):-1;
    const move=moveId==='heavy'?W?.heavy:node>=0?normal(W,node):null;
    if(!move || !Number.isInteger(player.tier) || !ATK[player.tier-1])return no('move');
    const maxMv=move.mv??move.mv1;
    if(c.raw>ATK[player.tier-1]*maxMv*DMG_SCALE+.001)return no('raw');
    let frame=null;for(const h of this.history)if(h.tick<=c.hostTick)frame=h;else break;
    if(!frame)return no('history');
    const reach=move.shot?70*.75+.8:move.reach;
    const part=frame.parts.find(p=>p.n===c.part && Math.hypot(player.x-p.x,player.z-p.z)<=reach+p.r+1.5);
    if(!part)return no('range');
    // Melee wire claims carry contact ticks; bow carries attack-start identity.
    const actionTick=move.shot?c.actionTick:c.hostTick;
    if(!finite(actionTick)||actionTick>c.hostTick||c.hostTick-actionTick>60)return no('actionTick');
    const key=lane(from,player.weapon);
    const entries=(this.moves.get(key)||[]).filter(e=>e.tick>=sim.tick-180);
    if(move.shot){
      const shots=(this.shots.get(key)||[]).filter(t=>t>=sim.tick-180);
      const gap=Math.floor(Math.min(...W.light.map(a=>a.dur),W.heavy.dur)*.65*60);
      if(shots.some(t=>Math.abs(t-actionTick)<gap))return no('interval');
    }
    // One sender+weapon lane, including heavy and all graded normal IDs.
    // Preserve the longer heavy gap as well as bow's release dedup floor.
    if(entries.some(e=>actionTick>=e.tick?actionTick-e.tick<spacing(e.move):e.tick-actionTick<spacing(move)))return no('interval');
    const chain=(this.chains.get(key)||[]).filter(e=>e.tick>=sim.tick-180);
    const prev=chain.filter(e=>e.tick<actionTick).at(-1);
    // GS B's initial other-arm strike (3) is legal without a prior A strike.
    const gated=node>0 && !(player.weapon==='gs'&&node===3);
    // Existing reliable hunterAction messages also prove chains whose previous
    // attack missed. Never trust an action's stage without validating its own
    // predecessor and weapon-wide start cadence above.
    const action=(this.actions.get(key)||[]).find(a=>a.node===node && (move.shot?
      Math.abs(a.tick-actionTick)<=1:
      actionTick-a.tick>=Math.floor(move.h0*60)-2 && actionTick-a.tick<=Math.ceil(move.h1*60)+CHAIN_SLACK));
    if(action && (action.hits??0)>=(move.multi||1))return no('interval');
    if(gated&&!action){
      const next=prev && (W.combo?W.combo.next[prev.node]:[(prev.node+1)%W.light.length]);
      const delta=prev?actionTick-prev.tick:Infinity;
      if(interrupts.has(player.state)||actionTick<(this.floors.get(from)??-Infinity)||!prev||!next.includes(node)||
        delta<Math.floor(prev.move.dur*.65*60)||delta>Math.ceil(prev.move.dur*60)+CHAIN_GRACE+CHAIN_SLACK)return no('chain');
    }
    if(action)action.hits=(action.hits??0)+1;
    if(moveId==='heavy')this.reset(from,actionTick);
    else if(!interrupts.has(player.state)&&actionTick>=(this.floors.get(from)??-Infinity)){
      chain.push({node,tick:actionTick,move});chain.sort((a,b)=>a.tick-b.tick);this.chains.set(key,chain.slice(-16));
    }
    entries.push({tick:actionTick,moveId,move});this.moves.set(key,entries.slice(-32));
    if(move.shot)this.shots.set(key,[...(this.shots.get(key)||[]).filter(t=>t>=sim.tick-180),actionTick].slice(-16));
    this.accepted++;return {ok:true,part:c.part,raw:c.raw,x:part.x,z:part.z,mv:maxMv};
  }
}
