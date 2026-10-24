import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { ITEMS, instance, craft, dismantle, dismantleMaterial, dismantleRefund, rollDrops, carriedWeight, capacity } from '../js/meta/items.js';
import { MATERIAL_STACK, SALVAGE, ECONOMY, ENCHANT, RECIPES } from '../js/meta/economy.js';
import { createSave, validateSave, SaveStore, SAVE_VERSION } from '../js/meta/save.js';
import { sellStack, sellItem } from '../js/meta/shop.js';
import { questReward } from './fixtures/quest-rewards.js';
import { HubUI } from '../js/ui/hub.js';
import { MONSTERS } from '../js/content/combat.js';
import { projectLegacyStones } from './fixtures/greater-stone-drop-cases.js';

const fresh = () => createSave({ name: 'C1', answers: [0,0,0,0,0], createdAt: 123 });
const rich = () => ({ ...fresh(), gold: 10000, stacks: { ...fresh().stacks,
  ...Object.fromEntries(Object.values(MATERIAL_STACK).concat(['fang','frost_shard','dragon_scale']).map(id => [id,100])) } });
const roundtrip = save => {
  const data = new Map();
  const store = new SaveStore({getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,v), removeItem: k => data.delete(k)});
  assert.ok(validateSave(save)); store.save(save); assert.deepEqual(store.load(), save);
  return store.load();
};
const freeze = value => { if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); } return value; };

test('C1 all equipment and rarity variants inherit one primary material; explicit body/weapon/slot themes', () => {
  for (const [id, def] of Object.entries(ITEMS).filter(([,d]) => d.slot)) {
    assert.ok(Object.hasOwn(MATERIAL_STACK, def.material), id);
    assert.equal(def.material, ITEMS[def.baseId].material, id);
    assert.equal(ITEMS[MATERIAL_STACK[def.material]].material, def.material);
  }
  for (const [id, material] of Object.entries({ training_sword:'metal', iron_sword:'metal', rune_blade:'rune',
    short_bow:'wood', ember_wand:'wood', altar_staff:'wood', seal_staff:'wood', cloth_tunic:'cloth',
    woven_armor:'cloth', leather_vest:'leather', boar_hide_armor:'leather', warden_plate:'metal',
    head_light_common_t1:'metal', hands_medium_fine_t2:'leather', feet_heavy_fine_t3:'metal' })) assert.equal(ITEMS[id].material, material, id);
});

test('C1 every equipment rarity yields only its primary material plus unchanged +0..+12 stones, no tier bonus', () => {
  for (const [id, def] of Object.entries(ITEMS).filter(([,d]) => d.slot)) for (let level=0; level<=ENCHANT.max; level++) {
    const item = { ...instance('salvage', id, 42), enhance: level }, base = fresh(); base.items.push(item);
    const next = dismantle(freeze(base), item.uid), primary = MATERIAL_STACK[def.material];
    assert.equal(dismantleMaterial(item), primary); assert.equal(dismantleRefund(item), SALVAGE[def.rarity]);
    assert.deepEqual(next.stacks, { ...base.stacks, [primary]:SALVAGE[def.rarity],
      ...(ENCHANT.dismantleStones[level] + ENCHANT.dismantleGreater[level] * 38 ? {enhance_stone_1:ENCHANT.dismantleStones[level] + ENCHANT.dismantleGreater[level] * 38} : {}) });
    assert.deepEqual(next.items, base.items.slice(0,-1)); assert.equal(next.gold, base.gold);
  }
});

test('C1 authored recipe costs unchanged; exact consumption, deterministic affixes/UID and 25% primary refund persist', () => {
  const prices = {iron_sword:60,hunter_bow:60,ember_wand:60,boar_hide_armor:50,leather_vest:40,rune_blade:140,rune_maul:140,warden_maul:240,pack_bow:140,altar_staff:140,woven_armor:140};
  assert.deepEqual(Object.fromEntries(Object.entries(RECIPES).filter(([id]) => Object.hasOwn(prices,id)).map(([id,r]) => [id,r.gold])), prices);
  for (const [id, recipe] of Object.entries(RECIPES)) {
    const base = freeze(rich()), made = craft(base, id), item = made.items.at(-1), primary = dismantleMaterial(item);
    assert.ok(recipe[primary] > 0); assert.deepEqual(made, craft(base,id));
    assert.equal(made.gold, base.gold-recipe.gold);
    for (const [key,count] of Object.entries(recipe)) if (key !== 'gold') assert.equal(made.stacks[key],base.stacks[key]-count);
    assert.equal(dismantleRefund(item),Math.floor(recipe[primary]*ECONOMY.craftRefundFraction));
    const loaded = roundtrip(made), salvaged = dismantle(loaded,item.uid);
    assert.equal(salvaged.stacks[primary],base.stacks[primary]-recipe[primary]+Math.floor(recipe[primary]/4));
    assert.deepEqual(salvaged.items,base.items); assert.equal(salvaged.version,SAVE_VERSION); roundtrip(salvaged);
    const twice = craft(loaded,id); assert.notEqual(twice.items.at(-1).uid,item.uid);
    assert.equal(new Set(twice.items.map(i=>i.uid)).size,twice.items.length);
    assert.equal(dismantleRefund(twice.items.at(-1)),dismantleRefund(item));
  }
});

test('C1 material sell + craft/refund and repeated craft/sell cannot mint resources or gold', () => {
  const worth = save => save.gold + Object.entries(save.stacks).reduce((sum,[id,n]) => sum + n*(ITEMS[id].sell || 0),0);
  for (const id of Object.keys(RECIPES)) {
    const base=rich(); for(const k of Object.keys(base.stacks))if(ITEMS[k].kind==='material')base.stacks[k]=200; let save=base;
    for(let n=0;n<4;n++) {
      const made=craft(save,id), item=made.items.at(-1), primary=dismantleMaterial(item);
      const salvage=dismantle(made,item.uid);
      assert.ok(worth(salvage)<worth(save)); assert.ok(worth(sellItem(made,item.uid))<worth(save));
      assert.ok(salvage.stacks[primary]<save.stacks[primary]);
      const cashed=sellStack(salvage,primary,dismantleRefund(item)); assert.ok(worth(cashed)<worth(save));
      save=salvage;
    }
  }
});

test('C1 worn/missing/duplicate IDs and missing/negative quantities fail atomically; full bag/inventory retain existing semantics', () => {
  const base=freeze(fresh());
  for(const uid of ['missing',base.equipped.weapon,base.equipped.body]) assert.throws(()=>dismantle(base,uid));
  assert.throws(()=>craft(base,'missing')); assert.throws(()=>craft(base,'hunter_bow'));
  const duplicate=rich();duplicate.items.push(instance('dup','short_bow'),instance('dup','leather_vest'));
  const before=structuredClone(duplicate);assert.throws(()=>dismantle(duplicate,'dup'),/중복/);assert.deepEqual(duplicate,before);
  assert.equal(validateSave(duplicate),false);
  for(const count of [-1,0,0.5,NaN,Infinity,101]) assert.throws(()=>sellStack(freeze(rich()),'wood',count));
  for(const count of [-1,0,0.5,NaN]) {
    const old=RECIPES.hunter_bow.wood;
    try { RECIPES.hunter_bow.wood=count;assert.throws(()=>craft(freeze(rich()),'hunter_bow'),/수량/); }
    finally { RECIPES.hunter_bow.wood=old; }
  }
  const missing=rich();delete missing.stacks.wood;assert.throws(()=>craft(freeze(missing),'hunter_bow'),/목재/);
  const negative=rich();negative.stacks.wood=-1;assert.equal(validateSave(negative),false);assert.throws(()=>craft(freeze(negative),'hunter_bow'));
  const full=rich();full.stacks.potion=Math.floor((capacity(full)-carriedWeight(full))/ITEMS.potion.weight)+full.stacks.potion;
  for(let n=0;n<300;n++) full.items.push(instance(`full:${n}`,'short_bow'));
  const weight=carriedWeight(full), made=craft(freeze(full),'hunter_bow');
  assert.equal(made.items.length,full.items.length+1);assert.equal(carriedWeight(made),weight);
  roundtrip(made);const salvaged=dismantle(made,made.items.at(-1).uid);assert.equal(carriedWeight(salvaged),weight);roundtrip(salvaged);
});

test('C1 existing uncrafted and craft-UID saves need no schema migration and keep 25% rule', () => {
  const old=rich(); old.items.push(instance('craft:hunter_bow:1','hunter_bow',9));
  const saved=roundtrip(old), next=dismantle(saved,'craft:hunter_bow:1');
  assert.equal(next.stacks.wood,102); assert.equal(next.stacks.scrap,100);roundtrip(next);
});

test('C1 UI recipes/refunds use actual labels and values, worn disabled, no undefined quantities', () => {
  const hub=Object.create(HubUI.prototype);hub.save=rich();hub.forgeTab='craft';hub.showInnPanel=(_title,html)=>hub.html=html;
  hub.forgeRecipeMode='all';hub.showForge();assert.match(hub.html,/목재: 100 \/ 8/);assert.match(hub.html,/룬 조각: 100 \/ 16/);assert.match(hub.html,/거미줄: 100 \/ 16/);
  assert.doesNotMatch(hub.html,/제작 · 고철과 재료|undefined|NaN/);
  for(const id of ['short_bow','leather_vest','cloth_tunic','rune_blade','iron_sword']) {
    const item=instance('ui',id);assert.equal(hub.dismantleText(item),`${ITEMS[dismantleMaterial(item)].name}: ${SALVAGE[ITEMS[id].rarity]}`);
  }
});

test('C1 wood reaches the actual S2/S5 quest bag and settlement/save without extra material rolls', () => {
  for(const stageId of ['S2','S5']) {
    let obtained=0;
    for(let seed=1;seed<=20;seed++) {
      const result=questReward(stageId,seed);
      const amount=result.tracker.tempLoot.stacks.wood || 0;
      obtained+=amount;
      assert.equal(result.save.stacks.wood || 0, amount);
      assert.equal(result.receipt.lootKept.stacks.wood || 0, amount);
      roundtrip(result.save);
    }
    assert.ok(obtained>0,stageId);
  }
});

// Load the committed baseline in a fresh node process: compare actual previous seeded drops,
// not a rewritten oracle. B deliberately tunes gear/materials, preserving independent streams.
test('B 1,000 seeds per monster retain pre-B gold, consumables and stone bytes', () => {
  // Preserve all original nine seeded-drop baselines; main's three and U1's four additions are explicit.
  const baselineIds = ['scarecrow','goblin_grunt','goblin_slinger','iron_boar','goblin_chief','wolf','rune_guardian','spirit','poison_spider'];
  assert.deepEqual(Object.keys(MONSTERS).filter(id => !baselineIds.includes(id)),
    ['throne_dragon','training_dragon','gargoyle','necropolis_lord','skeleton_minion','skeleton_warrior','skeleton_rogue','skeleton_mage','ghoul','ghost','bat','demon','goleling','slime','succubus','undead_lab_human_melee','ash_reaver','veil_stalker','cinder_oracle','orc_raider','frost_yeti','stone_giant','marsh_wasp','bog_wizard','mire_frog','dune_cactoro','sun_totem','crown_alpaking','spore_mushnub','gale_hywirl','spore_king','abyss_glub','drowned_skull','abyss_squidle','clock_drone','clock_walker','clock_colossus','sky_armabee','sky_pigeon','sky_birb']);
  assert.ok(baselineIds.every(id => Object.hasOwn(MONSTERS, id)));
  const oldItems=execFileSync('git',['show','5f82b40:arpg/js/meta/items.js'],{encoding:'utf8'});
  const oldLoot=execFileSync('git',['show','5f82b40:arpg/js/content/loot.js'],{encoding:'utf8'});
  const oldEconomy=execFileSync('git',['show','5f82b40:arpg/js/meta/economy.js'],{encoding:'utf8'});
  const script=`const root=new URL(${JSON.stringify(new URL('../js/meta/', import.meta.url).href)});
    let src=${JSON.stringify(oldItems)}.replace(/from '([^']+)'/g,(_,p)=>'from '+JSON.stringify(new URL(p,root).href));
    src=src.replace(new URL('../content/loot.js',root).href,'data:text/javascript;base64,'+Buffer.from(${JSON.stringify(oldLoot)}).toString('base64'));
    src=src.replaceAll(new URL('economy.js',root).href,'data:text/javascript;base64,'+Buffer.from(${JSON.stringify(oldEconomy)}.replace('../content/balance.js',new URL('../content/balance.js',root).href)).toString('base64'));
    const {rollDrops}=await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
    const out=[];for(const m of ${JSON.stringify(baselineIds)}) for(let seed=0;seed<1000;seed++) out.push(rollDrops(m,seed,{materialBonus:7,threat:2}));
    console.log(JSON.stringify(out));`;
  const old=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8',maxBuffer:16*1024*1024}));
  const stable = loot => ({gold:loot.gold,stacks:Object.fromEntries(Object.entries(loot.stacks).filter(([id])=>ITEMS[id]?.kind==='consumable'||id.startsWith('enhance_stone')))});
  const basic = Object.fromEntries(['scrap','hide','wood','web','fang'].map(id=>[id,{before:0,after:0}]));
  let index=0;
  for(const m of baselineIds) for(let seed=0;seed<1000;seed++) {
    const expected=old[index++];
    const actual=rollDrops(m,seed,{materialBonus:7,threat:2});
    // Large guardian now uses the approved boss reward rank; every other historical stream is exact.
    if(m!=='rune_guardian')assert.deepEqual(stable(actual),projectLegacyStones(stable(expected)),`${m}:${seed}`);
    assert.deepEqual(actual,rollDrops(m,seed,{materialBonus:7,threat:2}));
    for(const id of Object.keys(basic)){basic[id].before+=expected.stacks[id]||0;basic[id].after+=actual.stacks[id]||0;}
  }
  for(const [id,row] of Object.entries(basic))assert.ok(Math.abs(row.after/row.before-1.5)<.025,`${id}: ${row.after/row.before}`);
  console.log('B basic material old/new',JSON.stringify(basic));
  assert.equal(ITEMS.wood.weight,ITEMS.scrap.weight);assert.equal(ITEMS.wood.sell,ITEMS.scrap.sell);
  assert.equal(rollDrops('wolf',0).stacks.wood,3);
});
