import { WTYPES, ATK, DMG_SCALE } from '../data.js?v=20261114fix';
const finite=n=>typeof n==='number' && Number.isFinite(n);
// The caller provides the authenticated rt sender and its roster-bound loadout.
// Validation is pure with respect to Sim: accepted claims are applied by host only.
export class HitClaims {
  constructor() { this.history=[]; this.sequences=new Map(); this.moves=new Map(); this.shots=new Map(); this.accepted=0; this.rejected=0; this.reasons={};this.schemaDetails={}; }
  record(sim) {
    this.history.push({tick:sim.tick,parts:sim.mParts().map(p=>({...p}))});
    while(this.history.length && this.history[0].tick<sim.tick-60) this.history.shift();
  }
  validate(from,c,player,sim) {
    const no=reason=>{this.rejected++;this.reasons[reason]=(this.reasons[reason]??0)+1;return {ok:false,reason};};
    if(!c || !player || player.id!==from || !Number.isSafeInteger(c.seq) || c.seq<0) return no('schema');
    const last=this.sequences.get(from)??-1;
    if(c.seq<=last) return no('duplicate');
    this.sequences.set(from,c.seq);
    if(sim.over || sim.m.state==='dead') return no('dead');
    if(!finite(c.hostTick) || c.hostTick>sim.tick || c.hostTick<sim.tick-60 ||
      !finite(c.raw) || c.raw<=0 || !finite(player.x) || !finite(player.z)) {
      const reason=!finite(c.hostTick)||!finite(c.raw)||!finite(player.x)||!finite(player.z)?'nonfinite':c.hostTick>sim.tick?'future':c.hostTick<sim.tick-60?'stale':'raw';
      this.schemaDetails[reason]=(this.schemaDetails[reason]??0)+1;return no('schema');
    }
    const W=WTYPES[player.weapon];
    const moveId=c.moveId;
    const move=moveId==='heavy' ? W?.heavy : /^light:[0-9]+$/.test(moveId) ? (W?.light[Number(moveId.slice(6))] || W?.combo?.moves[Number(moveId.slice(6))]) : null;
    if(!move || !Number.isInteger(player.tier) || !ATK[player.tier-1]) return no('move');
    const maxMv=move.mv ?? move.mv1;
    if(c.raw>ATK[player.tier-1]*maxMv*DMG_SCALE+.001) return no('raw');
    let frame=null;
    for(const h of this.history) if(h.tick<=c.hostTick) frame=h; else break;
    if(!frame) return no('history');
    const reach=move.shot ? 70*.75+.8 : move.reach;
    const part=frame.parts.find(p=>p.n===c.part && Math.hypot(player.x-p.x,player.z-p.z)<=reach+p.r+1.5);
    if(!part) return no('range');
    const actionTick=move.shot ? c.actionTick : c.hostTick;
    // Arrow travel time changes impact spacing, not firing cadence.
    if(!finite(actionTick) || actionTick>c.hostTick || c.hostTick-actionTick>60)return no('actionTick');
    const key=JSON.stringify([from,moveId]);
    const minTicks=(move.multi>1 ? (move.h1-move.h0)/(move.multi-1) : move.dur*.65)*60;
    // Compare claimed playback ticks, not arrival time: TCP bursts are not spam.
    if(actionTick-(this.moves.get(key)??-Infinity)<Math.floor(minTicks)) return no('interval');
    if(move.shot){
      // Different graded light IDs still represent one bow, not three firing
      // lanes. Compare release identities in either impact order: an older
      // long-flight shot may legitimately arrive after a newer short one.
      const shots=(this.shots.get(from)||[]).filter(t=>t>=sim.tick-120);
      const gap=Math.floor(Math.min(...W.light.map(a=>a.dur),W.heavy.dur)*.65*60);
      if(shots.some(t=>Math.abs(t-actionTick)<gap))return no('interval');
      this.shots.set(from,[...shots,actionTick].slice(-8));
    }
    this.moves.set(key,actionTick);this.accepted++;
    return {ok:true,part:c.part,raw:c.raw,x:part.x,z:part.z,mv:maxMv};
  }
}
