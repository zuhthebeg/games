import {Sim,FIXED_DT} from '../sim.js';
import {envelope,encodeHunter,validEnvelope} from './protocol.js';
import {GuestReplication} from './replication.js';
// All hunter input is executed here before any network response can arrive.
// Never restore world snapshots over a live local hunter.
export class GuestSession {
  constructor({quest,save,seed=1,hunt,host,uid,transport}) {
    Object.assign(this,{hunt,host,uid,transport});
    this.sim=new Sim(quest,save,seed,{role:'owner',localId:uid});
    this.sim.players[0].id=uid;this.sim.activeId=uid;
    this.rep=new GuestReplication({hunt,host,localId:uid});
    this.seq=0;this.hostSeq=-1;this.pending=[];this.initialized=false;
    this.cart=0;this.presentation=[];this.disconnected=false;this.firstHostMs=null;
  }
  state(type,payload) {this.transport.sendState(envelope(type,this.hunt,this.seq++,payload));}
  receive(from,p,nowMs) {
    if(!validEnvelope(p,this.hunt))return false;
    if(p.type==='world' || p.type==='hunter')return this.rep.receive(from,p,nowMs);
    if(!['full','carts','monster','break','end'].includes(p.type) || from!==this.host || p.seq<=this.hostSeq)return false;
    const s=this.sim,v=p.payload;
    if(p.type==='monster' && (!Number.isFinite(v.startTick) || !v.monster ||
      !Number.isFinite(v.monster.x) || !Number.isFinite(v.monster.z) ||
      (v.monster.state==='atk' && !v.monster.atk)))return false;
    if(['break','end'].includes(p.type) && !Number.isFinite(v.startTick))return false;
    if(p.type==='carts' && (!Number.isInteger(v.carts) || v.carts<0 || v.carts>3))return false;
    this.hostSeq=p.seq;
    if(p.type==='full') {
      if(!v.snapshot?.m || !Array.isArray(v.snapshot.players))return false;
      if(!this.initialized) {
        const local=v.snapshot.players.find(p=>p.id===this.uid);
        if(!local)return false;
        Object.assign(s.players[0],structuredClone(local));
        s.m=structuredClone(v.snapshot.m);s.projs=structuredClone(v.snapshot.projs);
        s.carts=v.snapshot.carts;s.time=v.snapshot.time;
        this.rep.clock.observe(v.hostTick,nowMs);this.firstHostMs=nowMs;this.initialized=true;
      }
      return true;
    }
    if(p.type==='carts') {s.carts=v.carts;return true;}
    if(['monster','end','break'].includes(p.type)) {
      this.pending.push(p);return true;
    }
    return false;
  }
  tick(input,nowMs) {
    if(!this.initialized)return [];
    const s=this.sim,frame=this.rep.frame(FIXED_DT,nowMs);
    const viewTick=frame?.tick??this.rep.clock.playTick??s.tick;
    s.network.viewTick=viewTick;
    // The action path is ordered; only process events once their host tick is
    // visible. A delayed packet is compressed by receiveMonsterEvent, not sought.
    while(this.pending.length && this.pending[0].payload.startTick<=viewTick) {
      const packet=this.pending.shift(),e=packet.payload;
      if(packet.type==='monster')s.receiveMonsterEvent(e,viewTick);
      else if(packet.type==='break')this.presentation.push({type:'break',part:e.part});
      else if(packet.type==='end' && !s.over) {
        s.time=e.time;s.carts=e.carts;s.m.broke={...e.broke};
        if(e.win){s.m.hp=0;s.m.state='dead';s.projs.length=0;}
        s.finish(e.win,e.delay);
      }
    }
    if(frame) {
      const m=frame.monster;
      if(!['atk','roar'].includes(s.m.state) && !['atk','roar'].includes(m.state)) {
        for(const k of ['x','y','z','yaw','spin','state','t'])s.m[k]=m[k];
      }
      s.m.hp=this.rep.world.m.hp;s.m.maxHp=this.rep.world.m.maxHp;
      s.carts=frame.carts;if(!s.over)s.time=frame.time;
      this.disconnected=frame.disconnected;
      if(this.disconnected && !s.over) s.finish(false,0);
    }
    if(!frame && this.firstHostMs!==null && nowMs-this.firstHostMs>5000 && !s.over) {
      this.disconnected=true;s.finish(false,0);
    }
    const prev={state:s.p.state,t:s.p.t};
    s.step({[this.uid]:input});
    for(const e of s.drainEvents()) {
      if(e.type==='hitClaim')this.state('hit',{...e,seq:this.seq});
      else if(e.type==='cart') {
        this.cart++;this.transport.sendEvent(envelope('cart',this.hunt,this.seq++,{cart:this.cart}));
      } else this.presentation.push(e);
    }
    if(s.p.state!==prev.state || s.p.t<prev.t) {
      this.transport.sendEvent(envelope('hunterAction',this.hunt,this.seq++,{
        startTick:Math.round(viewTick),id:this.uid,state:s.p.state,yaw:s.p.yaw,moveId:s.p.combo<0?'heavy':'light:'+s.p.combo}));
    }
    if(s.tick%4===0) this.transport.sendState(encodeHunter(s.p,Math.round(viewTick),this.seq++,this.hunt));
    return this.drainEvents();
  }
  drainEvents() {const events=this.presentation;this.presentation=[];return events;}
}
