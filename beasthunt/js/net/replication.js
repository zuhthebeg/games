import { encodeMonster, decodeMonster, decodeHunter, validEnvelope, LatestState, SNAPSHOT_TICKS } from './protocol.js';
import { PlaybackClock } from './clock.js';
import { TickBuffer, HpDisplay } from './interp.js';
// These helpers only replicate presentation state. They do NOT step Sim or
// establish combat authority. A future coop session must own that integration.
export class HostReplication {
  constructor({hunt,transport}) { Object.assign(this,{hunt,transport});this.seq=0;this.lastTick=-1; }
  afterTick(sim) {
    if(sim.tick===this.lastTick) return false;
    this.lastTick=sim.tick;
    if(sim.tick%SNAPSHOT_TICKS) return false;
    this.transport.sendState(encodeMonster(sim,this.seq++,this.hunt)); return true;
  }
}
export class GuestReplication {
  constructor({hunt,host,localId}) {
    Object.assign(this,{hunt,host,localId});this.latest=new LatestState();
    this.clock=new PlaybackClock();this.monster=new TickBuffer();this.hunters=new Map();
    this.world=null;this.lastHostMs=null;this.hp=null;this.received=0;
  }
  receive(from,p,nowMs) {
    if(!validEnvelope(p,this.hunt)) return false;
    if(p.type==='world') {
      if(from!==this.host || !validWorld(p) || !this.latest.accept(from,p)) return false;
      const world=decodeMonster(p);
      if(!this.monster.push(world.tick,world.m)) return false;
      this.world=world;this.clock.observe(world.tick,nowMs);this.lastHostMs=nowMs;
      this.hp??=new HpDisplay(world.m.hp);this.received++;return true;
    }
    if(p.type==='hunter') {
      if(!validHunter(p) || p.payload.p[0]!==from || from===this.localId || !this.latest.accept(from,p)) return false;
      const hunter=decodeHunter(p);
      if(!this.hunters.has(from)) this.hunters.set(from,new TickBuffer(9));
      return this.hunters.get(from).push(hunter.tick,hunter);
    }
    return false;
  }
  frame(dt,nowMs) {
    const tick=this.clock.advance(dt,nowMs);
    if(tick===null || !this.world) return null;
    return { tick, monster:this.monster.sample(tick),
      hunters:[...this.hunters].map(([id,b])=>({id,...b.sample(tick)})),
      hp:this.hp.update(this.world.m.hp,dt),carts:this.world.carts,
      time:this.world.time,over:this.world.over,win:this.world.win,
      disconnected:nowMs-this.lastHostMs>5000 };
  }
}
const numeric=a=>a.every(Number.isFinite);
function validWorld(p) {
  const w=p.payload,a=w.m;
  return Number.isSafeInteger(w.k) && w.k>=0 && Array.isArray(a) && a.length===17 &&
    numeric([...a.slice(0,5),a[6],a[7],...a.slice(8,15)]) && typeof a[5]==='string' &&
    Array.isArray(w.p) && w.p.length<=8 && w.p.every(p=>Array.isArray(p) && p.length===10 && numeric(p.slice(0,9)) && typeof p[9]==='string') &&
    Number.isFinite(w.c) && Number.isFinite(w.tm) && typeof w.over==='boolean' && typeof w.win==='boolean';
}
function validHunter(p) {
  const a=p.payload.p;
  return Number.isSafeInteger(p.payload.k) && p.payload.k>=0 && Array.isArray(a) && a.length===12 &&
    typeof a[0]==='string' && numeric([...a.slice(1,4),...a.slice(5,8),...a.slice(9)]) &&
    typeof a[4]==='string' && typeof a[8]==='string';
}
