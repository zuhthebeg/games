// Presentation-only R19. No simulation, save, transport or action timing writes.
import {soundVolume} from './gs-sound.js?v=20261117mt1';
const supported=p=>p?.weapon==='db'||p?.weapon==='bow';
export class WeaponSoundView {
  constructor(play){this.play=play;this.history=new Map();this.seen=new Map();this.hitActors=new Map();this.serial=0;}
  once(key){if(this.seen.has(key))return false;this.seen.set(key,true);if(this.seen.size>128)this.seen.delete(this.seen.keys().next().value);return true;}
  emit(name,p,listener){const volume=soundVolume(p,listener);if(volume>.02)this.play(name,{volume});}
  begin(events){
    this.hitActors.clear();let actor;
    // Existing hit UI events identify the real attacking player. Consume once:
    // the later monster-death hitBig is NOT another player weapon contact.
    for(const e of events){if(e.type==='hit')actor=e.playerId;
      if(e.type==='sound'&&(e.name==='hit'||e.name==='hitBig')){if(actor!==undefined)this.hitActors.set(e,actor);actor=undefined;}}
  }
  hit(p,listener,key){if(supported(p)&&this.once('hit:'+p.id+':'+key))this.emit(p.weapon+'_hit',p,listener);}
  shot(p,listener,key){if(this.once('shot:'+p.id+':'+key)){this.emit('bow_release',p,listener);this.emit('bow_flight',p,listener);}}
  event(e,players,listener,tick,arrows=[],active=true){
    let p=players.find(p=>p.id===(e.playerId??this.hitActors.get(e)));
    if(!active)return supported(listener)||supported(p);
    if(e.name==='hit'||e.name==='hitBig'){
      if(supported(p)){this.hit(p,listener,tick);return true;}
      // Unknown actor (including monster death) retains the generic synth.
      if(!p&&supported(listener)){this.play(e.name);return true;}return false;
    }
    if(e.name==='swing'||e.name==='swingH'){
      // Identityless legacy sound events: unique fresh DB attack is inference,
      // not an authoritative actor ID. Ambiguous/monster-only cases stay synth.
      if(!p){const candidates=players.filter(p=>p.weapon==='db'&&p.state==='atk'&&p.t<=1/60+.001);if(candidates.length===1)p=candidates[0];}
      if(p?.weapon==='db'){
        const key='swing:'+p.id+':'+(p.attackTick??Math.round(tick-p.t*60));
        if(this.once(key)){this.emit('db_swing',p,listener);return true;}
      }
      if(supported(listener)){this.play(e.name);return true;}return false;
    }
    if(e.name==='shot'){
      if(!p){const candidates=players.filter(p=>p.weapon==='bow'&&p.state==='atk'&&p.cur?.shot&&p.t>=p.cur.h0&&p.t<=p.cur.h0+1/60+.001);if(candidates.length===1)p=candidates[0];}
      if(p?.weapon==='bow'){
        const arrow=arrows.filter(a=>a.owner===p.id).at(-1);
        this.shot(p,listener,arrow?'arrow:'+arrow.id:'action:'+(p.attackTick??Math.round(tick-p.t*60)));return true;
      }
      if(supported(listener)){this.play(e.name);return true;}
    }
    return false;
  }
  update(p,listener,remote){
    if(!supported(p)||!remote)return;
    const old=this.history.get(p.id),fresh=old&&(p.state!==old.state||p.t<old.t||p.startTick!==old.startTick||p.cur!==old.cur);
    let key=fresh?++this.serial:old?.key;
    if(old&&p.state==='atk'){
      if(p.weapon==='db'&&fresh)this.emit('db_swing',p,listener);
      // One finite flight per observed shot action, never per render/hit.
      if(p.weapon==='bow'&&p.cur?.shot&&p.t>=p.cur.h0&&(fresh||old.t<p.cur.h0))this.shot(p,listener,'remote:'+key);
    }
    this.history.set(p.id,{state:p.state,t:p.t,startTick:p.startTick,cur:p.cur,key});
  }
  prune(ids){for(const id of this.history.keys())if(!ids.has(id))this.history.delete(id);}
  suspend(){this.history.clear();this.hitActors.clear();}
  dispose(){this.suspend();this.seen.clear();}
}
