import { victoryResultDelay } from '../js/ui/victory-result-delay.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HubUI } from '../js/ui/hub.js';
import { createUndeadSession } from '../js/debug/undead-start.js';
import { createSave, SAVE_KEY } from '../js/meta/save.js';
import { createSkeletonSave } from '../js/meta/character-creation.js';
import { readKnight } from '../js/meta/initial-characters.js';
import { SLOT_SAVE_KEYS } from '../js/meta/character-slots.js';
import { createWorld, addPlayer, startStage, setLoad } from '../js/sim/world.js';
import { masteryLevels } from '../js/meta/skill-mastery.js';
import { loadoutOf } from '../js/meta/skills.js';
import { currentLoad, createTracker, buildRoundMods } from '../js/meta/run.js';
import { ITEMS, equippedItem } from '../js/meta/items.js';
const source = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; };
class Node {
 constructor(text='') { this.inert=false; this.textContent=text; this.childNodes=[]; this.attributes=[]; this.nodeType=1; }
 get hidden(){return this.attributes.some(a=>a.name==='hidden');} set hidden(v){if(v)this.setAttribute('hidden','');else this.removeAttribute('hidden');}
 get disabled(){return this.attributes.some(a=>a.name==='disabled');} set disabled(v){if(v)this.setAttribute('disabled','');else this.removeAttribute('disabled');}
 replaceChildren(...nodes) { this.childNodes=nodes; }
 setAttribute(name,value) { this.attributes=this.attributes.filter(a=>a.name!==name); this.attributes.push({name,value}); }
 removeAttribute(name) { this.attributes=this.attributes.filter(a=>a.name!==name); }
}
function harness({ absent=false, failure=null, oldWorld=false }={}) {
 const human = absent ? null : createSave({name:'SENTINEL',answers:[0,1,2,3,0],createdAt:1});
 const raw=JSON.stringify(human), writes=[], imports=[], sessions=[], reads=[];
 const slot=SLOT_SAVE_KEYS.skeleton_knight, profile=createSkeletonSave({lineage:'skeleton_knight',name:'Original',answers:[1,2,3,0,2],createdAt:8});
 const data=new Map([[SAVE_KEY,raw],[slot,JSON.stringify(profile)]]);
 const storage={getItem(k){reads.push(k);return data.get(k)??null;},setItem(k,v){writes.push(['set',k]);data.set(k,v);},removeItem(k){writes.push(['remove',k]);data.delete(k);}};
 const nodes=Object.fromEntries(['#hud','#pause'].map(id=>[id,new Node('human HUD')])); nodes['#hud'].hidden=true;
 const root=new Node('original hub intro/inn'); root.childNodes=[new Node('existing child')];
 const skeleton=()=>{},blade=()=>{},previousHuman=()=>{};
 const provider={factories:new Map([['skeleton_warrior',skeleton],['blade',blade],['undead_lab_human_melee',previousHuman]]),register(k,f){this.factories.set(k,f);}};
 let fault=failure, resets=0;
 const renderer={provider,root:{visible:false},warning:{visible:false},reduced:true,
 reset(w) { this.current=w; resets++; if(fault==='renderer') { fault=null; throw Error('injected renderer'); } },
 render(){ if(fault==='render') {fault=null;throw Error('injected render');} }};
 const input={enabled:false,reset(){this.resets=(this.resets||0)+1;}};
 const audio={stops:0,stop(){this.stops++;}};
 const debug={reset(){},frame(){}};
 const hud={clearUndeadResult(){},nodes:{'stage-name':new Node('human stage'),notice:new Node('human notice'),dodge:new Node()},noticeLeft:7,stage:'human',
 begin(){nodes['#hud'].hidden=false; this.nodes.dodge.disabled=true; this.stage='debug'; if(fault==='hud') {fault=null;throw Error('injected hud');}},
 meta(){if(fault==='meta'){fault=null;throw Error('injected meta');}}};
 nodes['#hud'].childNodes=Object.values(hud.nodes);
 class Hub { constructor(options) {Object.assign(this,options);this.root=root;this.readyCalls=0;} ready(){this.readyCalls++;} }
 Hub.prototype.launch=HubUI.prototype.launch; Hub.prototype.commit=HubUI.prototype.commit; Hub.prototype.action=HubUI.prototype.action;
 let cached=false;
 const importer=()=>{if(cached)return Promise.resolve(mod);const d=deferred();imports.push(d);return d.promise;};
 const mod={createUndeadSession(p,save){const s=createUndeadSession(p);const restart=s.restart.bind(s),leave=s.leave.bind(s);s.leaves=0;s.leave=()=>{s.leaves++;leave();};s.restart=()=>{if(fault==='restart'){fault=null;throw Error('injected restart');}return restart();};sessions.push(s);return s;}};
 mod.createKnightSession=(p,save)=>mod.createUndeadSession(p,save);
 const globals=source.slice(source.indexOf('let world ='),source.indexOf('// Live read-only'));
 const lifecycle=source.slice(source.indexOf('  const hub = new HubUI'),source.indexOf('  function frameUndead')).replace("await import('./debug/undead-start.js')",'await importer()').replace("await import('./solo/undead-session.js')",'await importer()');
 const coop=source.slice(source.indexOf('  function startCoop('),source.indexOf('  hub.startCoop ='));
 const debugContext=source.slice(source.indexOf('      get undead()'),source.indexOf('      get world() { return world; }, get save()'));
 const frame=source.slice(source.indexOf('  function frame(now)'),source.indexOf('  requestAnimationFrame(frame);\n} catch'));
 let scheduled=0;
 const boot=new Function('HubUI','store','saved','renderer','input','audio','hud','document','debugValue','importer','createWorld','addPlayer','loadoutOf','currentLoad','createTracker','matchMedia','performance','buildRoundMods','ITEMS','equippedItem','startStage','crypto','closeCoop','requestAnimationFrame','app','setLoad','showArrival','readKnight','localStorage','masteryLevels','resultPresentation',
 `${globals}\nconst characters={assertOwner(){},active:{}}; debug=debugValue; ${lifecycle}\n${coop}\n${frame}\nreturn {hub,startUndead,leaveUndead,startCoop,frame,debugContext:({${debugContext}}),setCoop(c){coop=c;},setWorld(w){world=w;},state:()=>({undead,undeadStarting,world,running,roundSave,tracker})};`);
 const api=boot(Hub,{save:s=>writes.push(['save',s]),reset:()=>writes.push(['reset'])},human,renderer,input,audio,hud,{hidden:false,querySelector:id=>nodes[id]||null,createElement:()=>({style:{},addEventListener(){},remove(){}}),body:{append(){}}},debug,importer,createWorld,addPlayer,loadoutOf,currentLoad,createTracker,()=>({matches:false}),{now:()=>1},buildRoundMods,ITEMS,equippedItem,startStage,{getRandomValues:a=>a},()=>{},()=>scheduled++,{render(){}},setLoad,()=>{},readKnight,storage,masteryLevels,victoryResultDelay());
 const initial=oldWorld ? createWorld() : null;if(initial)addPlayer(initial,{pid:'local'});api.setWorld(initial);
 const resolve=i=>imports[i].resolve(mod);
 const restored=()=>{assert.equal(api.state().undeadStarting,false);assert.equal(api.hub.save,human);assert.equal(api.state().undead,null);assert.equal(api.state().world,initial);assert.equal(api.state().running,false);assert.equal(root.hidden,false);assert.equal(root.inert,false);assert.equal(root.textContent,'original hub intro/inn');assert.equal(nodes['#hud'].hidden,true);assert.equal(hud.stage,'human');assert.equal(hud.nodes.dodge.disabled,false);assert.equal(input.enabled,false);assert.equal(renderer.root.visible,false);assert.equal(provider.factories.get('blade'),blade);assert.equal(provider.factories.get('undead_lab_human_melee'),previousHuman);assert.equal(JSON.stringify(human),raw);assert.deepEqual(writes,[]);};
 return {...api,cacheModule:()=>{cached=true;},data,profile,slot,reads,humanRaw:raw,imports,resolve,mod,root,hud,input,audio,renderer,writes,sessions,restored,scheduled:()=>scheduled,fail:f=>{fault=f;}};
}
for(const absent of [false,true]) test(`pending return cancels real lazy entry, original hub/save restored (absent=${absent})`,async()=>{
 const h=harness({absent});const p=h.startUndead();assert.ok(h.state().undeadStarting);h.leaveUndead();h.resolve(0);await p;h.restored();assert.equal(h.sessions.length,0);assert.equal(h.audio.stops,0);
});
test('pending hub launch/commit/action, coop and repeated starts cannot mutate human state',async()=>{
 const h=harness();const p=h.startUndead();await h.startUndead();assert.equal(h.imports.length,1);
 assert.ok(h.root.hidden&&h.root.inert,'human UI isolated from pending moment');
 h.hub.launch('S1');h.hub.action('answer',{choice:'1'});assert.throws(()=>h.hub.commit(h.hub.save));
 assert.throws(()=>h.startCoop('S1',1));assert.deepEqual(h.writes,[]);
 h.leaveUndead();h.resolve(0);await p;h.restored();
});
test('stale import resolution/rejection never clears or installs over a newer pending attempt',async()=>{
 for(const reject of [false,true]) {const h=harness();const a=h.startUndead();h.leaveUndead();const b=h.startUndead();if(reject)h.imports[0].reject(Error('old import'));else h.resolve(0);await a.catch(()=>{});assert.ok(h.state().undeadStarting);assert.equal(h.state().undead,null);h.resolve(1);await b;assert.ok(h.state().undead);h.leaveUndead();h.restored();}
});
test('owned import rejection restores human without installing art; subsequent entry and double return work',async()=>{
 const h=harness();const p=h.startUndead();h.imports[0].reject(Error('injected import'));await assert.rejects(p,/injected import/);h.restored();assert.equal(h.sessions.length,0);
 const next=h.startUndead();h.resolve(1);await next;h.leaveUndead();h.leaveUndead();h.restored();assert.equal(h.sessions[0].leaves,1);
});
test('reset callback cancels pending without deleting human save, coop lobby refuses entry',async()=>{
 const h=harness();const p=h.startUndead();h.hub.resetSave();h.resolve(0);await p;h.restored();
 // Source guard has to precede lazy import even for an existing (non-running) co-op lobby.
 const blocked=source.slice(source.indexOf('  async function startUndead'),source.indexOf('  function leaveUndead'));
 assert.match(blocked,/!undead && \(running \|\| coop\)/);
});
for(const failure of ['restart','renderer','render','hud','meta']) test(`transaction rollback after ${failure}: exact factories/human presentation, no write, RAF and reentry`,async()=>{
 const h=harness({failure,oldWorld:true});const p=h.startUndead();h.resolve(0);await assert.rejects(p,/injected/);h.restored();assert.equal(h.sessions[0].leaves,1);assert.equal(h.audio.stops,0);
 h.frame(16);assert.equal(h.scheduled(),1,'human RAF survives rejected initialization');
 const next=h.startUndead();h.resolve(1);await next;assert.ok(h.state().undead);h.leaveUndead();h.restored();assert.equal(h.sessions[1].leaves,1);
 // Actual normal round callback still works after failed entry and teardown.
 h.hub.startRound('S1',false);assert.equal(h.state().world.round.stageId,'S1');assert.equal(h.state().running,true);assert.equal(h.state().world.entities[0].dodgeDisabled,undefined);
});

test('existing co-op lobby blocks lazy entry before import',async()=>{
 const h=harness();h.setCoop({});await assert.rejects(h.startUndead(),/멀티플레이/);assert.equal(h.imports.length,0);h.restored();
});
test('actual DBG pending save/mastery/extensions/reset paths, not just helper state',async()=>{
 const h=harness();const p=h.startUndead();
 const context=Object.assign(Object.create(h.debugContext),{hub:h.hub,store:{save(){throw Error('unexpected store write');}},startUndead:h.startUndead,leaveUndead:h.leaveUndead});
 assert.equal(context.undead,true);assert.equal(context.undeadStarting,true);
 assert.throws(()=>context.setMastery('lunge',30),/수정 불가/);
 const dbg=readFileSync(new URL('../js/debug/index.js',import.meta.url),'utf8');
 const actions=dbg.slice(dbg.indexOf('  const requireInn'),dbg.indexOf("  panel.addEventListener('click'"));
 const execute=new Function('context','hub','store','panel','toggle','status',`${actions};return execute;`)(context,h.hub,context.store,{querySelector(){return {}; }},{setAttribute(){}},()=>{});
 for(const action of ['gold:1000','import','copy','god','clear','level','gear']) await assert.rejects(execute(action),/저장/);
 let extensionCalls=0;const buttons=[];
 const extensionNode={replaceChildren(){},append(b){buttons.push(b);}};
 const extensionSource=dbg.slice(dbg.indexOf('  const extensions ='),dbg.indexOf('  let last ='));
 new Function('context','panel','document','debugActions','watchDebugActions','combat','save','status',extensionSource)(context,{querySelector:()=>extensionNode},{createElement:()=>({addEventListener(_,fn){this.click=fn;}})},[{group:'test',label:'write',run(){extensionCalls++;}}],()=>{},{},()=>{},()=>{});
 buttons[0].click();await Promise.resolve();await Promise.resolve();assert.equal(extensionCalls,0);
 await execute('reset');h.resolve(0);await p;h.restored();
});
for(const failure of ['restart','renderer','render','hud','meta']) test(`active restart ${failure} rolls back to original human, releases only once`,async()=>{
 const h=harness();const p=h.startUndead();h.resolve(0);await p;h.fail(failure);await assert.rejects(h.startUndead(),/injected/);assert.equal(h.audio.stops,2,'failed active restart must stop encounter voices');h.restored();assert.equal(h.sessions[0].leaves,1);h.frame(16);assert.equal(h.scheduled(),1);
});
