import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mountDebug, registerDebugAction } from '../js/debug/index.js';
import { CloudSave, snapshot } from '../js/meta/cloud-save.js';
import { CharacterStores } from '../js/meta/selected-character.js';
import { createSave } from '../js/meta/save.js';
import { createSkeletonSave } from '../js/meta/character-creation.js';
import { SLOT_SAVE_KEYS } from '../js/meta/character-slots.js';
const fresh = slot => (slot==='human'?createSave:createSkeletonSave)({lineage:slot,name:'OwnerA',answers:[0,0,0,0,0],createdAt:41});
const tick = () => new Promise(r => setImmediate(r));
function rig(bytes=new Map([['relay_token','A1']])) {
  const puts=[]; let fail=()=>{}, readFail=()=>{};
  const storage={ getItem(k){readFail(k);return bytes.get(k)??null;}, setItem(k,v){if(fail(k,v)!==false)bytes.set(k,v);}, removeItem:k=>bytes.delete(k), key:i=>[...bytes.keys()][i], get length(){return bytes.size;} };
  globalThis.window={addEventListener(){}};
  const cloud=new CloudSave({storage,timer:()=>0,cancelTimer(){},fetcher:async(u,o)=>{
    if(u.endsWith('/me'))return {ok:true,json:async()=>({id:'A'})};
    if(o.method==='PUT'){puts.push(JSON.parse(o.body));return {ok:true,status:200};}
    return {ok:true,json:async()=>({characters:['human','skeleton_knight'].map(slot=>({charId:slot,data:snapshot(fresh(slot))}))})};
  }});
  const characters=new CharacterStores(cloud.characterStorage());
  return {bytes,cloud,characters,puts,fail:fn=>fail=fn,failRead:fn=>readFail=fn};
}
function dom() {
  class Node {
    constructor(){this.listeners=new Map();this.children=[];this.queries=new Map();this.dataset={};}
    append(...nodes){this.children.push(...nodes);}
    replaceChildren(...nodes){this.children=nodes;}
    setAttribute(){}
    addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,[]);this.listeners.get(type).push(fn);}
    querySelector(selector){if(!this.queries.has(selector))this.queries.set(selector,new Node());return this.queries.get(selector);}
    querySelectorAll(){return [];}
    async click(target){for(const fn of this.listeners.get('click')||[])await fn({target,stopPropagation(){}});await tick();}
  }
  const document={head:new Node(),body:new Node(),createElement:()=>new Node()};
  globalThis.document=document;return document;
}
async function mounted(slot='human', withCallback=true) {
  const h=rig();await h.cloud.load();h.cloud.restore(slot);
  const save=slot==='human'?h.characters.selectHuman():h.characters.selectKnight();
  const hub={save,showInn(){}};
  const source=readFileSync(new URL('../js/main.js',import.meta.url),'utf8');
  const wiring=source.match(/importSave: (next => \{[^\n]+\}),/);
  // Invoke the actual small production callback text without booting Pixi/main's browser runtime.
  const importSave=wiring?new Function('characters','cloud','return ('+wiring[1]+');')(h.characters,h.cloud):()=>{throw Error('Missing import ownership wiring');};
  const document=dom();mountDebug({hub,store:{save:next=>h.characters.persist(next)},importSave:withCallback?importSave:undefined,input:{reset(){}},renderer:{},running:false,undead:false});
  const panel=document.body.children.find(n=>n.id==='arpg-debug-panel');
  return {...h,hub,panel,async action(id){await panel.click({closest:()=>({dataset:{debug:id}})});},async import(next){panel.querySelector('#dbg-json').value=JSON.stringify(next);await this.action('import');}};
}
async function reloadHeld(h,slot,expected) {
  assert.deepEqual(JSON.parse(h.bytes.get(SLOT_SAVE_KEYS[slot])),expected);
  const r=rig(h.bytes);await r.cloud.load();await tick();await r.cloud.flush({hidden:true});assert.equal(r.puts.length,0);
  const save=slot==='human'?r.characters.selectHuman():r.characters.selectKnight();save.gold++;
  r.characters.persist(save);r.cloud.changed(save);await r.cloud.flush({hidden:true});assert.equal(r.puts.length,0);
}
for(const slot of ['human','skeleton_knight'])for(const identical of [false,true])test('CS2 actual debug import revokes proof across reload: '+slot+'/'+identical,async()=>{
  const h=await mounted(slot),next=structuredClone(h.hub.save);if(!identical){next.name='ForeignB';next.gold=999;}
  await h.import(next);assert.equal(h.panel.querySelector('#arpg-debug-status').textContent,'저장 완료');
  assert.equal(JSON.parse(h.bytes.get(SLOT_SAVE_KEYS[slot]+'.cloud-owner.v1')).committed,false);await reloadHeld(h,slot,next);
});
for(const mode of ['throw','drop','read'])test('CS2 import invalidation failure denies import and preserves prior local: '+mode,async()=>{
  const h=await mounted(),key=SLOT_SAVE_KEYS.human,old=h.bytes.get(key),next=structuredClone(h.hub.save);next.name='ForeignB';
  if(mode==='throw')h.fail(k=>{if(k===key+'.cloud-owner.v1')throw Error('quota');});
  if(mode==='drop')h.fail(k=>k===key+'.cloud-owner.v1'?false:undefined);
  if(mode==='read')h.failRead(k=>{if(k===key+'.cloud-owner.v1')throw Error('metadata unavailable');});
  await h.import(next);assert.notEqual(h.panel.querySelector('#arpg-debug-status').textContent,'저장 완료');assert.equal(h.bytes.get(key),old);assert.equal(h.hub.save.name,'OwnerA');
});
test('CS2 actual registered extension persistSave is unbound, not implicitly trusted',async()=>{
  const h=await mounted(),next=structuredClone(h.hub.save);next.name='ExtensionB';next.gold=999;
  const unregister=registerDebugAction({group:'Test',label:'External save',run:context=>context.persistSave(next)});
  try{const button=h.panel.querySelector('#dbg-extensions').children[0];await button.click({});assert.equal(JSON.parse(h.bytes.get(SLOT_SAVE_KEYS.human+'.cloud-owner.v1')).committed,false);await reloadHeld(h,'human',next);}finally{unregister();}
});
test('CS2 normal derived debug progression remains cloud-eligible',async()=>{
  const h=await mounted(),before=h.hub.save.gold;await h.action('gold:1000');assert.equal(h.hub.save.gold,before+1000);
  h.cloud.changed(h.hub.save);await h.cloud.flush({hidden:true});assert.equal(h.puts.length,1);assert.equal(h.puts[0].gold,before+1000);
});

test('CS2 malformed JSON never revokes proof or replaces local data',async()=>{
  const h=await mounted(),key=SLOT_SAVE_KEYS.human,old=h.bytes.get(key),proof=h.bytes.get(key+'.cloud-owner.v1');
  h.panel.querySelector('#dbg-json').value='{';await h.action('import');
  assert.equal(h.bytes.get(key),old);assert.equal(h.bytes.get(key+'.cloud-owner.v1'),proof);
});
test('CS2 external extension invalidation failure denies save',async()=>{
  const h=await mounted(),key=SLOT_SAVE_KEYS.human,old=h.bytes.get(key),next=structuredClone(h.hub.save);next.name='ExtensionB';
  h.fail(k=>{if(k===key+'.cloud-owner.v1')throw Error('quota');});
  const unregister=registerDebugAction({group:'Test',label:'Refused external',run:context=>context.persistSave(next)});
  try{await h.panel.querySelector('#dbg-extensions').children[0].click({});assert.equal(h.bytes.get(key),old);assert.equal(h.hub.save.name,'OwnerA');assert.equal(h.panel.querySelector('#arpg-debug-status').textContent,'quota');}finally{unregister();}
});

test('CS2 identical import invalidates already-pending upload without waiting for storage event',async()=>{
  const h=await mounted();h.cloud.changed(h.hub.save);assert.equal(h.cloud.pending.size,1);
  await h.import(structuredClone(h.hub.save));await h.cloud.flush({hidden:true});assert.equal(h.puts.length,0);
});
test('CS2 missing external callback cannot silently fall back to trusted persist',async()=>{
  const h=await mounted('human',false),key=SLOT_SAVE_KEYS.human,old=h.bytes.get(key),next=structuredClone(h.hub.save);next.name='ForeignB';
  await h.import(next);assert.equal(h.bytes.get(key),old);assert.notEqual(h.panel.querySelector('#arpg-debug-status').textContent,'저장 완료');
});
