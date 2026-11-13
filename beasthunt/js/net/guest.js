import {Sim,FIXED_DT} from '../sim.js?v=20261113r6';
import {envelope,encodeHunter,validEnvelope} from './protocol.js';
import {PlaybackClock} from './clock.js';
import {TickBuffer} from './interp.js';
import {GuestReplication} from './replication.js';
// All hunter input is executed here before any network response can arrive.
// Only nonce-fenced hard recovery may restore a live local hunter.
export class GuestSession {
  constructor({quest,save,seed=1,hunt,host,uid,transport}) {
    Object.assign(this,{hunt,host,uid,transport});
    this.sim=new Sim(quest,save,seed,{role:'owner',localId:uid});
    this.sim.players[0].id=uid;this.sim.activeId=uid;
    this.rep=new GuestReplication({hunt,host,localId:uid});
    // Normal live snapshots never correct owner coordinates; hard restores have their own metric.
    this.positionCorrections=0;this.restoreGeneration=0;this.seq=0;this.hostSeq=-1;this.pending=[];this.initialized=false;
    this.authorityCarts=0;this.displayHp=this.sim.m.hp;this.recovery=null;this.epoch=0;this.lastService=null;this.hidden=false;
    this.recoveryMetrics={count:0,durationMs:0,suppressedInputs:0,suppressedClaims:0,discardedEvents:0,timeouts:0,hardResyncs:0};
    this.cart=0;this.presentation=[];this.disconnected=false;this.firstHostMs=null;
  }
  state(type,payload) {this.transport.sendState(envelope(type,this.hunt,this.seq++,payload));}
  receive(from,p,nowMs) {
    if(!validEnvelope(p,this.hunt))return false;
    if(p.type==='world' || p.type==='hunter'){
      const accepted=this.rep.receive(from,p,nowMs);
      if(accepted&&p.type==='world'){
        this.authorityCarts=Math.max(this.authorityCarts,this.rep.world.carts);this.sim.carts=this.authorityCarts;
        if(this.recovery&&this.rep.world.over)this.terminal({...this.rep.world,broke:this.rep.world.m.broke});
        const candidate=this.recovery?.candidate;
        if(candidate && candidate.seq>this.hostSeq)this.anchor(candidate.payload,candidate,nowMs);
      }
      return accepted;
    }
    if(!['resumeAnchor','full','carts','monster','break','end'].includes(p.type) || from!==this.host || p.seq<=this.hostSeq)return false;
    const s=this.sim,v=p.payload;
    if(p.type==='monster' && (!Number.isFinite(v.startTick) || !v.monster ||
      !Number.isFinite(v.monster.x) || !Number.isFinite(v.monster.z) ||
      (v.monster.state==='atk' && !v.monster.atk)))return false;
    if(['break','end'].includes(p.type) && !Number.isFinite(v.startTick))return false;
    if(p.type==='carts' && (!Number.isInteger(v.carts) || v.carts<0 || v.carts>3))return false;
    if(p.type==='resumeAnchor')return this.anchor(v,p,nowMs);
    if(p.type==='full' && v.hard)return this.hardFull(v,p,nowMs);
    this.hostSeq=p.seq;
    if(p.type==='full') {
      if(!v.snapshot?.m || !Array.isArray(v.snapshot.players))return false;
      this.authorityCarts=Math.max(this.authorityCarts,v.snapshot.carts);s.carts=this.authorityCarts;
      if(this.initialized && v.snapshot.over){this.terminal({...v.snapshot,broke:v.snapshot.m.broke});return true;}
      if(!this.initialized) {
        const local=v.snapshot.players.find(p=>p.id===this.uid);
        if(!local)return false;
        // A reconnect is a fresh owner respawn, never replay a puppet's incomplete action.
        Object.assign(s.players[0],{id:local.id,x:local.x,z:local.z});
        s.m=structuredClone(v.snapshot.m);s.projs=structuredClone(v.snapshot.projs);
        this.authorityCarts=Math.max(this.authorityCarts,v.snapshot.carts);s.carts=this.authorityCarts;s.time=v.snapshot.time;this.cart=v.cartSeq?.[this.uid]??0;
        if(v.snapshot.over)this.terminal({...v.snapshot,broke:v.snapshot.m.broke});
        if(["atk","roar"].includes(s.m.state))s.receiveMonsterEvent({monster:s.m,startTick:s.m.startTick},v.hostTick);
        this.rep.clock.observe(v.hostTick,nowMs);this.firstHostMs=nowMs;this.initialized=true;
      }
      return true;
    }
    if(p.type==='carts') {this.authorityCarts=Math.max(this.authorityCarts,v.carts);s.carts=this.authorityCarts;return true;}
    if(p.type==='end' && this.recovery){this.terminal(v);return true;}
    if(this.recovery?.phase!=='buffer' && this.recovery && p.type==='monster'){this.recoveryMetrics.discardedEvents++;return true;}
    if(['monster','end','break'].includes(p.type)) {
      this.pending.push(p);return true;
    }
    return false;
  }
  terminal(e) {
    this.recovery=null;
    if(this.sim.ended)return;
    const s=this.sim;this.terminalState=e;s.time=e.time;this.authorityCarts=Math.max(this.authorityCarts,e.carts);s.carts=this.authorityCarts;s.m.broke={...e.broke};
    if(e.win){s.m.hp=0;s.m.state='dead';this.displayHp=0;s.projs.length=0;}
    s.finish(e.win,0);s.endT=0;this.pending=[];
  }
  suspend(nowMs) {
    if(this.recovery||this.sim.over||!this.initialized)return;
    const s=this.sim,m=s.m,W=m.atk?.w*(m.enr?.85:1);
    const remaining=m.state==='atk'&&m.t>=W&&m.t<W+m.atk.a?Math.ceil((W+m.atk.a-m.t)*60-1e-7):0;
    this.recovery={phase:remaining||s.projs.length?'active':'anchor',remaining,foregroundMs:0,wallAt:null,wasHidden:true,candidate:null,started:nowMs,wallGapMs:this.lastService===null?0:Math.max(0,nowMs-this.lastService),nonce:null,requested:null};
    // Cancel offensive commands at the lifecycle boundary, even if no contact
    // drain is needed. Never resume an old charge, drink trigger or attack.
    if(['atk','charge','drink'].includes(s.p.state)){s.p.state='idle';s.p.spin=0;s.p.drank=false;s.p.hits=s.p.cur?.multi||1;}
    this.recoveryMetrics.count++;this.recoveryMetrics.unservicedMs=(this.recoveryMetrics.unservicedMs??0)+this.recovery.wallGapMs;s.clearInputs();
    this.transport.sendEvent(envelope('suspend',this.hunt,this.seq++,{}));
  }
  recoveryElapsed(nowMs) {
    const r=this.recovery;
    return r ? r.foregroundMs+(r.wallAt!==null&&!r.wasHidden?Math.max(0,nowMs-r.wallAt):0) : 0;
  }
  service(nowMs,hidden=this.hidden) {
    this.hidden=hidden;
    if(this.transport.isOpen?.()===false){this.disconnected=true;if(!this.sim.over)this.sim.finish(false,0);return true;}
    const c=this.rep.clock;const debt=c.offset===null?0:nowMs*60/1000+c.offset-c.delayMs*60/1000-c.playTick;
    if(hidden || (this.lastService!==null&&nowMs-this.lastService>=250) || debt>18)this.suspend(nowMs);
    this.lastService=nowMs;
    const r=this.recovery;
    if(!r)return false;
    // One foreground wall budget spans contact, anchor, buffering and retries.
    // A hidden interval is never charged, nor does it reset spent foreground.
    r.foregroundMs=this.recoveryElapsed(nowMs);r.wallAt=nowMs;r.wasHidden=hidden;
    const terminal=this.pending.find(p=>p.type==='end');if(terminal&&!this.sim.over)this.terminal(terminal.payload);
    if(r.foregroundMs>=5000 && r.phase!=='hard' && !this.sim.over){this.recoveryMetrics.timeouts++;this.hardResync(nowMs);}
    if(this.sim.over)return true;
    if(r.phase==='hard' && !hidden && nowMs>=r.retryAt && this.transport.isOpen?.()!==false)this.requestHard(nowMs);
    if(!hidden && r.phase==='anchor' && !r.nonce){
      r.nonce=this.uid+':'+(++this.epoch)+':'+this.seq;r.requested=nowMs;
      this.transport.sendEvent(envelope('resumeRequest',this.hunt,this.seq++,{nonce:r.nonce}));
    }
    if(r.phase==='buffer' && !hidden && this.rep.world?.tick>=r.anchorTick+this.rep.clock.delayMs*60/1000){
      if(this.rep.world.tick-r.anchorTick>48){r.phase='anchor';r.nonce=null;r.candidate=null;return true;}
      this.rep.clock.playTick=r.anchorTick;
      this.recoveryMetrics.durationMs+=nowMs-r.started;this.recovery=null;
      this.transport.sendEvent(envelope('resumed',this.hunt,this.seq++,{}));
    }
    return true;
  }
  hardResync(nowMs) {
    const r=this.recovery;if(!r||r.phase==='hard')return;
    r.phase='hard';r.candidate=null;r.nonce=null;r.attempts=0;r.retryAt=nowMs;
    this.pending=[];this.sim.clearInputs();this.sim.drainEvents();this.presentation=[];
    this.recoveryMetrics.hardResyncs++;
  }
  requestHard(nowMs) {
    const r=this.recovery;r.nonce=this.uid+':'+(++this.epoch)+':'+this.seq;
    r.requested=nowMs;r.retryAt=nowMs+Math.min(2000,500*2**Math.min(r.attempts++,2));
    this.transport.sendEvent(envelope('hardResync',this.hunt,this.seq++,{nonce:r.nonce,epoch:this.epoch}));
  }
  hardFull(v,p,nowMs) {
    const r=this.recovery,s=this.sim,snap=v.snapshot;
    if(!r||r.phase!=='hard'||v.to!==this.uid||v.nonce!==r.nonce||v.epoch!==this.epoch||
      !Number.isSafeInteger(v.hostTick)||v.eventFloor!==p.seq||!snap?.m||!Array.isArray(snap.players)||
      !snap.players.some(p=>p.id===this.uid)||s.over)return false;
    // World combat state is authoritative only for this nonce-fenced escape hatch.
    // Keep owner execution role and local settlement cache, not the world's role/result lifecycle.
    const network=s.network,cachedResult=s.cachedResult,ended=s.ended;
    s.restore(snap);s.network=network;s.activeId=this.uid;s.ended=ended;s.cachedResult=cachedResult;
    // Puppets do not execute owner attacks: their cur/t are not replayable.
    // Apply the same offensive cancellation as suspend after restoring the full owner.
    if(['atk','charge','drink'].includes(s.p.state)){s.p.state='idle';s.p.t=0;s.p.spin=0;s.p.drank=false;s.p.hits=s.p.cur?.multi||1;}
    this.hostSeq=p.seq;this.cart=v.cartSeq?.[this.uid]??this.cart;
    this.authorityCarts=Math.max(this.authorityCarts,s.carts);s.carts=this.authorityCarts;
    this.pending=[];s.clearInputs();this.presentation=[];this.displayHp=s.m.hp;
    const rep=this.rep;rep.monster=new TickBuffer();rep.monster.push(v.hostTick,s.m);
    rep.clock=new PlaybackClock();rep.clock.observe(v.hostTick,nowMs);rep.clock.playTick=v.hostTick;
    this.firstHostMs=nowMs;this.recoveryMetrics.durationMs+=nowMs-r.started;this.recovery=null;
    this.restoreGeneration++;
    if(snap.over){s.over=false;this.terminal({...snap,broke:snap.m.broke});}
    this.transport.sendEvent(envelope('resumed',this.hunt,this.seq++,{}));return true;
  }
  anchor(v,p,nowMs) {
    const r=this.recovery,latest=this.rep.world?.tick??0;
    if(!r || this.recoveryElapsed(nowMs)>=5000 || r.phase!=='anchor'||v.to!==this.uid||v.nonce!==r.nonce || !Number.isSafeInteger(v.hostTick) ||
      !Number.isSafeInteger(v.eventFloor)||v.eventFloor!==p.seq ||
      !v.monster||!Number.isFinite(v.monster.x)||!Number.isFinite(v.monster.z)||!Array.isArray(v.projectiles)||
      (!v.terminal&&(['atk','roar'].includes(v.monster.state)||v.projectiles.length)))return false;
    if(p.seq<=this.hostSeq)return false;
    if(v.hostTick<latest-12){if(r.candidate?.seq===p.seq)r.candidate=null;return false;}
    if(v.hostTick>latest+12){
      // Reliable anchor may overtake volatile world. Retain one candidate only;
      // it is not applied until the unchanged freshness/sequence gates pass.
      if(!r.candidate || p.seq>r.candidate.seq)r.candidate=structuredClone(p);
      return false;
    }
    r.candidate=null;this.hostSeq=p.seq;
    if(v.terminal){this.terminal(v.terminal);return true;}
    if(this.sim.over)return false;
    this.recoveryMetrics.discardedEvents+=this.pending.filter(p=>p.type==='monster').length;
    this.pending=this.pending.filter(p=>p.type!=='monster' && p.payload.startTick>v.hostTick);
    this.sim.m=structuredClone(v.monster);this.sim.projs=structuredClone(v.projectiles);this.sim.arrows=[];
    this.authorityCarts=Math.max(this.authorityCarts,v.carts);this.sim.carts=this.authorityCarts;this.sim.time=v.time;
    const rep=this.rep;rep.monster=new TickBuffer();rep.monster.push(v.hostTick,v.monster);
    rep.clock=new PlaybackClock();rep.clock.observe(v.hostTick,nowMs);rep.clock.playTick=v.hostTick;
    r.anchorTick=v.hostTick;r.phase='buffer';return true;
  }
  tick(input,nowMs) {
    if(!this.initialized || this.sim.ended)return [];
    this.service(nowMs);
    const s=this.sim;
    if(this.recovery && !s.over){
      const r=this.recovery;
      this.recoveryMetrics.suppressedInputs+=Object.entries(input).filter(([k,v])=>['light','heavy','dodge','potion','heavyHeld','moveX','moveZ'].includes(k)&&v).length;
      s.clearInputs();
      if(r.phase==='active'&&!this.hidden){
        // Same local neutral owner updater before contact, with explicit command
        // gates. Network snapshots still never restore owner combat state.
        s.updPlayer(FIXED_DT,{recovery:true});
        const arrows=s.arrows;s.arrows=[];
        if(r.remaining>0){s.updMon(FIXED_DT);r.remaining--;}
        // Existing local contact entities outlive monster active independently.
        s.updProjs(FIXED_DT);s.arrows=arrows;
        for(const e of s.drainEvents())if(e.type==='cart'){this.authorityCarts=Math.max(this.authorityCarts,s.carts);this.cart++;this.transport.sendEvent(envelope('cart',this.hunt,this.seq++,{cart:this.cart}));}else if(e.type==='hitClaim')this.recoveryMetrics.suppressedClaims++;else this.presentation.push(e);
        if(r.remaining<=0&&!s.projs.length)r.phase='anchor';
      }
      return this.drainEvents();
    }
    if(s.over && this.recovery){s.step({});return [...this.drainEvents(),...s.drainEvents()];}
    const frame=this.rep.frame(FIXED_DT,nowMs);
    const viewTick=frame?.tick??this.rep.clock.playTick??s.tick;
    s.network.viewTick=viewTick;
    // The action path is ordered; only process events once their host tick is
    // visible. A delayed packet is compressed by receiveMonsterEvent, not sought.
    while(this.pending.length && this.pending[0].payload.startTick<=viewTick) {
      const packet=this.pending.shift(),e=packet.payload;
      if(packet.type==='monster')s.receiveMonsterEvent(e,viewTick);
      else if(packet.type==='break')this.presentation.push({type:'break',part:e.part});
      else if(packet.type==='end' && !s.over) {
        s.time=e.time;this.authorityCarts=Math.max(this.authorityCarts,e.carts);s.carts=this.authorityCarts;s.m.broke={...e.broke};
        if(e.win){s.m.hp=0;s.m.state='dead';s.projs.length=0;}
        s.finish(e.win,e.delay);
      }
    }
    if(frame) {
      const m=frame.monster;
      if(!['atk','roar'].includes(s.m.state) && !['atk','roar'].includes(m.state)) {
        for(const k of ['x','y','z','yaw','spin','state','t'])s.m[k]=m[k];
      }
      s.m.hp=s.over&&s.win?0:this.rep.world.m.hp;s.m.maxHp=this.rep.world.m.maxHp;
      this.displayHp=s.over&&s.win?0:frame.hp;
      this.authorityCarts=Math.max(this.authorityCarts,frame.carts);s.carts=this.authorityCarts;if(!s.over)s.time=frame.time;
      if(frame.disconnected && !s.over){this.suspend(nowMs);this.hardResync(nowMs);return this.drainEvents();}
    }
    if(!frame && this.firstHostMs!==null && nowMs-this.firstHostMs>5000 && !s.over) {
      this.suspend(nowMs);this.hardResync(nowMs);return this.drainEvents();
    }
    // Absorb clock slew only while winding up. Active contact/motion remains 60Hz.
    if(s.m.state==='atk' && s.m.atk){const W=s.m.atk.w*(s.m.enr?.85:1);if(s.m.t<W-1/60){const target=(viewTick-s.m.startTick)/60;s.m.t+=Math.max(-1/1200,Math.min(1/1200,target-s.m.t));}}
    const prev={state:s.p.state,t:s.p.t};
    s.step({[this.uid]:input});
    for(const e of s.drainEvents()) {
      if(e.type==='hitClaim')this.state('hit',{...e,seq:this.seq});
      else if(e.type==='cart') {
        this.authorityCarts=Math.max(this.authorityCarts,s.carts);this.cart++;this.transport.sendEvent(envelope('cart',this.hunt,this.seq++,{cart:this.cart}));
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
