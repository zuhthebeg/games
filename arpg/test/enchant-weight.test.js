import test from 'node:test';
import assert from 'node:assert/strict';
import { createSave } from '../js/meta/save.js';
import { ITEMS, effectiveWeight, carriedWeight, lootWeight, capacity, equip, instance, strRequirement } from '../js/meta/items.js';
import { deriveMods } from '../js/meta/stats.js';
import { compareItems } from '../js/meta/compare.js';
import { attackRate } from '../js/content/balance.js';
import { linesHtml, splitComparisonHtml, cardHtml, itemDetailsHtml } from '../js/ui/gear-view.js';
import { HubUI } from '../js/ui/hub.js';
import { enchantPresentation } from '../js/ui/enchant-fx.js';

const fresh = () => createSave({name:'경량화 시험',answers:[0,0,0,0,0],createdAt:7});
const close = (a,b) => assert.ok(Math.abs(a-b)<1e-9, `${a} != ${b}`);
const rate = s => {const m=deriveMods(s);return attackRate(m.attackSpeedBonus,m.weaponWeight,carriedWeight(s)/capacity(s));};

test('each enchant reduces only gear weight by 3%, reaches 36% at +12, including temporary loot', () => {
  const s=fresh(),base=carriedWeight(s),weapon=s.items[0],original=ITEMS[weapon.id].weight;
  for(let level=0;level<=12;level++) {
    weapon.enhance=level;
    close(effectiveWeight(weapon),original*(1-.03*level));
    close(carriedWeight(s),base-original*.03*level);
    close(deriveMods(s).weaponWeight,effectiveWeight(weapon));
    close(lootWeight({items:[weapon],stacks:{potion:2}}),effectiveWeight(weapon)+2*ITEMS.potion.weight);
    close(carriedWeight(s,{items:[weapon],stacks:{}}),carriedWeight(s)+effectiveWeight(weapon));
  }
  close(effectiveWeight(weapon)/original,.64);
  close(effectiveWeight(s.items[1]),ITEMS[s.items[1].id].weight);
  const armor=s.items[1];armor.enhance=12;
  close(carriedWeight(s),base-(original+ITEMS[armor.id].weight)*.36);
  const empty=structuredClone(s);empty.equipped.weapon=null;
  assert.equal(deriveMods(empty).weaponWeight,8);
});

test('lighter enhanced weapons raise existing attack rate, reduce load, never lower original strength requirement', () => {
  const s=fresh(),gear=instance('heavy','chief_maul',0,[]),required=ITEMS[gear.id].requiredStr;
  s.items.push(gear);s.stats.str=required;const base=equip(s,gear.uid);
  for(const level of [1,6,12]) {
    const next=structuredClone(base);next.items.find(i=>i.uid===gear.uid).enhance=level;
    assert.ok(rate(next)>rate(base));assert.ok(carriedWeight(next)<carriedWeight(base));
    assert.equal(ITEMS[gear.id].requiredStr,required);assert.equal(strRequirement(ITEMS[gear.id]),required);
    next.stats.str=required-1;
    assert.throws(()=>equip(next,gear.uid),/힘/);
    assert.equal(compareItems(base.items[0],next.items.find(i=>i.uid===gear.uid),next).lockReason,`힘 ${required} 필요`);
  }
});

test('item cards/details and compare weight show effective kg but original strength', () => {
  const s=fresh(),old=instance('old','iron_sword',0,[]),next={...old,uid:'next',enhance:12};
  s.items.push(old,next);s.equipped.weapon=old.uid;
  const c=compareItems(old,next,s),weight=c.lines.find(l=>l.key==='weight');
  close(weight.from,12);close(weight.to,7.68);assert.equal(weight.good,true);
  for(const html of [cardHtml(next,s),itemDetailsHtml(next)]) assert.match(html,/7\.68 kg/);
  assert.match(itemDetailsHtml(next),/필요 힘<\/dt><dd>6/);
  assert.ok(c.lines.find(l=>l.key==='attackRate').delta>0);
});

test('all compare builders hide equal affixes, primary values, enhancement and strength; own details retain them', () => {
  const s=fresh(),old={...instance('old','iron_sword',0,[{k:'capacity_flat',v:5}]),enhance:5};
  const next={...old,uid:'next',affixes:[{k:'capacity_flat',v:5},{k:'hp_flat',v:8}]};
  s.items.push(old,next);s.equipped.weapon=old.uid;
  for(const html of [linesHtml(compareItems(old,next,s)),splitComparisonHtml(next,s)]) {
    assert.doesNotMatch(html,/data-delta="0"|= 유지|compare-delta neutral/);
    for(const key of ['weight','basePower','enhance','requiredStr','capacity_flat']) assert.ok(!html.includes(`data-line="${key}"`),key);
    assert.match(html,/data-line="hp_flat"/);assert.match(html,/▲/);
  }
  assert.doesNotMatch(linesHtml(compareItems(old,old,s))+splitComparisonHtml(old,s),/data-line=/);
  assert.match(itemDetailsHtml(old),/data-detail="capacity_flat"/);
});

test('forge blessed labels list unique capped targets and risky success only, with no unchanged preview rows', () => {
  const h=Object.create(HubUI.prototype);h.save=fresh();h.selectedUid='starter:weapon';h.forgeScroll='scroll_blessed_weapon';
  h.save.stacks.scroll_blessed_weapon=10;
  for(const [level,target,chance] of [[5,'+6 / +7 / +8',null],[9,'+10 / +11 / +12','성공 20%'],[10,'+11 / +12','성공 15%'],[11,'+12','성공 10%']]) {
    h.save.items[0].enhance=level;const {html,footer}=h.forgeDetail();
    assert.ok(html.includes(target));assert.equal((html.match(/축복 · \+1~3/g)||[]).length,1);
    if(chance)assert.ok(html.includes(chance));else assert.doesNotMatch(html,/성공 \d+%/);
    assert.doesNotMatch(html,/무작위|최대 \+6|실패 시|data-delta="0"|= 유지|undefined|NaN/);
    assert.doesNotMatch(footer,/disabled/);
  }
  h.save.items[0].enhance=12;assert.match(h.forgeDetail().footer,/disabled/);
  for(const level of [11,12]) assert.equal(enchantPresentation({id:'training_sword',outcome:'success',from:9,to:level,risky:true}).title,`+${level} 강화 성공!`);
});
