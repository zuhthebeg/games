import test from 'node:test';
import assert from 'node:assert/strict';
import { Graphics, Container } from '../vendor/pixi-8.22.0.min.mjs';
import { HolyVfx, HOLY_CAP } from '../js/render/holy-vfx.js';
import { SkillVfx } from '../js/render/skill-vfx.js';
import { setStatus, setBonuses } from '../js/meta/stats.js';
import { ITEMS } from '../js/meta/items.js';
import { EQUIPMENT_SETS } from '../js/content/equipment-sets.js';
import { itemDetailsHtml, itemSetHtml, cardHtml, activeSetsHtml } from '../js/ui/gear-view.js';
import { createSave } from '../js/meta/save.js';
import { healingFeedback } from '../js/render/healing-feedback.js';
import { eventCues } from '../js/audio-profile.js';
const save = () => createSave({name:'Test',answers:[0,0,0,0,0],weapon:'blade',createdAt:1});
const numeric = ['maxHp','capacity','ac','hpRegen','speed_pct','mpRegen','atk_pct'];
for (const id of Object.keys(EQUIPMENT_SETS)) test(`${id}: every partial tier UI equals the stat source; rarity aliases count once`,()=>{
  const s=save(), catalogue=setStatus(s,id).members, members=[...new Map(catalogue.map(m=>[m.slot,m])).values()];
  s.items.push(...catalogue.map(m=>({uid:m.id,id:m.id,enhance:0,affixes:[]})));
  for(let n=0;n<=members.length;n++){
    if(n){const m=members[n-1];s.equipped[m.slot]=m.id;}
    const status=setStatus(s,id), totals=setBonuses(s), expected={};
    for(const b of status.bonuses)if(b.active)for(const k of numeric)if(b[k])expected[k]=(expected[k]||0)+b[k];
    assert.equal(status.count,n);assert.deepEqual(totals,expected);
    const item=s.items.find(i=>i.id===catalogue[0].id), html=itemDetailsHtml(item,s);
    assert.ok(html.includes(`${status.name} 세트 · 착용 ${n}/${status.parts}`));
    for(const b of status.bonuses)assert.ok(html.includes(`data-active="${b.active}" data-count="${b.count}"`));
    assert.ok(cardHtml(item,s).includes('class="item-set"'));
    if(n)assert.ok(itemSetHtml(item,s).includes(' (착용)'));
    assert.ok(itemSetHtml(item,s).includes('set-members'));
  }
  const m=members[0], alias=Object.keys(ITEMS).find(k=>k!==m.id&&ITEMS[k].baseId===m.id);
  if(alias){s.items.push({uid:'alias',id:alias,enhance:0,affixes:[]});s.equipped[m.slot]='alias';assert.equal(setStatus(s,id).count,members.length);assert.ok(setStatus(s,id).members.find(x=>x.id===m.id).equipped);}
});
test('no-set details and empty active summary are explicit',()=>{const s=save();assert.equal(itemSetHtml(s.items[0],s),'');assert.ok(activeSetsHtml(s).includes('없음'));assert.equal(setStatus(s,'missing'),null);});
for(const success of [false,true])for(const reduced of [false,true])test(`holy ${success}/${reduced}: cap, frozen inputs, frame drawing, expiry and reset`,()=>{
  let allocations=0;class G extends Graphics{constructor(){super();allocations++;}}
  const layer=new Container(), fx=new HolyVfx(G,layer), initial=allocations;
  const world=Object.freeze({entities:Object.freeze([Object.freeze({id:1,x:2,y:4}),Object.freeze({id:2,type:'necropolis_lord',boss:true})])});
  const e=Object.freeze({type:'turnUndead',src:1,dst:2,x:90,y:160,success});
  for(let i=0;i<100;i++)fx.event(e,world,reduced);
  assert.equal(fx.slots.filter(s=>s.left>0).length,HOLY_CAP);assert.equal(fx.slots[0].size,1.6);
  for(let i=0;i<90;i++)fx.update(1/60);
  assert.equal(allocations,initial);assert.ok(layer.children.every(n=>!n.visible));assert.ok(fx.slots.every(s=>s.left===0));
  fx.event(e,world,reduced);fx.reset();assert.ok(layer.children.every(n=>!n.visible));
});
test('authoritative event integrates through SkillVfx and sound differs on resistance',()=>{
 const fx=new SkillVfx(Graphics,new Container());fx.event({type:'turnUndead',ability:'turn_undead',x:1,y:2,success:true},{entities:[]});assert.equal(fx.holy.slots[0].left,1.2);fx.reset();assert.equal(fx.holy.slots[0].left,0);
 assert.equal(eventCues({type:'turnUndead',success:true})[0].name,'heal-cast');assert.equal(eventCues({type:'turnUndead',success:false})[0].name,'blunt-impact');
});

test('holy screen wash and corpse flash are success-only and reduced motion omits wash',()=>{
 for(const reduced of [false,true])for(const success of [false,true]){
  const target={},r={reduced,views:new Map([[2,target]]),number(){}};
  healingFeedback(r,{type:'turnUndead',success,dst:2,x:0,y:0});
  assert.equal(r.holyWashLeft,success&&!reduced?.16:undefined);
  assert.equal(target.holyLeft,success?1.2:undefined);
 }
});
