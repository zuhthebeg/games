import {Sim} from '../sim.js?v=20261113r6';
import {MAX_CARTS} from '../data.js?v=20261113r6';
import {envelope,validEnvelope,decodeHunter} from './protocol.js';
import {HostReplication,GuestReplication} from './replication.js';
import {HitClaims} from './claims.js';
// Renderer-free world authority. Even the host's own hunter is an owner peer.
export class HostSession {
  constructor({quest,roster,seed=1,hunt,host,transport}) {
    Object.assign(this,{hunt,host,transport,roster});
    const ids=Object.keys(roster);
    if(ids.length<2 || ids.length>4)throw new Error('Coop requires 2..4 hunters');
    const s=this.sim=new Sim(quest,roster[ids[0]].save,seed,{role:'world',partySize:ids.length});
    s.players[0].id=ids[0];s.activeId=ids[0];
    for(const id of ids.slice(1))s.addPlayer(id,roster[id].save);
    s.players.forEach((p,i)=>{p.x=(i-(ids.length-1)/2)*2;});
    this.rep=new HostReplication({hunt,transport});
    this.incoming=new GuestReplication({hunt,host,localId:'__world__'});
    this.claims=new HitClaims();this.claims.record(s);
    this.hardEpoch=new Map();this.resumes=new Map();this.suspended=new Set();this.controlSeq=new Map();
    this.owners=new Map();this.cartSeq=new Map();this.eventSeq=0;this.ended=false;
  }
  event(type,payload) {this.transport.sendEvent(envelope(type,this.hunt,this.eventSeq++,payload));}
  initial() {this.event('full',{hostTick:this.sim.tick,snapshot:this.sim.snapshot(),cartSeq:Object.fromEntries(this.cartSeq)});}
  receive(from,p,nowMs=0) {
    if(!Object.hasOwn(this.roster,from) || !validEnvelope(p,this.hunt))return false;
    const s=this.sim;
    if(p.type==='hardResync') {
      const {nonce,epoch}=p.payload;
      if(typeof nonce!=='string'||nonce.length>160||!Number.isSafeInteger(epoch)||epoch<1||
        epoch<=(this.hardEpoch.get(from)??0)||p.seq<=(this.controlSeq.get(from)??-1))return false;
      this.hardEpoch.set(from,epoch);this.controlSeq.set(from,p.seq);
      this.suspended.add(from);this.resumes.delete(from);this.owners.delete(from);
      this.event('full',{hard:true,to:from,nonce,epoch,hostTick:s.tick,eventFloor:this.eventSeq,
        snapshot:s.snapshot(),cartSeq:Object.fromEntries(this.cartSeq)});return true;
    }
    if(['suspend','resumeRequest','resumed'].includes(p.type)) {
      if(p.seq<=(this.controlSeq.get(from)??-1))return false;
      this.controlSeq.set(from,p.seq);
      if(p.type==='resumed'){this.suspended.delete(from);this.resumes.delete(from);return true;}
      this.suspended.add(from);
      if(p.type==='resumeRequest' && typeof p.payload.nonce==='string')this.resumes.set(from,p.payload.nonce);
      this.resumeAnchors();return true;
    }
    if(p.type==='hunter') {
      if(!this.incoming.receive(from,p,nowMs))return false;
      const v=decodeHunter(p),prev=this.owners.get(from),player=s.players.find(p=>p.id===from);
      if(!['idle','atk','charge','roll','drink','hit','down','stun','dead'].includes(v.state))return false;
      const ticks=prev ? v.tick-prev.value.tick : 0;
      let vx=ticks>0 ? (v.x-prev.value.x)/ticks : 0,vz=ticks>0 ? (v.z-prev.value.z)/ticks : 0;
      if(Math.hypot(vx,vz)>.3 || (prev?.value.state==='dead' && v.state!=='dead'))vx=vz=0;
      this.owners.set(from,{value:v,received:s.tick,vx,vz});
      Object.assign(player,{x:v.x,z:v.z,yaw:v.yaw,hp:Math.max(0,Math.min(player.maxHp,v.hp)),state:v.state});
      return true;
    }
    if(p.type==='hit') {
      if(this.suspended.has(from))return false;
      const player=s.players.find(p=>p.id===from),hit=this.claims.validate(from,p.payload,player,s);
      if(!hit.ok)return false;
      s.activeId=from;s.hitMonster(hit.part,hit.raw,hit.x,hit.z,hit.mv);
      s.stop=s.slow=0;this.flush();return true;
    }
    if(p.type==='cart') {
      const seq=p.payload.cart;
      if(!Number.isSafeInteger(seq) || seq<1 || seq!==(this.cartSeq.get(from)??0)+1 || s.over)return false;
      this.cartSeq.set(from,seq);s.carts++;
      this.event('carts',{carts:s.carts});
      if(s.carts>=MAX_CARTS)s.finish(false,2.2);
      this.flush();return true;
    }
    if(p.type==='resync') {this.initial();return true;}
    return false;
  }
  tick() {
    const s=this.sim;
    for(const [id,o] of this.owners) {
      const p=s.players.find(p=>p.id===id),age=Math.min(9,Math.max(0,s.tick-o.received));
      p.x=o.value.x+o.vx*age;p.z=o.value.z+o.vz*age;
    }
    const before=s.m.state;
    // Suspended puppets are not world AI candidates; owner state stays untouched.
    const excluded=s.players.filter(p=>this.suspended.has(p.id)).map(p=>[p,p.state]);
    for(const [p] of excluded)p.state='dead';
    s.step();
    for(const [p,state] of excluded)p.state=state;
    this.resumeAnchors();
    if(s.m.state!==before && s.m.startTick!==s.tick)s.m.startTick=s.tick;
    this.claims.record(s);this.flush();this.rep.afterTick(s);
  }
  resumeAnchors() {
    const s=this.sim;
    if(!s.over && (['atk','roar'].includes(s.m.state)||s.projs.length))return;
    for(const [to,nonce] of this.resumes){
      this.event('resumeAnchor',{to,nonce,hostTick:s.tick,eventFloor:this.eventSeq,
        monster:structuredClone(s.m),projectiles:structuredClone(s.projs),carts:s.carts,time:s.time,
        terminal:s.over?{win:s.win,broke:{...s.m.broke},carts:s.carts,time:s.time}:null});
      this.resumes.delete(to);
    }
  }
  flush() {
    const s=this.sim;
    for(const e of s.drainEvents()) {
      if(e.type==='monsterState')this.event('monster',e);
      else if(e.type==='break')this.event('break',{part:e.part,startTick:s.tick});
    }
    if(s.over && !this.ended) {
      this.ended=true;this.event('end',{win:s.win,broke:{...s.m.broke},time:s.time,carts:s.carts,delay:s.endT,startTick:s.tick});
    }
  }
}
