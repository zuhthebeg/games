// Presentation-only: never writes player/simulation/wire state.
export function gsSoundName(name,p) {
  if(p?.weapon!=='gs')return name;
  if(name==='swing'||name==='swingH')return p.combo===4||p.cur?.sw==='spin'?'gs_swing_spin':p.combo===3||p.cur?.sw==='other'?'gs_swing_b':p.combo===-1||p.cur?.charge>0?'gs_charge_release':'gs_swing_light';
  return ({hit:'gs_hit',hitBig:'gs_hit',weak:'gs_hit_weak',break:'gs_hit_part',roll:'gs_roll',charge:'gs_charge_'+Math.max(1,Math.min(3,Math.floor(p.clv||1)))})[name]||name;
}
export function soundVolume(p,listener){const d=Math.hypot((p?.x||0)-(listener?.x||0),(p?.z||0)-(listener?.z||0));return d>=32?0:1/(1+(d/10)**2);}
export class GSSoundView {
  constructor(play,stop){this.play=play;this.stop=stop;this.history=new Map();}
  emit(name,p,listener,options={}){const volume=soundVolume(p,listener);if(volume>.02)this.play(name,{...options,volume:volume*(options.volume??1)});}
  event(e,p,listener){if(e.type==='guard'){if(p?.weapon==='gs')this.emit(e.broken?'gs_guard_break':'gs_guard_block',p,listener);return;}if(e.type==='sound')this.emit(gsSoundName(e.name,p),p,listener);}
  update(p,listener,remote=false){
    if(p.weapon!=='gs')return;
    const key='gs-charge:'+p.id,old=this.history.get(p.id), level=p.state==='charge'?Math.max(0,Math.min(3,Math.floor(p.clv||0))):0;
    const attack=p.state==='atk', fresh=old&&(old.state!==p.state||p.t<old.t||p.cur!==old.cur);
    // Remote state comes from existing read-only interpolated hunter/action view.
    if(remote&&fresh&&attack)this.emit(gsSoundName('swingH',p),p,listener);
    if(remote&&old&&p.state==='roll'&&fresh)this.emit('gs_roll',p,listener);
    if(remote&&old&&p.state==='charge'&&level>old.level)for(let i=old.state==='charge'?old.level+1:1;i<=level;i++)this.emit('gs_charge_'+i,p,listener);
    if(p.state==='charge' && soundVolume(p,listener)>.02){
      if(!old||old.state!=='charge'||p.t-old.loopTime>=.35){this.emit('gs_charge_loop',p,listener,{loop:true,key});this.loopTime=p.t;}else this.loopTime=old.loopTime;
    }else{this.stop(key);this.loopTime=0;}
    // Remote guard success is not on the wire. A stamina drop while guarding is the existing view evidence.
    if(remote&&old&&(old.state==='guard'||p.state==='guard')&&p.st<old.st-1)this.emit(p.state==='stun'?'gs_guard_break':'gs_guard_block',p,listener);
    this.history.set(p.id,{state:p.state,t:p.t,cur:p.cur,level,st:p.st,loopTime:this.loopTime});
  }
  slam(p,listener,tier){this.emit('gs_slam',p,listener,{pitch:1-tier*.08,volume:1+tier*.12});}
  prune(ids){for(const id of this.history.keys())if(!ids.has(id)){this.stop('gs-charge:'+id);this.history.delete(id);}}
  dispose(){for(const id of this.history.keys())this.stop('gs-charge:'+id);this.history.clear();}
}
