import test from 'node:test';
import assert from 'node:assert/strict';
import { createSave, SaveStore, SAVE_KEY, validateSave } from '../js/meta/save.js';
import { instance, dismantle, rollDrops } from '../js/meta/items.js';
import { ENCHANT, enhanceMultiplier } from '../js/meta/economy.js';
import { enchant, enchantPreview, crackGreaterStone } from '../js/meta/enchant.js';

const fresh = (createdAt = 7) => createSave({ name: '강화 시험', answers: [0, 0, 0, 0, 0], createdAt });
const W = 'enhance_stone_1', A = W, BW = 'enhance_stone_blessed', CW = 'enhance_stone_cursed';
const withStones = (save, n = 100) => ({ ...save, stacks: { ...save.stacks, [W]: n, [A]: n, [BW]: n, [CW]: n } });
const weaponAt = (save, level) => ({ ...save, items: save.items.map((item) => item.uid === 'starter:weapon' ? { ...item, enhance: level } : item) });

test('safe line: +0→+6 always succeeds, costs exactly five stones and no gold', () => {
  let save = withStones(fresh());
  for (let level = 0; level < ENCHANT.safe; level++) {
    const { save: next, result } = enchant(save, 'starter:weapon', W);
    assert.equal(result.outcome, 'success'); assert.equal(result.from, level); assert.equal(result.to, level + 1);
    assert.equal(result.risky, false);
    assert.equal(next.stacks[W], save.stacks[W] - 5); assert.equal(next.gold, save.gold);
    assert.ok(validateSave(next));
    save = next;
  }
  assert.equal(enchantPreview(save, 'starter:weapon', W).risky, true);
});

test('stones are shared by all slots; insufficient/invalid stone and +12 refuse without spending', () => {
  const save = withStones(fresh());
  assert.ok(enchant(save, 'starter:armor', BW).save);
  assert.ok(enchant(save, 'starter:weapon', CW).save);
  assert.throws(() => enchant(save, 'starter:weapon', 'potion'), /강화석/);
  assert.throws(() => enchant({...save,stacks:{[W]:4}}, 'starter:weapon', W), /부족/);
  assert.throws(() => enchant(fresh(), 'starter:weapon', BW), /부족/);
  for (const id of [W,BW,CW]) assert.throws(() => enchant(weaponAt(save, ENCHANT.max), 'starter:weapon', id), /최대/);
});

test('risky rates over 4,000 accounts match 50/40/30/20/15/10 within ±3σ; failure destroys and refunds half the stones', () => {
  for (const [level, rate] of Object.entries(ENCHANT.rates).map(([l, r]) => [Number(l), r])) {
    let kept = 0;
    const n = 4000;
    for (let seed = 1; seed <= n; seed++) {
      const save = weaponAt(withStones(fresh(seed)), level);
      save.items.push(instance('spare', 'iron_sword', 1, []));
      const { save: next, result } = enchant(save, 'starter:weapon', W);
      assert.ok(validateSave(next), `valid after ${result.outcome}`);
      if (result.outcome === 'success') { kept++; assert.equal(result.to, level + 1); continue; }
      assert.equal(next.items.some((item) => item.uid === 'starter:weapon'), false);
      const refund = Math.floor(ENCHANT.dismantleStones[level] * ENCHANT.failRefund);
      assert.equal(next.stacks.enhance_stone_1 || 0, save.stacks[W] - enchantPreview(save, 'starter:weapon', W).cost + refund);
      assert.equal(next.stacks.enhance_stone_3 || 0, 0);
      assert.equal(next.equipped.weapon, 'spare');
    }
    const sd = Math.sqrt(n * rate * (1 - rate));
    assert.ok(Math.abs(kept - n * rate) <= 3 * sd, `+${level}: kept ${kept}/${n}, expected ${n * rate}`);
  }
});

test('destroying the only weapon re-issues the quiz starter weapon so the save stays launchable', () => {
  let destroyed = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const save = weaponAt(withStones(fresh(seed)), 9);
    const { save: next, result } = enchant(save, 'starter:weapon', W);
    if (result.outcome !== 'destroyed') continue;
    destroyed++;
    const weapon = next.items.find((item) => item.uid === next.equipped.weapon);
    assert.equal(weapon.id, save.items[0].id);
    assert.equal(weapon.enhance, 0); assert.notEqual(weapon.uid, 'starter:weapon');
    assert.ok(validateSave(next));
  }
  assert.ok(destroyed > 100);
});

test('outcome is fixed by the saved attempt counter: replaying the same save never rerolls', () => {
  const save = weaponAt(withStones(fresh(42)), 8);
  const first = enchant(save, 'starter:weapon', W);
  for (let i = 0; i < 5; i++) assert.deepEqual(enchant(save, 'starter:weapon', W), first);
  assert.equal(first.save.enchantCount, 1);
  // The committed save carries the outcome; a reload starts from it, not from before the attempt.
  const storage = new Map();
  const store = new SaveStore({ getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: (k) => storage.delete(k) });
  store.save(first.save);
  assert.deepEqual(store.load(), first.save);
});

test('blessed shares ordinary destroy odds; survivors split safe 50/50 and risky 85/15 without plain stones', () => {
  for (const level of [0,5,6,9,10]) {
    const n=5000, counts=[0,0], p=level<6?.5:.85;let survived=0;
    const ordinary=enchantPreview(weaponAt(withStones(fresh()),level),'starter:weapon',W).chance;
    for(let seed=1;seed<=n;seed++) {
      const base=weaponAt(withStones(fresh(seed)),level), {save,result}=enchant(base,'starter:weapon',BW);
      if(result.outcome==='success'){survived++;counts[result.to-level-1]++;}
      assert.equal(save.stacks[BW],base.stacks[BW]-1);if(result.outcome==='success')assert.equal(save.stacks[W],base.stacks[W]);
      assert.ok(validateSave(save)); assert.equal(enchantPreview(base,'starter:weapon',BW).chance,ordinary);
      assert.deepEqual(enchant(base,'starter:weapon',BW),{save,result});
    }
    if(level<6)assert.equal(survived,n);
    assert.ok(Math.abs(survived-n*ordinary)<=4*Math.sqrt(n*ordinary*(1-ordinary))+1e-9,`${level}: survived ${survived}`);
    assert.ok(Math.abs(counts[0]-survived*p)<4*Math.sqrt(survived*p*(1-p)),`${level}: ${counts}`);
    assert.deepEqual(enchantPreview(weaponAt(withStones(fresh()),level),'starter:weapon',BW).outcomes,[level+1,level+2]);
  }
});

test('cursed conditional -1/0/+1/+2/+3 shares ordinary destruction and keeps no-gain below destruction', () => {
  const n=10000,counts=[0,0,0,0,0];let survived=0;
  for(let seed=1;seed<=n;seed++) {
    const base=weaponAt(withStones(fresh(seed)),7),attempt=enchant(base,'starter:weapon',CW);
    if(attempt.result.outcome==='success'){survived++;counts[attempt.result.to-6]++;}
    assert.equal(attempt.save.stacks[CW],99);if(attempt.result.outcome==='success')assert.equal(attempt.save.stacks[W],100);
    assert.ok(validateSave(attempt.save));assert.deepEqual(enchant(base,'starter:weapon',CW),attempt);
  }
  const ordinary=enchantPreview(weaponAt(withStones(fresh()),7),'starter:weapon',W).chance;
  assert.equal(enchantPreview(weaponAt(withStones(fresh()),7),'starter:weapon',CW).chance,ordinary);
  assert.ok(Math.abs(survived-n*ordinary)<4*Math.sqrt(n*ordinary*(1-ordinary)),`survived ${survived}`);
  assert.ok(counts[0]+counts[1]<n-survived,'no-gain must stay below destruction');
  for(const [i,p] of [.05,.10,.40,.30,.15].entries()) assert.ok(Math.abs(counts[i]-survived*p)<4*Math.sqrt(survived*p*(1-p)),`${counts}`);
  for(const [level,targets] of [[0,[1,2,3]],[19,[18,19,20]]]) {
    assert.deepEqual(enchantPreview(weaponAt(withStones(fresh()),level),'starter:weapon',CW).outcomes,targets);
    const seen=new Set();for(let seed=1;seed<400;seed++) {const {save,result}=enchant(weaponAt(withStones(fresh(seed)),level),'starter:weapon',CW);if(result.outcome==='success')seen.add(result.to);assert.ok(validateSave(save));}
    // +19 survives only 2% now, so sampled outcomes are a subset of the declared targets.
    if(level===0)assert.deepEqual([...seen].sort((a,b)=>a-b),targets);else assert.ok([...seen].every(v=>targets.includes(v)),`${[...seen]}`);
  }
});

test('+20 caps all jumps and save validation while +12 and older saves still roundtrip', () => {
  assert.equal(ENCHANT.max, 20);
  for (const level of [18, 19]) {
    const base = weaponAt(withStones(fresh()), level);
    assert.deepEqual(enchantPreview(base, 'starter:weapon', BW).outcomes, level === 18 ? [19,20] : [20]);
    const seen = new Set();
    for (let seed = 1; seed <= 1000; seed++) {
      const { save, result } = enchant(weaponAt(withStones(fresh(seed)), level), 'starter:weapon', BW);
      assert.ok(validateSave(save));
      if (result.outcome === 'success') {assert.ok(result.to <= 20);seen.add(result.to);}
    }
    assert.deepEqual([...seen].sort(), level === 18 ? [19,20] : [20]);
  }
  const storage = new Map();
  const store = new SaveStore({getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)});
  for (let level = 0; level <= 20; level++) {
    const save = weaponAt(withStones(fresh()), level);
    store.save(save);assert.deepEqual(store.load(),save);
  }
  for (const scroll of [W,BW]) assert.throws(()=>enchant(weaponAt(withStones(fresh()),20),'starter:weapon',scroll), /최대/);
  assert.equal(validateSave(weaponAt(withStones(fresh()),21)),false);
});

test('greater stone keeps 5~10 attempts of value as 25~50 plain stones, seeded and replayable', () => {
  const counts=new Set();
  for(let seed=1;seed<=400;seed++) {
    const base=withStones(fresh(seed));base.stacks.enhance_stone_3=1;
    const attempt=crackGreaterStone(base),{save,result}=attempt;
    assert.equal(result.id,W);assert.ok(result.count>=25&&result.count<=50);assert.equal(result.count%5,0);counts.add(result.count);
    assert.equal(save.stacks.enhance_stone_3,0);assert.equal(save.stacks[W],base.stacks[W]+result.count);
    assert.deepEqual(crackGreaterStone(base),attempt);assert.ok(validateSave(save));
  }
  assert.equal(counts.size,6);assert.throws(()=>crackGreaterStone(fresh()),/상급/);
});

test('dismantle refund scales with enhance; +7 and above also give the greater stone', () => {
  const base = fresh();
  for (let level = 0; level <= ENCHANT.max; level++) {
    const save = structuredClone(base);
    save.items.push({ ...instance('spare', 'iron_sword', 1, []), enhance: level });
    const next = dismantle(save, 'spare');
    assert.equal(next.stacks.enhance_stone_1 || 0, ENCHANT.dismantleStones[level]);
    assert.equal(next.stacks.enhance_stone_3 || 0, ENCHANT.dismantleGreater[level]);
    assert.equal((next.stacks.enhance_stone_3 || 0) > 0, level >= 7);
    assert.ok(validateSave(next));
  }
  // Monotone, and a destroyed item always leaves less than dismantling it would have.
  for (let level = 1; level <= ENCHANT.max; level++) assert.ok(ENCHANT.dismantleStones[level] >= ENCHANT.dismantleStones[level - 1]);
  for (let level = ENCHANT.safe; level < ENCHANT.max; level++) assert.ok(Math.floor(ENCHANT.dismantleStones[level] * ENCHANT.failRefund) < ENCHANT.dismantleStones[level]);
});

test('risky levels hit harder; legacy mid stones convert on load; drops never emit the mid stone', () => {
  assert.ok(Math.abs(enhanceMultiplier(5) - 1.25) < 1e-9);
  assert.ok(enhanceMultiplier(7) - enhanceMultiplier(6) > enhanceMultiplier(6) - enhanceMultiplier(5));
  const legacy = { ...fresh(), stacks: { ...fresh().stacks, enhance_stone_1: 3, enhance_stone_2: 4 } };
  const storage = new Map([[SAVE_KEY, JSON.stringify(legacy)]]);
  const store = new SaveStore({ getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: (k) => storage.delete(k) });
  const loaded = store.load();
  assert.equal(loaded.stacks.enhance_stone_1, 11); assert.equal(loaded.stacks.enhance_stone_2, undefined);
  let blessed = 0;
  for (let seed = 0; seed < 20000; seed++) {
    const loot = rollDrops('goblin_chief', seed, {});
    assert.equal(loot.stacks.enhance_stone_2, undefined);
    blessed += (loot.stacks.enhance_stone_blessed || 0);
  }
  assert.ok(Math.abs(blessed / 20000 - ENCHANT.blessedChance.boss) < 0.015, `boss blessed ${blessed}`);
});

test('forge renders risky odds, danger button and a one-shot result line for success/destroyed', async () => {
  const { HubUI } = await import('../js/ui/hub.js');
  const hub = Object.create(HubUI.prototype);
  hub.save = weaponAt(withStones(fresh()), 7);
  hub.selectedUid = 'starter:weapon';
  hub.showInnPanel = (_title, html, _panel, footer) => { hub.html = html; hub.footer = footer; };
  hub.showForge();
  assert.match(hub.html, /성공 40%/); assert.match(hub.footer, /danger/); assert.match(hub.footer, /성공 40%/);
  hub.forgeNotice = { outcome: 'destroyed', id: 'training_sword', from: 7, to: null, refund: { enhance_stone_1: 5 } };
  hub.showForge();
  assert.match(hub.html, /산산조각.*강화석 5개/);
  hub.showForge();
  assert.doesNotMatch(hub.html, /산산조각/);
  assert.doesNotMatch(hub.html + hub.footer, /undefined|NaN/);
});
test('every enhanced level returns stones on dismantle and no enhance->dismantle loop is profitable (cocy 10-14)', () => {
  for (let level = 1; level <= ENCHANT.max; level++) assert.ok(ENCHANT.dismantleStones[level] >= 1, `+${level}`);
  for (let level = 1; level < ENCHANT.safe; level++) assert.ok(ENCHANT.dismantleStones[level] < level * ENCHANT.stonesPerAttempt);
});

test('removed scroll saves reject safely and valid special stones load normally', () => {
  for(const id of ['scroll_enchant_weapon','scroll_enchant_armor','scroll_blessed_weapon','scroll_blessed_armor']) {
    const old=fresh();old.stacks[id]=1;
    const data=new Map([[SAVE_KEY,JSON.stringify(old)]]),store=new SaveStore({getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)});
    assert.equal(validateSave(old),false);assert.doesNotThrow(()=>assert.equal(store.load(),null));
  }
});

test('forge salvage shows and pays exact plain/greater refund for dropped enhanced gear', async () => {
 const {HubUI}=await import('../js/ui/hub.js');const h=Object.create(HubUI.prototype);h.save=withStones(fresh());h.selectedUid='drop:42:weapon';h.save.items.push({...instance(h.selectedUid,'iron_sword',1,[]),enhance:9});
 assert.match(h.forgeSalvageHtml(),/강화석: 18.*상급 강화석: 2/);
 const next=dismantle(h.save,h.selectedUid);assert.equal(next.stacks[W]-h.save.stacks[W],18);assert.equal(next.stacks.enhance_stone_3,2);
});
