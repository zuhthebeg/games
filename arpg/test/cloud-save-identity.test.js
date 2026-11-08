import test from 'node:test';
import assert from 'node:assert/strict';
import { CloudSave, snapshot } from '../js/meta/cloud-save.js';
import { createSave } from '../js/meta/save.js';
import { createSkeletonSave } from '../js/meta/character-creation.js';
import { SLOT_SAVE_KEYS } from '../js/meta/character-slots.js';
const human = () => createSave({name:'Identity',answers:[0,0,0,0,0],createdAt:12345});
const knight = () => createSkeletonSave({lineage:'skeleton_knight',name:'Bone',answers:[0,0,0,0,0],createdAt:12345});
const tick = () => new Promise(r => setImmediate(r));
const ok = () => ({ok:true,status:200});
function deferred() { let resolve; const promise = new Promise(r => {resolve=r;}); return {promise,resolve}; }
function rig({bytes = new Map(), reply = async () => ok(), me, characters = []} = {}) {
  let now=100000, id=0, failRead=false, failWrite=false;
  const tasks=new Map(), calls=[], listeners=[];
  if (!bytes.has('relay_token')) bytes.set('relay_token','A1');
  const storage={getItem:k=>{if(failRead)throw Error('storage');return bytes.get(k)??null;},setItem:(k,v)=>{if(failWrite)throw Error('storage');bytes.set(k,v);}};
  // Old source may call ensureAuth; this fixture never creates anonymous accounts.
  const client={get token(){return bytes.get('relay_token');},ensureAuth:async()=>{calls.push({method:'AUTH'});}};
  globalThis.window={MultiplayerClient:{getInstance:()=>client},addEventListener:(type,fn)=>{if(type==='storage')listeners.push(fn);}};
  const c=new CloudSave({storage,now:()=>now,timer:(fn,d)=>{tasks.set(id,{fn,at:now+d});return id++;},cancelTimer:i=>tasks.delete(i),fetcher:async(url,init={})=>{
    const method=init.method||'GET', token=init.headers?.Authorization?.slice(7);
    calls.push({url,method,token,data:init.body&&JSON.parse(init.body)});
    if(url.endsWith('/api/auth/me')) return me?me(token):{...ok(),json:async()=>({id:token?.slice(0,1)})};
    if(method==='GET') return {...ok(),json:async()=>({characters})};
    return reply(token,JSON.parse(init.body));
  }});
  async function advance(ms){const target=now+ms;let n=0;for(;;){const next=[...tasks].sort((a,b)=>a[1].at-b[1].at)[0];if(!next||next[1].at>target)break;assert.ok(++n<100,'bounded jobs');now=next[1].at;tasks.delete(next[0]);next[1].fn();await tick();}now=target;await tick();}
  function bind(save,owner='A'){const slot=save.lineage||'human',key=SLOT_SAVE_KEYS[slot];bytes.set(key,JSON.stringify(save));bytes.set(key+'.cloud-owner.v1',JSON.stringify({v:1,owner,createdAt:save.createdAt}));}
  return {c,bytes,calls,tasks,storage,bind,advance,puts:()=>calls.filter(x=>x.method==='PUT'),setToken:t=>bytes.set('relay_token',t),event:key=>listeners.forEach(fn=>fn({storageArea:storage,key})),failRead:()=>{failRead=true;},failWrite:()=>{failWrite=true;}};
}
test('CS2 A429 then B never replays either slot and preserves local bytes',async()=>{
 const h=rig({reply:async()=>({ok:false,status:429})}),a=human(),b=knight();h.bind(a);h.bind(b);const before=new Map(h.bytes);await h.c.token();h.c.changed(a);h.c.changed(b);await h.advance(300);assert.equal(h.puts().length,2);h.setToken('B1');await h.advance(31000);assert.equal(h.puts().length,2);for(const s of [a,b])assert.equal(h.bytes.get(SLOT_SAVE_KEYS[s.lineage||'human']),before.get(SLOT_SAVE_KEYS[s.lineage||'human']));
});
test('CS2 changed then B before debounce dispatch is PUT0',async()=>{const h=rig(),s=human();h.bind(s);await h.c.token();h.c.changed(s);h.setToken('B1');await h.advance(300);assert.equal(h.puts().length,0);});
test('CS2 exact token must be server confirmed, relay_userId and decoded JWT are not proof',async()=>{
 const h=rig({me:async()=>({ok:false,status:401})}),s=human();h.bind(s);h.bytes.set('relay_userId','A');h.setToken('x.'+Buffer.from(JSON.stringify({sub:'A',exp:9999999999})).toString('base64url')+'.fake');await h.c.token().catch(()=>{});h.c.changed(s);await h.advance(100000);assert.equal(h.puts().length,0);assert.ok(h.calls.some(x=>x.url?.endsWith('/api/auth/me')));
});
test('CS2 delayed server identity A verification cannot bless current B token',async()=>{
 const d=deferred(),h=rig({me:async()=>d.promise}),s=human();h.bind(s);const auth=h.c.token().catch(()=>null);h.c.changed(s);h.setToken('B1');d.resolve({...ok(),json:async()=>({id:'A'})});await auth;await h.advance(300);assert.equal(h.puts().length,0);
});
test('CS2 stale dispatched A response cannot update B maps or dedupe',async()=>{
 const d=deferred(),h=rig({reply:async()=>d.promise}),s=human();h.bind(s);await h.c.token();h.c.changed(s);await h.advance(300);h.setToken('B1');await h.c.token();d.resolve(ok());await tick();assert.equal(h.c.lastHash.size,0);assert.equal(h.c.lastSent.size,0);assert.equal(h.c.remote.size,0);assert.equal(h.puts().length,1);
});
test('CS2 stale GET JSON completion and restore offer cannot cross owners',async()=>{
 const d=deferred(),s=human();s.xp=10;const h=rig({characters:[{charId:'human',data:snapshot(s)}]});await h.c.token();const original=h.c.fetcher;h.c.fetcher=async(u,o)=>u.endsWith('/character')?{...ok(),json:()=>d.promise}:original(u,o);const loading=h.c.load().catch(()=>null);await tick();h.setToken('B1');await h.c.token();d.resolve({characters:[{charId:'human',data:snapshot(s)}]});await loading;assert.equal(h.c.offer('human'),null);assert.throws(()=>h.c.restore('human'));assert.equal(h.bytes.has(SLOT_SAVE_KEYS.human),false);
});
test('CS2 current GET offer becomes unusable immediately on auth change or logout',async()=>{
 const s=human();s.xp=10;const h=rig({characters:[{charId:'human',data:snapshot(s)}]});await h.c.load();assert.ok(h.c.offer('human'));h.setToken('B1');assert.equal(h.c.offer('human'),null);assert.throws(()=>h.c.restore('human'));h.bytes.delete('relay_token');assert.equal(h.c.offer('human'),null);
});
for(const mode of ['A-sidecar+B','legacy','damaged','conflicting','unavailable','write-failure'])test('CS2 reload '+mode+' is PUT0 and leaves local bytes unchanged',async()=>{
 const h=rig(),s=human(),key=SLOT_SAVE_KEYS.human;h.bind(s);const before=h.bytes.get(key);
 if(mode==='A-sidecar+B')h.setToken('B1');if(mode==='legacy')h.bytes.delete(key+'.cloud-owner.v1');if(mode==='damaged')h.bytes.set(key+'.cloud-owner.v1','{');if(mode==='conflicting')h.bytes.set(key+'.cloud-owner.v1',JSON.stringify({v:1,owner:'A',createdAt:99}));if(mode==='unavailable')h.failRead();if(mode==='write-failure')h.failWrite();
 await h.c.load().catch(()=>{});h.c.changed(s);await h.advance(100000);assert.equal(h.puts().length,0);assert.equal(h.bytes.get(key),before);
});
test('CS2 same owner exact-token rotation preserves retry deadline and latest snapshot',async()=>{
 let n=0;const h=rig({reply:async()=>++n===1?{ok:false,status:429}:ok()}),s=human();h.bind(s);await h.c.token();h.c.changed(s);await h.advance(300);h.setToken('A2');s.gold+=7;h.c.changed(s);await tick();await h.c.flush({hidden:true});await h.advance(30999);assert.equal(h.puts().length,1);await h.advance(1);assert.equal(h.puts().length,2);assert.equal(h.puts()[1].token,'A2');assert.equal(h.puts()[1].data.gold,s.gold);assert.ok(h.calls.some(x=>x.url?.endsWith('/me')&&x.token==='A2'));
});
test('CS2 sidecar mutation and cross-tab auth event quarantine pending intents',async()=>{
 for(const mode of ['sidecar','auth-event','save-event']){const h=rig(),s=human();h.bind(s);await h.c.token();h.c.changed(s);if(mode==='sidecar')h.bytes.set(SLOT_SAVE_KEYS.human+'.cloud-owner.v1',JSON.stringify({v:1,owner:'B',createdAt:s.createdAt}));else h.event(mode==='auth-event'?'relay_token':SLOT_SAVE_KEYS.human);await h.advance(300);assert.equal(h.puts().length,0,mode);}
});
test('CS2 PUT401 is auth-blocked without timers, anonymous creation or B replay',async()=>{
 const h=rig({reply:async()=>({ok:false,status:401})}),s=human();h.bind(s);await h.c.token();h.c.changed(s);await h.advance(300);assert.equal(h.puts().length,1);assert.equal(h.tasks.size,0);s.gold++;h.c.changed(s);await h.advance(120000);assert.equal(h.puts().length,1);assert.equal(h.calls.filter(x=>x.method==='AUTH').length,0);h.setToken('B1');await h.c.load().catch(()=>{});await h.advance(100000);assert.equal(h.puts().length,1);
});
test('CS2 verified remote restore into empty slot persists nonsecret owner proof for reload',async()=>{
 const s=human();s.xp=10;const h=rig({characters:[{charId:'human',data:snapshot(s)}]});await h.c.load();h.c.restore('human');const key=SLOT_SAVE_KEYS.human,sidecar=JSON.parse(h.bytes.get(key+'.cloud-owner.v1'));assert.deepEqual(sidecar,{v:1,owner:'A',createdAt:s.createdAt});const r=rig({bytes:h.bytes});await r.c.load();s.gold++;r.c.changed(s);await r.advance(300);assert.equal(r.puts().length,1);assert.equal(r.puts()[0].token,'A1');
});
test('CS2 unbound legacy cannot be claimed by remote offer or restore',async()=>{
 const local=human(),remote=human();remote.xp=10;const h=rig({characters:[{charId:'human',data:snapshot(remote)}]}),key=SLOT_SAVE_KEYS.human;h.bytes.set(key,JSON.stringify(local));const before=h.bytes.get(key);await h.c.load();assert.equal(h.c.offer('human'),null);assert.throws(()=>h.c.restore('human'));assert.equal(h.bytes.get(key),before);assert.equal(h.bytes.has(key+'.cloud-owner.v1'),false);
});

test('CS2 verified A intent awaiting token refresh rejects B at await and dispatch fences',async()=>{
 const d=deferred(),h=rig(),s=human();h.bind(s);await h.c.token();h.c.changed(s);const original=h.c.fetcher;h.c.fetcher=async(u,o)=>u.endsWith('/me')?d.promise:original(u,o);h.setToken('A2');await h.advance(300);h.setToken('B1');d.resolve({...ok(),json:async()=>({id:'A'})});await tick();await h.advance(100000);assert.equal(h.puts().length,0);assert.equal(h.bytes.get(SLOT_SAVE_KEYS.human),JSON.stringify(s));
});
test('CS2 sidecar write failure during verified restore preserves original and backup bytes',async()=>{
 const local=human(),remote=human();remote.xp=10;const h=rig({characters:[{charId:'human',data:snapshot(remote)}]});h.bind(local);await h.c.load();const before=new Map(h.bytes);h.failWrite();assert.throws(()=>h.c.restore('human'));assert.deepEqual(h.bytes,before);
});
test('CS2 401 can resume latest only with a newly server-verified same owner token',async()=>{
 let n=0;const h=rig({reply:async()=>++n===1?{ok:false,status:401}:ok()}),s=human();h.bind(s);await h.c.token();h.c.changed(s);await h.advance(300);s.gold+=8;h.c.changed(s);await h.advance(60000);assert.equal(h.puts().length,1);h.setToken('A2');h.c.changed(s);await tick();await h.advance(300);assert.equal(h.puts().length,2);assert.equal(h.puts()[1].token,'A2');assert.equal(h.puts()[1].data.gold,s.gold);
});
test('CS2 established A sidecar survives actual instance reload but refuses B',async()=>{
 const h=rig(),s=human();h.bind(s);await h.c.token();h.c.changed(s);await h.advance(300);const local=h.bytes.get(SLOT_SAVE_KEYS.human);h.setToken('B1');const reload=rig({bytes:h.bytes});await reload.c.load();reload.c.changed(s);await reload.advance(120000);assert.equal(reload.puts().length,0);assert.equal(reload.bytes.get(SLOT_SAVE_KEYS.human),local);
});
test('CS2 missing token does not invoke anonymous auth and never binds local legacy',async()=>{
 const h=rig(),s=human();h.bytes.delete('relay_token');h.bytes.set(SLOT_SAVE_KEYS.human,JSON.stringify(s));await h.c.load().catch(()=>{});h.c.changed(s);await h.advance(120000);assert.equal(h.puts().length,0);assert.equal(h.calls.length,0);assert.equal(h.bytes.has(SLOT_SAVE_KEYS.human+'.cloud-owner.v1'),false);
});

test('CS2 auth change during sidecar writability check is fenced before PUT dispatch',async()=>{
 const h=rig(),s=human();h.bind(s);await h.c.token();const write=h.storage.setItem;h.storage.setItem=(k,v)=>{write(k,v);h.setToken('B1');};h.c.changed(s);await h.advance(300);assert.equal(h.puts().length,0);assert.equal(h.bytes.get(SLOT_SAVE_KEYS.human),JSON.stringify(s));
});
test('CS2 stale GET response headers are rejected before reading or applying A body',async()=>{
 const d=deferred(),h=rig();await h.c.token();const original=h.c.fetcher;h.c.fetcher=async(u,o)=>u.endsWith('/character')?d.promise:original(u,o);const loading=h.c.load().catch(()=>null);await tick();h.setToken('B1');let reads=0;d.resolve({...ok(),json:async()=>{reads++;return {characters:[]};}});await loading;assert.equal(reads,0);assert.equal(h.c.remote.size,0);
});
test('CS2 partially failed empty restore cannot authorize unrelated local bytes on reload',async()=>{
 const remote=human();remote.xp=10;const h=rig({characters:[{charId:'human',data:snapshot(remote)}]});await h.c.load();const write=h.storage.setItem;h.storage.setItem=(k,v)=>{if(k===SLOT_SAVE_KEYS.human)throw Error('local write');write(k,v);};assert.throws(()=>h.c.restore('human'));assert.equal(h.bytes.has(SLOT_SAVE_KEYS.human),false);const r=rig({bytes:h.bytes});await r.c.load();r.c.changed(human());await r.advance(300);assert.equal(r.puts().length,0);
});
