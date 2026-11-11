// Deterministic virtual TCP: no packet loss, seeded jitter, head-of-line stalls.
// All time is caller-owned milliseconds so tests never wait on wall clocks.
export class LoopbackNetwork {
  constructor({seed=1,delayMs=30,jitterMs=5,burstChance=0,burstMs=180}={}) {
    Object.assign(this,{rng:seed>>>0,delayMs,jitterMs,burstChance,burstMs});
    this.now=0; this.serial=0; this.pending=[]; this.links=new Map(); this.peers=new Map();
    this.bytes=0; this.delivered=0;
  }
  random() { this.rng=(Math.imul(this.rng,1664525)+1013904223)>>>0; return this.rng/4294967296; }
  connect(id,receive) {
    if(this.peers.has(id)) throw new Error('Duplicate peer');
    this.peers.set(id,receive);
    return { sendState:p=>this.send(id,'state',p), sendEvent:p=>this.send(id,'event',p),
      close:()=>this.peers.delete(id) };
  }
  send(from,channel,packet) {
    for(const to of this.peers.keys()) if(to!==from) {
      const key=JSON.stringify([from,to]);
      const lag=Math.max(0,this.delayMs+(this.random()*2-1)*this.jitterMs)+
        (this.random()<this.burstChance ? this.burstMs : 0);
      const at=Math.max(this.now+lag,this.links.get(key)??0);
      this.links.set(key,at);
      const wire=JSON.stringify(packet); this.bytes+=new TextEncoder().encode(wire).length;
      this.pending.push({at,serial:this.serial++,from,to,channel,packet:JSON.parse(wire)});
    }
  }
  advance(now) {
    if(now<this.now) throw new Error('Time moved backwards');
    this.now=now;
    this.pending.sort((a,b)=>a.at-b.at || a.serial-b.serial);
    const count=this.pending.findIndex(p=>p.at>now);
    const due=this.pending.splice(0,count<0?this.pending.length:count);
    for(const p of due) {
      this.peers.get(p.to)?.(p.from,p.packet,p.channel,p.at);
      this.delivered++;
    }
  }
}
// Shared lobby owns socket lifecycle. Install after lobby._ws exists, using the
// same onStarted wrapper pattern as spudsquad (not onGameStart for relay games).
// Claims/owner state MUST use sendState: only rt supplies an authenticated from.
// Reliable action payload identity is nominal, not a security boundary in DO.
export function attachRelay(ws,{uid,onPacket,onStarted=()=>{},onRoster=()=>{}}) {
  const old={rt:ws.onRt,event:ws.onEvent,started:ws.onStarted,roster:ws.onRoster};
  const rt=(from,p)=>{old.rt?.(from,p); if(p?.bh) onPacket(from,p.bh,'state');};
  const event=e=>{
    old.event?.(e);
    const a=e?.data;
    if(a?.type==='BH_EVENT' && a.from!==uid) onPacket(a.from,a.payload,'event');
  };
  const started=d=>{old.started?.(d); onStarted(d);};
  const roster=d=>{old.roster?.(d); onRoster(d);};
  Object.assign(ws,{onRt:rt,onEvent:event,onStarted:started,onRoster:roster});
  return {
    sendState:p=>ws.sendRt({bh:p}),
    sendEvent:(p,{snapshot,final=false}={})=>ws.sendAction({type:'BH_EVENT',from:uid,payload:p,
      ...(snapshot ? {__snapshot:snapshot}:{}),...(final?{__final:true}:{})}),
    close() {
      for(const [key,current,prior] of [['onRt',rt,old.rt],['onEvent',event,old.event],
        ['onStarted',started,old.started],['onRoster',roster,old.roster]])
        if(ws[key]===current) ws[key]=prior;
    }
  };
}
