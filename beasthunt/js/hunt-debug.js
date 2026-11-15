import { POTIONS } from './data.js?v=20261116r20';
// Ephemeral SOLO test controls. Never installed on a session-owned simulation.
export function attachHuntDebug(hunt, {search = '', mount = null, restart = null, initial = null} = {}) {
 if (hunt.session || new URLSearchParams(search).get('debug') !== '1') return null;
 if (hunt.debug) return hunt.debug;
 const options={invulnerable:true,stamina:true,consumables:false,freezeAI:false,speed:1};
 const sim=hunt.sim,p=hunt.p,restore=[];let disposed=false,panel=null;
 const allowed=()=>!disposed&&!hunt.session&&!sim.network;
 function wrap(obj,key,fn){const own=Object.getOwnPropertyDescriptor(obj,key),original=obj[key];obj[key]=fn(original);restore.push(()=>{if(own)Object.defineProperty(obj,key,own);else delete obj[key];});}
 // At the damage boundary, BEFORE HP, hit reactions, carts, or result events.
 wrap(sim,'hurt',original=>function(...args){if(allowed()&&options.invulnerable&&this.p.id===hunt.localId)return false;return original.apply(this,args);});
 wrap(sim,'updMon',original=>function(...args){if(allowed()&&options.freezeAI)return;return original.apply(this,args);});
 // Preserve the finite resource balance underneath the temporary override. Cost
 // writes are ignored only while enabled; turning it off resumes the old balance.
 for(const [key,option,maximum] of [['st','stamina',100],['potions','consumables',POTIONS]]){
  const descriptor=Object.getOwnPropertyDescriptor(p,key);let value=p[key];
  Object.defineProperty(p,key,{configurable:true,enumerable:true,get(){return allowed()&&options[option]?maximum:value;},set(next){if(!(allowed()&&options[option]))value=next;}});
  restore.push(()=>Object.defineProperty(p,key,{...descriptor,value}));
 }
 wrap(hunt,'frame',original=>function(dt){return original.call(this,allowed()?dt*options.speed:dt);});
 const controls={};
 const debug={get options(){return {...options};},set(key,value){
  if(disposed||!Object.hasOwn(options,key))return false;
  if(key==='speed'?![.25,.5,1,2].includes(value):typeof value!=='boolean')return false;
  options[key]=value;if(controls[key]){if(key==='speed')controls[key].value=String(value);else controls[key].checked=value;}return true;
 },dispose(){if(disposed)return;disposed=true;panel?.remove();for(const undo of restore.reverse())undo();if(hunt.debug===debug)delete hunt.debug;}};
 hunt.debug=debug;
 if(initial)for(const [key,value] of Object.entries(initial))debug.set(key,value);
 if(mount){
  const doc=mount.ownerDocument;panel=doc.createElement('details');panel.className='hunt-debug';
  const title=doc.createElement('summary');title.textContent='디버그 · 보상 없음';panel.append(title);
  for(const [key,label] of [['invulnerable','무적'],['stamina','스태미나 무제한'],['consumables','소모품 무제한'],['freezeAI','적 행동 정지']]){
   const row=doc.createElement('label'),box=doc.createElement('input');box.type='checkbox';box.checked=options[key];box.onchange=()=>debug.set(key,box.checked);controls[key]=box;row.append(box,doc.createTextNode(label));panel.append(row);
  }
  const row=doc.createElement('label'),select=doc.createElement('select');row.append(doc.createTextNode('사냥 속도'));
  select.setAttribute('aria-label','사냥 속도');for(const n of [.25,.5,1,2]){const opt=doc.createElement('option');opt.value=String(n);opt.textContent=n+'배';select.append(opt);}select.value=String(options.speed);select.onchange=()=>debug.set('speed',Number(select.value));controls.speed=select;row.append(select);panel.append(row);
  const button=doc.createElement('button');button.type='button';button.textContent='현재 사냥 재시작';button.onclick=()=>{if(allowed()&&restart)restart(debug.options);};panel.append(button);
  // Keep test controls out of camera drag / touch combat input handling.
  for(const event of ['pointerdown','pointerup','click','keydown','keyup'])panel.addEventListener(event,e=>e.stopPropagation());
  mount.append(panel);
 }
 return debug;
}
