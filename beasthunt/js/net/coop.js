import {safeLobby} from './safe-lobby.js';
import * as THREE from 'three';
import {QUESTS,WTYPES} from 'bh/data';
import {buildHunter} from 'bh/models';
import {t} from 'bh/i18n';
import {GuestSession} from './guest.js';
import {WorkerHost} from './worker-host.js';
import {attachRelay} from './transport.js';
import {VERSION,envelope,byteLength} from './protocol.js';

// Game-local adapter: the shared lobby/socket remain unmodified.
export class Coop {
  constructor({save,quest,start,leave}) {
    Object.assign(this,{save,quest,start,leave});
    this.profiles=new Map();this.actions=new Map();this.remotes=new Map();
    this.roster={players:[]};this.owner=null;this.world=null;this.plan=null;
    this.bytes=0;this.since=performance.now();this.frames=[];
    this.uid=sessionStorage.getItem('bh_uid') || crypto.randomUUID();sessionStorage.setItem('bh_uid',this.uid);
    this.lobby=safeLobby(new MultiplayerLobby({gameType:'beasthunt',gameName:'BEAST HUNT',minPlayers:2,maxPlayers:4,
      room:new URLSearchParams(location.search).get('room')||sessionStorage.getItem('bh_room')||undefined,
      workerBase:'wss://relay-do-poc.zuhejbeg.workers.dev',userId:this.uid,getPlayerData:()=>this.profile(),
      onLeave:()=>this.close(),onLocal:()=>this.close(),
      onGameEvent:(type,e)=>{if(type==='event')this.event(e);}}));
    this.timer=setInterval(()=>this.service(),200);
  }
  profile(){return {v:VERSION,save:{weapon:this.save.weapon,w:{...this.save.w},armor:this.save.armor}};}
  status(key){this.lobby._setStatus(t(key));}
  service(){
    const ws=this.lobby._ws;
    if(ws && ws!==this.ws){
      this.locked=false;this.relay?.close();this.ws=ws;sessionStorage.setItem('bh_room',this.lobby.room);
      this.relay=attachRelay(ws,{uid:this.uid,onPacket:(from,p)=>this.packet(from,p),
        onStarted:()=>this.started(),onRoster:d=>this.rosterChanged(d)});
      // Lobby's generic opponent-left modal is not appropriate for a PvE party.
      const prior=ws.onEvent;ws.onEvent=e=>{if(e?.type==='opponent_left')return;prior?.(e);};
      ws.onRoomClosed=()=>this.lostHost();
      const rt=ws.onRt;ws.onRt=(from,data)=>{
        if(data?.bhHello){this.profiles.set(from,data.bhHello);this.decorate();if(this.plan&&this.uid===this.plan.host)ws.sendRt({bhPlan:this.plan,to:from});}
        if(data?.bhPlan && data.to===this.uid && from===this.roster.hostUser)this.begin(data.bhPlan);
        if(data?.bhPing && this.uid===this.roster.hostUser)ws.sendRt({bhPong:data.bhPing,to:from});
        if(data?.bhPong && data.to===this.uid && from===this.roster.hostUser)this.rtt=Math.max(0,performance.now()-data.bhPong);
        rt?.(from,data);
      };
      this.rosterChanged(this.lobby._roster);
    }
    if(!ws){if(this.ws){sessionStorage.removeItem('bh_room');this.relay?.close();this.ws=null;}this.decorate();return;}
    if(!this.owner){this.profiles.set(this.uid,this.profile());ws.sendRt({bhHello:this.profile()});}
    if(this.uid!==this.roster.hostUser && (!this.lastPing || performance.now()-this.lastPing>1000)){this.lastPing=performance.now();ws.sendRt({bhPing:this.lastPing});}
    this.decorate();
    if(this.owner && !this.owner.initialized && performance.now()-this.waitSince>5000)this.lostHost();
  }
  decorate(){
    const mode=document.querySelector('#mpl-mode');if(mode){
      mode.querySelector('.mpl-sub').textContent=t('coop');
      for(const [id,key] of [['mpl-solo','solo'],['mpl-quick','quick'],['mpl-create','create_room'],['mpl-join','join_room'],['mpl-mode-leave','close']]){const el=mode.querySelector('#'+id);if(el)el.textContent=t(key);}
      const input=mode.querySelector('#mpl-code');if(input)input.placeholder=t('room');
      const title=mode.querySelector('.mpl-card > .mpl-mini');if(title)title.textContent=t('rooms');
    }
    const card=document.querySelector('#mpl-lobby .mpl-card');if(!card)return;
    card.querySelector('.mpl-sub').textContent=t('coop');
    card.querySelector('.mpl-room .mpl-mini').textContent=t('room');card.querySelector('#mpl-copy').textContent=t('copy_link');
    card.querySelector('#mpl-leave').textContent=t('leave');card.querySelector('#mpl-ready').textContent=t(this.lobby._iAmReady?'ready_cancel':'ready');
    card.querySelector('#mpl-start').textContent=t('begin');
    const hint=card.querySelector(':scope > .mpl-mini');if(hint)hint.hidden=true;
    for(const e of card.querySelectorAll('.mpl-ready'))e.textContent=t(e.classList.contains('on')?'ready':'waiting');
    for(const e of card.querySelectorAll('.mpl-host'))e.textContent=' 👑'+t('host');
    if(this.locked){card.querySelector('#mpl-ready').disabled=true;card.querySelector('#mpl-start').disabled=true;this.status('hunt_locked');return;}
    card.querySelector('#mpl-solo-start').hidden=true;
    // Quest selection is visible only to the host; guests may join any quest.
    let pick=card.querySelector('#bh-quest');
    if(!pick){pick=document.createElement('select');pick.id='bh-quest';pick.setAttribute('aria-label',t('tab_quest'));
      for(const q of QUESTS){if(q.need&&!this.save.clears[q.need])continue;const o=document.createElement('option');o.value=q.id;o.textContent=t('mon_'+q.mon)+' · '+t('rank'+q.hr);pick.append(o);}pick.value=this.quest();this.selectedQuest=pick.value;pick.onchange=()=>{this.selectedQuest=pick.value;};card.querySelector('.mpl-room').after(pick);}
    pick.hidden=this.roster.hostUser!==this.uid;
    const compatible=this.roster.players.every(p=>this.profiles.get(p.user)?.v===VERSION);
    const start=card.querySelector('#mpl-start');start.disabled=!(compatible && this.roster.hostUser===this.uid && this.roster.players.length>=2 && this.roster.players.length<=4 && this.roster.players.filter(p=>p.user!==this.uid).every(p=>p.ready));if(compatible)this.lobby._setStatus(t('party')+': '+this.roster.players.length+'/4');if(!compatible){start.disabled=true;this.status(this.roster.players.some(p=>this.profiles.has(p.user)&&this.profiles.get(p.user).v!==VERSION)?'version_mismatch':'connecting');}
  }
  rosterChanged(d){
    this.roster=d;
    if(this.pendingPlan && d.hostUser){const plan=this.pendingPlan;this.pendingPlan=null;this.begin(plan);}
    if(this.owner && (d.hostUser!==this.plan.host || !d.players.some(p=>p.user===this.plan.host)))this.lostHost();
    const ids=new Set(d.players.map(p=>p.user));
    for(const [id,r] of this.remotes)if(!ids.has(id)){r.H.root.removeFromParent();r.H.root.traverse(o=>{o.geometry?.dispose();if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose());});r.label.remove();this.remotes.delete(id);this.owner?.rep.hunters.delete(id);}
    if(this.world)this.world.worker.postMessage({type:'roster',ids:[...ids]});
    this.decorate();
  }
  started(){
    if(this.roster.hostUser!==this.uid)return;
    const players=this.roster.players;
    if(players.length<2 || players.length>4 || players.some(p=>this.profiles.get(p.user)?.v!==VERSION)){this.status('version_mismatch');this.lobby.goToWaitingRoom();return;}
    const roster=Object.fromEntries(players.map(p=>[p.user,{name:p.nick||p.user,save:this.profiles.get(p.user).save}]));
    const plan={v:VERSION,id:crypto.randomUUID(),host:this.uid,quest:this.selectedQuest||this.quest(),roster,seed:crypto.getRandomValues(new Uint32Array(1))[0]};
    this.ws.sendAction({type:'BH_BEGIN',from:this.uid,plan,__snapshot:plan});this.begin(plan);
  }
  event(e){
    const a=e?.data;
    if(a?.type==='BH_BEGIN' && a.from===this.roster.hostUser)this.begin(a.plan);
    if(a?.type==='__resync' && a.__snapshot){if(!this.roster.hostUser)this.pendingPlan=a.__snapshot;else if(a.__snapshot.host===this.roster.hostUser)this.begin(a.__snapshot);}
  }
  begin(plan){
    if(plan?.v!==VERSION){this.status('version_mismatch');return;}
    if(plan.host!==this.roster.hostUser || this.plan?.id===plan.id)return;
    if(!Object.hasOwn(plan.roster,this.uid)){this.locked=true;this.lobby.goToWaitingRoom();this.decorate();return;}
    const quest=QUESTS.find(q=>q.id===plan.quest);if(!quest)return;
    this.stop();this.plan=plan;this.waitSince=performance.now();this.actions.clear();this.frames=[];
    this.owner=new GuestSession({quest,save:this.save,seed:crypto.getRandomValues(new Uint32Array(1))[0],hunt:plan.id,host:plan.host,uid:this.uid,
      transport:{sendState:p=>this.send(p,'state'),sendEvent:p=>this.send(p,'event')}});
    // A terminal full after refresh reuses settled loot before Sim.result can roll.
    try {const stored=sessionStorage.getItem('bh_reward:'+plan.id);if(stored&&stored!=='1')this.owner.sim.cachedResult=JSON.parse(stored).result;}catch(_) { /* legacy or unavailable storage */ }
    this.owner.seq=Date.now()*1000;
    this.owner.render=(h,dt)=>this.render(h,dt);
    if(this.uid===plan.host)this.world=new WorkerHost({quest,roster:plan.roster,seed:plan.seed,hunt:plan.id,host:plan.host},(p,channel)=>{
      this.packet(this.uid,p);this.bytes+=byteLength(p);
      if(channel==='state')this.relay.sendState(p);else this.relay.sendEvent(p,{final:p.type==='end'});
    });
    this.lobby._hideLobby();this.lobby._hideResult();this.start(plan.quest,this.owner);
    this.send(envelope('resync',plan.id,0,{}),'state');
  }
  send(p,channel){
    this.bytes+=byteLength(p);this.world?.receive(this.uid,p);
    if(channel==='state')this.relay.sendState(p);else this.relay.sendEvent(p);
  }
  packet(from,p){
    if(!p)return;
    this.world?.receive(from,p);
    if(!this.owner || !Object.hasOwn(this.plan.roster,from))return;
    if(p.type==='hunterAction' && p.hunt===this.plan.id && p.v===VERSION && p.payload.id===from){
      if(!Number.isFinite(p.payload.startTick))return;const list=this.actions.get(from)||[];if(!list.length||p.seq>list.at(-1).seq){list.push(p);if(list.length>32)list.shift();this.actions.set(from,list);}
    }
    this.owner.receive(from,p,performance.now());
  }
  lostHost(){if(this.owner&&!this.owner.sim.over){this.owner.initialized=true;this.owner.disconnected=true;const end=this.owner.pending.find(p=>p.type==='end')?.payload;if(end){this.owner.sim.time=end.time;this.owner.sim.carts=end.carts;this.owner.sim.m.broke={...end.broke};}this.owner.sim.finish(end?.win??false,0);}}
  render(h,dt){
    const o=this.owner,view=o.rep.clock.playTick;
    const hud=document.getElementById('party');hud.hidden=false;
    const rows=[{id:this.uid,...h.p}];
    for(const [id,b] of o.rep.hunters){
      if(!this.roster.players.some(p=>p.user===id))continue;
      const p=b.sample(view);if(!p)continue;
      let r=this.remotes.get(id);
      if(!r){const s=this.plan.roster[id].save,H=buildHunter(s.weapon,s.w[s.weapon],s.armor);h.scene.add(H.root);
        const label=document.createElement('span');label.className='hunter-name';label.textContent=this.plan.roster[id].name;document.getElementById('names').append(label);
        r={H,label};this.remotes.set(id,r);}
      const a=this.actions.get(id)?.filter(a=>a.payload.startTick<=view).at(-1)?.payload;
      const start=a&&a.startTick<=view&&a.state===p.state?a.startTick:p.startTick;
      p.t=Math.max(0,(view-start)/60);p.walk=view/60*6;p.moving=r.last&&Math.hypot(p.x-r.last.x,p.z-r.last.z)>.0001?1:0;p.inv=0;p.clv=Math.min(3,p.t/(WTYPES[p.weapon].heavy.charge||1)*3);
      const W=WTYPES[p.weapon];p.cur=a?.moveId==='heavy'?W.heavy:W.light[Number(a?.moveId?.split(':')[1])||0];
      if(!p.cur)p.cur=W.light[0];
      h.syncHunter(p,r.H,dt,r);r.last={x:p.x,z:p.z};rows.push({id,...p});
      const ndc=new THREE.Vector3(p.x,2.6,p.z).project(h.cam);r.label.hidden=ndc.z>1||Math.abs(ndc.x)>1||Math.abs(ndc.y)>1;
      r.label.style.left=(ndc.x*.5+.5)*h.r.domElement.clientWidth+'px';r.label.style.top=(-ndc.y*.5+.5)*h.r.domElement.clientHeight+'px';
    }
    // textContent prevents roster nicknames from becoming HTML.
    hud.replaceChildren();for(const p of rows){const row=document.createElement('div'),name=document.createElement('span'),bar=document.createElement('meter');name.textContent=this.plan.roster[p.id]?.name||p.id;bar.max=p.maxHp;bar.value=p.hp;row.append(name,bar);hud.append(row);}
    document.getElementById('latency').textContent=(o.disconnected||o.recovery)?t('connecting'):Math.round(this.uid===this.plan.host?0:(this.rtt||0))+' ms';
    this.frames.push({at:performance.now(),x:h.G.root.position.x,z:h.G.root.position.z,state:h.m.state,dt,fixedSteps:h.fixedSteps,visible:h.G.root.visible,hostTick:o.rep.world?.tick,playTick:view,ownerTick:h.sim.tick,phase:h.m.ak,attackTime:h.m.t,eventSeq:o.hostSeq,epoch:o.epoch,recovery:o.recovery?.phase??null,ownerCorrections:o.positionCorrections});if(this.frames.length>36000)this.frames.shift();
  }
  stop(){this.world?.close();this.world=null;this.owner=null;for(const r of this.remotes.values())r.label.remove();this.remotes.clear();document.getElementById('party').hidden=true;document.getElementById('latency').textContent='';}
  waiting(){this.stop();this.plan=null;this.lobby.goToWaitingRoom();this.decorate();}
  close(){sessionStorage.removeItem('bh_room');clearInterval(this.timer);this.stop();this.relay?.close();this.ws?.leave();this.lobby._hideLobby();this.lobby._hideModeSelect();this.lobby._hideResult();this.leave();}
}
