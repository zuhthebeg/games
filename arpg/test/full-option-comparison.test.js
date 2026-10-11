import test from 'node:test';
import assert from 'node:assert/strict';
import { createSave } from '../js/meta/save.js';
import { ITEMS, instance, enhanceMultiplier, carriedWeight, capacity } from '../js/meta/items.js';
import { deriveMods } from '../js/meta/stats.js';
import { compareItems } from '../js/meta/compare.js';
import { attackRate } from '../js/content/balance.js';
import { loadEffects } from '../js/sim/world.js';
import { AFFIX_LABELS, AFFIX_UNITS } from '../js/meta/affixes.js';
import { HubUI } from '../js/ui/hub.js';
import { linesHtml, cardHtml, itemDetailsHtml, amount } from '../js/ui/gear-view.js';
const fresh = () => createSave({name:'전체 옵션',answers:[0,0,0,0,0],createdAt:1});
const item = (uid,id,affixes,enhance=0) => ({...instance(uid,id,0,affixes),enhance});
const row = (c,key) => c.lines.find(l=>l.key===key);
const close = (a,b) => assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const hubFor = save => Object.assign(Object.create(HubUI.prototype),{save,mountSheet:html=>{},lootState:{},revealed:1});

test('full comparison unions old rare HP/speed losses and new mana; no positive attack can erase either loss',()=>{
  const s=fresh(),old=item('old','iron_sword_rare',[{k:'hp_flat',v:10},{k:'speed_pct',v:3}],1);
  const next=item('next','rune_blade_rare',[{k:'atk_pct',v:6},{k:'mana_pct',v:4}],2);
  s.items.push(old,next);s.equipped.weapon=old.uid;
  const c=compareItems(old,next,s),html=linesHtml(c);
  assert.ok(row(c,'attack').delta>0);
  for(const k of ['hp_flat','speed_pct']) {assert.ok(row(c,k).from>0);assert.equal(row(c,k).to,0);assert.equal(row(c,k).good,false);assert.match(html.match(new RegExp(`<div data-line="${k}"[\\s\\S]*?</div>`))[0],/사라짐 · 손해/);}
  assert.equal(row(c,'mana_pct').from,0);assert.equal(row(c,'mana_pct').to,4);assert.match(html,/새로 추가 · 이득/);
  assert.match(html,/10 HP → <b>0 HP/);assert.match(html,/3% → <b>0%/);assert.match(html,/0% → <b>4%/);
  assert.match(cardHtml(next,s),/옵션 4개 변경 · 2개 사라짐 · 자세히/);
});
test('old capacity/gold/mana losses and unchanged/increased/decreased values are explicit and unit-bearing',()=>{
  const s=fresh(),old=item('old','iron_sword_epic',[{k:'capacity_flat',v:5},{k:'gold_pct',v:5},{k:'mana_pct',v:4}]);
  const next=item('next','iron_sword_epic',[{k:'potion_pct',v:6},{k:'hp_flat',v:8},{k:'material_pct',v:3}]);
  const c=compareItems(old,next,s),html=linesHtml(c);
  for(const k of ['capacity_flat','gold_pct','mana_pct']){assert.equal(row(c,k).to,0);assert.equal(row(c,k).good,false);assert.match(html.match(new RegExp(`<div data-line="${k}"[\\s\\S]*?</div>`))[0],/사라짐/);}
  assert.match(html,/5 kg → <b>0 kg/);
  const mixed=compareItems(old,{...next,affixes:[{k:'capacity_flat',v:5},{k:'gold_pct',v:6},{k:'mana_pct',v:2}]},s);
  for(const [k,text] of [['capacity_flat','= 유지'],['gold_pct','증가 · 이득'],['mana_pct','감소 · 손해']])assert.ok(linesHtml(mixed).match(new RegExp(`<div data-line="${k}"[\\s\\S]*?</div>`))[0].includes(text));
});
test('equipment mass +kg is a loss but capacity +10kg is a gain and the explanations do not conflate them',()=>{
  const s=fresh(),old=s.items[0],next=item('next','rune_blade_epic',[{k:'capacity_flat',v:10}]);
  const c=compareItems(old,next,s);assert.equal(row(c,'capacity_flat').delta,10);assert.equal(row(c,'capacity_flat').good,true);
  assert.ok(row(c,'weight').delta>0);assert.equal(row(c,'weight').good,false);assert.equal(row(c,'capacity').delta,10);assert.equal(row(c,'capacity').good,true);
  assert.equal(AFFIX_LABELS.capacity_flat,'최대 휴대 무게');assert.equal(AFFIX_UNITS.capacity_flat,'kg');
  const details=itemDetailsHtml(next);assert.match(details,/最大|최대 휴대 무게/);assert.match(details,/\+10 kg/);assert.match(details,/가방 한도를 늘리며 장비 자체 무게를 늘리지 않는다/);
  const html=linesHtml(c);assert.match(html,/장비 무게 \(가벼울수록 좋음\)/);assert.match(html,/최대 휴대 무게 \(높을수록 좋음\)/);
});
test('new additive base/enhancement lines show actual power or armor HP, including unchanged zero enhancements',()=>{
  const s=fresh(),old=item('old','iron_sword',[],1),next=item('next','rune_blade',[],3);
  const c=compareItems(old,next,s);assert.equal(row(c,'basePower').from,1.15);assert.equal(row(c,'basePower').to,1.35);
  close(row(c,'enhancePower').from,1.15*(enhanceMultiplier(1)-1));close(row(c,'enhancePower').to,1.35*(enhanceMultiplier(3)-1));
  const a=compareItems(item('oldA','leather_vest',[],0),item('newA','boar_hide_armor',[],2),s);
  assert.equal(row(a,'baseHp').from,20);assert.equal(row(a,'baseHp').to,35);assert.equal(row(a,'enhanceHp').from,0);close(row(a,'enhanceHp').to,35*(enhanceMultiplier(2)-1));
});
test('derived comparison uses real capped drop bonuses and load-aware attack/movement/dodge formulas',()=>{
  const s=fresh();s.stacks.potion=90;
  const old=item('old','training_sword_epic',[{k:'gold_pct',v:7},{k:'dodge_pct',v:6},{k:'mana_pct',v:4}]);
  const next=item('next','rune_blade_epic',[{k:'material_pct',v:5},{k:'capacity_flat',v:10},{k:'speed_pct',v:3}]);
  const head=item('head','head_light_common_t1_epic',[{k:'gold_pct',v:7}]);
  const body=item('body','leather_vest_epic',[{k:'material_pct',v:7}]);
  const hands=item('hands','hands_light_common_t1_epic',[{k:'material_pct',v:7}]);
  s.items.push(old,next,head,body,hands);s.equipped={...s.equipped,weapon:old.uid,head:head.uid,body:body.uid,hands:hands.uid};
  const after=structuredClone(s);after.equipped.weapon=next.uid;
  const beforeMods=deriveMods(s),afterMods=deriveMods(after),c=compareItems(old,next,s);
  close(row(c,'goldBonus').from,7.5);close(row(c,'materialBonus').from,7.5);
  close(row(c,'goldBonus').to,7*15/26);close(row(c,'materialBonus').to,19*15/26);close(row(c,'goldBonus').to+row(c,'materialBonus').to,15);
  for(const [save,mods,side] of [[s,beforeMods,'from'],[after,afterMods,'to']]) {
    const ratio=carriedWeight(save)/capacity(save),load=loadEffects(ratio);
    close(row(c,'attackRate')[side],attackRate(mods.attackSpeedBonus,mods.weaponWeight,ratio));
    close(row(c,'moveSpeed')[side],mods.speedMult*load.speed);close(row(c,'dodgeCooldown')[side],mods.dodgeCdMult*load.dodgeCd);
    close(row(c,'manaRegen')[side],mods.mpRegen);close(row(c,'potionEfficiency')[side],mods.potionHealMult);
  }
  assert.equal(row(c,'gold_pct').to,0);assert.ok(row(c,'goldBonus').to>0,'other equipped gold still contributes');
  // Large AGI remains capped in the existing formulas; presentation must not invent extra action rate.
  const capped={...s,stats:{...s.stats,agi:1000}};const own=compareItems(old,old,capped);assert.ok(row(own,'attackRate').to<=1.2);assert.equal(row(own,'attackRate').delta,0);
});
test('inventory merchant reveal and socket paths all use full loss-inclusive comparison; raw contract fields preserved',()=>{
  const s=fresh(),old=item('old','iron_sword_rare',[{k:'hp_flat',v:10},{k:'speed_pct',v:3}]),next=item('next','rune_blade_rare',[{k:'mana_pct',v:4},{k:'atk_pct',v:6}]);
  s.items.push(old,next);s.equipped.weapon=old.uid;
  const h=hubFor(s);h.mountSheet=html=>h.html=html;h.findOffer=()=>({...next,price:100});
  for(const mode of ['equip','buy','sell']){h.openItem(next.uid,mode);assert.match(h.html,/현재 착용과 후보 비교/);assert.match(h.html,/data-line="hp_flat"[\s\S]*?사라짐/);assert.match(h.html,/data-line="speed_pct"[\s\S]*?사라짐/);assert.match(h.html,/data-line="mana_pct"[\s\S]*?새로 추가/);}
  h.showSocket('weapon');assert.match(h.html,/data-line="hp_flat"/);assert.match(h.html,/data-line="hp_flat" data-from="10" data-to="10"/);assert.match(h.html,/= 유지/);assert.match(h.html,/옵션 4개 변경 · 2개 사라짐/);
  assert.match(h.revealHtml({lootKept:{items:[next]}}),/옵션 4개 변경 · 2개 사라짐/);
  assert.match(cardHtml(next,s,{compact:true}),/옵션 4개 변경 · 2개 사라짐/);
  const c=compareItems(old,next,s);for(const field of ['lines','weightAfter','weightLimit','locked','lockReason'])assert.ok(Object.hasOwn(c,field));
  for(const l of c.lines)for(const field of ['key','label','from','to','delta','good'])assert.ok(Object.hasOwn(l,field));
  assert.equal(row(c,'weight').delta,1);assert.equal(row(c,'hp_flat').from,10);assert.equal(row(c,'hp_flat').to,0);
});
