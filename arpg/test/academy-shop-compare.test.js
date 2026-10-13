import test from 'node:test';
import { trained } from './fixtures/trained.js';
import assert from 'node:assert/strict';
import { createSave } from '../js/meta/save.js';
import { ABILITIES } from '../js/content/combat.js';
import { BOOKS, SKILL_DISPLAY, learnSkill } from '../js/meta/skills.js';
import { ITEMS, instance, equippedItem, buy, carriedWeight, capacity, shopPrice } from '../js/meta/items.js';
import { shopStock, buyGear } from '../js/meta/shop.js';
import { compareItems } from '../js/meta/compare.js';
import { HubUI } from '../js/ui/hub.js';
import { SKILL_ART, skillIcon, skillCardHtml, ACADEMY } from '../js/ui/skill-view.js';
import { supplyQuote, purchaseLedgerHtml } from '../js/ui/shop-view.js';
import { splitComparisonHtml } from '../js/ui/gear-view.js';

const fresh = () => ({...createSave({name:'학당 시험',answers:[0,0,0,0,0],createdAt:1}),gold:10000});
function hub(save = fresh()) {
  const h = Object.assign(Object.create(HubUI.prototype), {save,shopId:'potion',shopCount:1,persist:()=>{},dev:false,receipt:null,recoverVitals:()=>{}});
  h.show = (html,page) => {h.html=html;h.page=page;};
  h.mountSheet = html => {h.sheet=html;};
  return h;
}

test('academy preserves trainer action but displays three faculty tabs and ascending grade ladder', () => {
  const h=hub();h.showInn();assert.match(h.html,/<strong>아카데미<\/strong>/);assert.doesNotMatch(h.html,/교관/);
  const before=structuredClone(h.save);
  for(const family of ['blade','bow','focus']) {
    h.action('academy-tab',{family});assert.equal(h.page,'trainer');
    assert.equal((h.html.match(/role="tab"/g)||[]).length,3);
    for(const {name} of Object.values(ACADEMY)) assert.ok(h.html.includes(name));
    assert.match(h.html,new RegExp(`id="academy-tab-${family}"[^>]+aria-selected="true"`));
    assert.deepEqual([...h.html.matchAll(/class="academy-stage" data-grade="(\d)"/g)].map(m=>+m[1]),[0,1,2]);
    const ids=[...h.html.matchAll(/data-skill="([^"]+)"/g)].map(m=>m[1]);
    assert.ok(ids.every(id=>ABILITIES[id].family===family));
    assert.deepEqual(ids.map(id=>SKILL_DISPLAY[id].grade),[...ids.map(id=>SKILL_DISPLAY[id].grade)].sort());
    if(family==='focus') assert.match(h.html,/data-grade="1"[\s\S]+data-skill="healing_light"[\s\S]+data-skill="frost_lance"[\s\S]+class="academy-stage" data-grade="2"/);
  }
  assert.deepEqual(h.save,before,'UI navigation must not mutate the save');
});

test('all twelve silhouettes are distinct SVG fallbacks and only registered local art creates image requests', () => {
  assert.deepEqual(SKILL_ART,{});
  const ids=Object.keys(SKILL_DISPLAY);assert.equal(ids.length,12);
  const faces=ids.map(id=>skillIcon(id));assert.equal(new Set(faces.map(html=>html.match(/<svg[\s\S]+<\/svg>/)[0])).size,12);
  for(const face of faces) {assert.match(face,/viewBox="0 0 64 64"/);assert.doesNotMatch(face,/<img|assets\/skills/);}
  const image=skillIcon('whirl',{whirl:'assets/skills/whirl.webp'});assert.match(image,/<img src="assets\/skills\/whirl.webp"/);assert.doesNotMatch(image,/<svg/);
  assert.match(skillIcon('lunge',{whirl:'assets/skills/whirl.webp'}),/<svg/);
});

test('shared skill cards show type, honest heal/damage, MP/CD and learned/equipped/locked status', () => {
  const s=trained(fresh());
  assert.match(skillCardHtml('lunge',s),/근접 · 돌진[\s\S]+data-action="skill-slot" data-id="lunge" data-slot="0" data-context="academy" aria-pressed="true"/);
  assert.match(skillCardHtml('healing_light',s),/회복 최대 HP 30%/);
  assert.doesNotMatch(skillCardHtml('healing_light',s),/피해 0/);
  assert.match(skillCardHtml('healing_light',s),/28 MP[\s\S]+재사용 10초[\s\S]+미습득 · 200 G/);
  assert.match(skillCardHtml('whirl',{...s,gold:0}),/data-action="learn-skill"[^>]+disabled[\s\S]+골드 부족/);
  const learned=learnSkill(s,'whirl');assert.match(skillCardHtml('whirl',learned),/data-action="skill-slot" data-id="whirl"/);assert.doesNotMatch(skillCardHtml('whirl',learned),/learn-skill/);
  const h=hub(learned);h.showCharacterSkills();assert.match(h.html,/data-skill-icon="whirl"/);h.openSkill('whirl');assert.match(h.sheet,/data-skill-icon="whirl"/);
});

test('supply quote total, remainder and bag projection exactly match the unchanged buy model', () => {
  const s=fresh(),before=structuredClone(s);
  for(const id of ['potion','mana_potion','return_scroll']) {
    const count=id==='return_scroll'?1:3, q=supplyQuote(s,id,count),next=buy(s,id,count);
    assert.equal(q.total,shopPrice(s,id)*count);assert.equal(q.remaining,next.gold);
    assert.equal(q.weightAfter,carriedWeight(next));assert.equal(q.limit,capacity(next));assert.deepEqual(q.reasons,[]);
    const html=purchaseLedgerHtml(q);assert.ok(html.includes(`id="shop-total">${q.total}`));assert.ok(html.includes(`>${q.remaining} G`));
  }
  assert.deepEqual(s,before);
});

test('maximum quantity respects gold, exact capacity, 99 UI bound without a return-scroll cap', () => {
  const s=fresh();assert.equal(supplyQuote(s,'potion',1).maxCount,Math.min(99,Math.floor((capacity(s)-carriedWeight(s))/ITEMS.potion.weight)));
  const poor={...s,gold:shopPrice(s,'potion')*3};assert.equal(supplyQuote(poor,'potion',1).maxCount,3);
  const empty={...s,stacks:{potion:0,mana_potion:0,return_scroll:0}};
  const full=buy(empty,'potion',Math.floor((capacity(empty)-carriedWeight(empty))/ITEMS.potion.weight));
  assert.equal(supplyQuote(full,'potion',1).maxCount,0);assert.match(supplyQuote(full,'potion',1).reasons.join(),/무게 초과/);
  assert.equal(supplyQuote(s,'return_scroll',1).maxCount,99);
  assert.equal(supplyQuote(buy(s,'return_scroll',10),'return_scroll',1).maxCount,99);
  assert.deepEqual(supplyQuote({...full,gold:0},'potion',1).reasons,['골드 부족','무게 초과']);
});

test('purchase card opens sheet; stepper and maximum update totals, reasons and disabled button', () => {
  const h=hub();h.showShop();assert.doesNotMatch(h.html,/id="shop-buy"/);assert.equal((h.html.match(/class="shop-item"/g)||[]).length,3);
  assert.match(h.html,/G \/ 개/);assert.match(h.html,/보유/);assert.match(h.html,/kg/);
  h.action('shop-select',{id:'potion'});assert.equal(h.shopCount,1);assert.match(h.sheet,/id="shop-count"/);assert.match(h.sheet,/data-action="shop-max"/);
  h.action('shop-count',{step:'1'});assert.equal(h.shopCount,2);assert.ok(h.sheet.includes(`id="shop-total">${shopPrice(h.save,'potion')*2}`));
  h.action('shop-max',{});assert.equal(h.shopCount,supplyQuote(h.save,'potion',1).maxCount);
  const gold=h.save.gold;h.action('buy',{});assert.equal(h.save.gold,gold-shopPrice(h.save,'potion')*h.shopCount);
  const poor=hub({...fresh(),gold:0});poor.action('shop-select',{id:'potion'});assert.match(poor.sheet,/id="shop-buy"[^>]+disabled/);assert.match(poor.sheet,/id="purchase-reason"[^>]*>골드 부족/);
  const cap=hub(buy(fresh(),'return_scroll'));cap.action('shop-select',{id:'return_scroll'});assert.doesNotMatch(cap.sheet,/최대 2장/);assert.doesNotMatch(cap.sheet,/id="shop-buy"[^>]+disabled/);
});

test('unique gear purchase shows fixed quantity, stash semantics, owned/weight cards and exact ledger', () => {
  const h=hub(),offer=shopStock(h.save.createdAt,h.save.shopRefresh)[0],before=structuredClone(h.save);
  h.showMerchant();assert.match(h.html,/보유 \d+ · [\d.]+ kg/);assert.match(h.html,/class="p2-delta"/);
  h.openItem(offer.uid,'buy');assert.doesNotMatch(h.sheet,/수량 · 개별 장비|창고로 보관|data-action="noop"/);assert.match(h.sheet,/id="shop-remaining"/);
  const after=buyGear(h.save,offer.uid);assert.ok(h.sheet.includes(`>${after.gold} G`));assert.equal(carriedWeight(before),carriedWeight(after));assert.deepEqual(h.save,before);
  h.save={...h.save,gold:0};h.openItem(offer.uid,'buy');assert.match(h.sheet,/data-action="buy-gear"[^>]+disabled/);assert.match(h.sheet,/id="purchase-reason"[^>]*>골드 부족/);
});

function pair() {
  const s=fresh(),current=instance('current','iron_sword_rare',1,[{k:'hp_flat',v:10},{k:'speed_pct',v:3}]),candidate={...instance('candidate','iron_sword_epic',1,[{k:'atk_pct',v:6},{k:'mana_pct',v:4},{k:'capacity_flat',v:3}]),enhance:2};
  s.items.push(current,candidate);s.equipped.weapon=current.uid;return {s,current,candidate};
}
test('split comparison has matching left/right row labels and preserves every existing numeric line', () => {
  const {s,current,candidate}=pair(),before=structuredClone(s),c=compareItems(current,candidate,s),html=splitComparisonHtml(candidate,s);
  assert.match(html,/<th scope="col">현재 착용/);assert.match(html,/<th scope="col">후보/);
  // All unchanged rows are hidden; every changed line keeps exact data.
  for(const line of c.lines.filter(l=>l.delta!==0)) {
    assert.ok(html.includes(`data-line="${line.key}" data-from="${line.from}" data-to="${line.to}" data-delta="${line.delta}"`));
    const row=html.match(new RegExp(`<tr data-line="${line.key}"[^>]*>([\\s\\S]*?)</tr>`))[1];
    assert.equal((row.match(/<td>/g)||[]).length,2);const labels=[...row.matchAll(/<td><span>([^<]*)<\/span>/g)].map(m=>m[1]);assert.equal(labels[0],labels[1]);
  }
  assert.match(html,/data-line="enhance"/);assert.doesNotMatch(html,/data-line="requiredStr"/);assert.match(html,/최종 캐릭터 변화/);assert.deepEqual(s,before);
});

test('split comparison shows signed gain/loss, no neutral, missing options and all long options folded', () => {
  const {s,candidate}=pair(),html=splitComparisonHtml(candidate,s);
  assert.match(html,/compare-delta gain[^>]*aria-label="▲\+/);assert.match(html,/compare-delta loss[^>]*aria-label="▼−/);assert.doesNotMatch(html,/compare-delta neutral|data-delta="0"/);
  assert.match(html,/data-line="hp_flat"[^>]*><td><span>최대 HP<\/span><b>10 HP<\/b><\/td><td><span>최대 HP<\/span><b>—<\/b>/);
  assert.match(html,/<details class="compare-more"><summary>옵션 3개 더/);assert.doesNotMatch(html,/<details[^>]+open/);
  const h=hub(s);h.openItem(candidate.uid);assert.match(h.sheet,/<details class="compare-more own-details"/);
});

test('empty slot and own-item zero deltas remain explicit without fabricated DEF or damage', () => {
  const s=fresh(),armor=instance('body','leather_vest');s.equipped.body=null;const html=splitComparisonHtml(armor,s);
  assert.match(html,/빈 슬롯/);assert.match(html,new RegExp(`data-line="ac" data-from="0" data-to="${ITEMS.leather_vest.ac}"`));assert.doesNotMatch(html,/DEF|HP 보호/);
  assert.match(splitComparisonHtml(equippedItem(s,'weapon'),s),/변화 없음/);
});

test('buy-then-equip button buys and wears the offer in one step; equip failure buys nothing', () => {
  const h=hub(),offer=shopStock(h.save.createdAt,h.save.shopRefresh).find(o=>!ITEMS[o.id].requiredStr||ITEMS[o.id].requiredStr<=10);
  h.openItem(offer.uid,'buy');assert.match(h.sheet,/data-action="buy-gear"/);assert.match(h.sheet,/구매 후 장착/);
  const gold=h.save.gold;h.action('buy-equip',{uid:offer.uid});
  const worn=h.save.items.find(i=>i.uid===h.save.equipped[ITEMS[offer.id].kind]);
  assert.equal(worn.id,offer.id);assert.equal(h.save.gold,gold-offer.price);assert.ok(h.save.shopBought.includes(offer.uid));
  // Atomic: a throwing equip leaves the save untouched (nothing bought).
  const g=hub(),o2=shopStock(g.save.createdAt,g.save.shopRefresh)[0];g.save={...g.save,stacks:{...g.save.stacks,potion:9999}};
  const snap=structuredClone(g.save);assert.throws(()=>g.action('buy-equip',{uid:o2.uid}));assert.deepEqual(g.save,snap);
  const poor=hub({...fresh(),gold:0});poor.openItem(offer.uid,'buy');assert.doesNotMatch(poor.sheet,/data-action="buy-equip"/);
});
