import { withoutCombos } from './av1-dps.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { BALANCE, attackRate } from '../js/content/balance.js';
import { ABILITIES, WEAPONS } from '../js/content/combat.js';
import { createSave } from '../js/meta/save.js';
import { deriveMods } from '../js/meta/stats.js';
import { buildRoundMods } from '../js/meta/run.js';
import { compareItems } from '../js/meta/compare.js';
import { effectiveWeight, carriedWeight, capacity } from '../js/meta/items.js';
import { linesHtml, splitComparisonHtml } from '../js/ui/gear-view.js';
import { createWorld, addPlayer, spawnMonster, step, emptyInput, setLoad } from '../js/sim/world.js';
import { ticks } from '../js/sim/core.js';
const fresh = weapon => createSave({ name:'W1', answers:[0,0,0,0,0], weapon, createdAt:1 });
const gear = (uid, id, enhance=0) => ({ uid, id, enhance, affixes:[] });
const close = (a,b) => assert.ok(Math.abs(a-b)<1e-9, `${a} != ${b}`);

for (const family of ['blade','bow','focus']) {
  test(`${family}: <=6kg body is neutral; 12kg slows by family and retains floor`, () => {
    for (const agi of [0,.1,.2]) for (const weight of [0,6,8,24]) for (const load of [0,.8,1.2]) {
      const legacy = attackRate(agi,weight,load);
      for (const armor of [0,4,6]) assert.equal(attackRate(agi,weight,load,armor,family),legacy);
    }
    close(attackRate(0,8,0,12,family),1/(1+6*BALANCE.attackSpeed.armorPerKg[family]));
    assert.equal(attackRate(0,24,1.2,1000,family),BALANCE.attackSpeed.min);
    for(let armor=6;armor<40;armor++) {
      const rate=attackRate(.2,8,.9,armor,family);
      assert.ok(rate>=BALANCE.attackSpeed.min && rate<=BALANCE.attackSpeed.max);
      assert.ok(attackRate(.2,8,.9,armor+1,family)<=rate);
    }
  });
}
test('12kg body: bow ~19.35%, focus ~13.04%, blade ~8.26% slower at reference weapon mass', () => {
  const bow=attackRate(0,8,0,12,'bow'), focus=attackRate(0,8,0,12,'focus'), blade=attackRate(0,8,0,12,'blade');
  assert.ok(bow<focus && focus<blade);
  close(1-bow,6/31); close(1-blade,9/109);
});
test('meta/round mods use E1 effective BODY mass only; stronger enchant speeds heavy armor', () => {
  const s=fresh('bow'), body=gear('body','boar_hide_armor');
  s.items.push(body,gear('head','head_heavy_common_t1'),gear('spare','warden_plate'));
  s.equipped.body=body.uid; s.equipped.head='head';
  assert.equal(deriveMods(s).armorWeight,12);
  body.enhance=12;
  close(deriveMods(s).armorWeight,7.68);
  assert.equal(buildRoundMods(s).armorWeight,effectiveWeight(body));
  assert.ok(attackRate(0,6,0,deriveMods(s).armorWeight,'bow')>attackRate(0,6,0,12,'bow'));
  s.equipped.body=null; assert.equal(deriveMods(s).armorWeight,0);
});
for (const weapon of ['blade','bow','focus']) for (const skill of [false,true]) {
  test(`${weapon} ${skill?'skill':'basic'} samples body mass at act start, freezes phases; cooldown unchanged`, () => {
    const w=createWorld({seed:72}),p=addPlayer(w,{pid:'p',weapon,mods:{armorWeight:12,weaponWeight:8,mpRegen:0}});
    assert.equal(p.armorWeight,12);
    step(w,{p:{...emptyInput(),attack:!skill,skillEdge:skill,aimX:1}});
    const id=WEAPONS[weapon][skill?'skill':'basic'], def=ABILITIES[id];
    const rate=attackRate(0,8,0,12,weapon); assert.equal(p.act.rate,rate);
    const phases=structuredClone(p.act.phaseTicks);
    for (const phase of ['windup','lock','active','recovery']) {
      const ms=def[`${phase}Ms`]||0;
      assert.equal(phases[phase],ms||phase==='active'?Math.max(1,ticks(ms/rate)):0);
    }
    p.armorWeight=100; setLoad(w,'p',1.2);
    let duration=1;
    while(p.act) {assert.deepEqual(p.act.phaseTicks,phases);assert.equal(p.act.rate,rate);step(w);duration++;}
    assert.equal(duration,Object.values(phases).reduce((a,b)=>a+b,0));
    assert.equal(p.cds[id]||0,ticks(def.cooldownMs));
  });
}
test('body comparisons use actual family/mass/E1 and existing UI shows arrows only for changed rate', () => {
  const s=fresh('bow'),light=gear('light','cloth_tunic'),heavy=gear('heavy','boar_hide_armor');
  s.items.push(light,heavy);s.equipped.body=light.uid;
  const c=compareItems(light,heavy,s), row=c.lines.find(l=>l.key==='attackRate');
  for (const [item,side] of [[light,'from'],[heavy,'to']]) {
    const copy=structuredClone(s);copy.equipped.body=item.uid;const mods=deriveMods(copy);
    close(row[side],attackRate(mods.attackSpeedBonus,mods.weaponWeight,carriedWeight(copy)/capacity(copy),mods.armorWeight,mods.family));
  }
  assert.ok(row.delta<0);assert.equal(row.good,false);
  assert.match(linesHtml(c),/data-line="attackRate"[\s\S]*?▼/);
  assert.match(splitComparisonHtml(heavy,s),/data-line="attackRate"[\s\S]*?▼/);
  s.equipped.body=heavy.uid;
  assert.match(splitComparisonHtml(light,s),/data-line="attackRate"[\s\S]*?▲/);
  const enhanced={...heavy,enhance:12};
  assert.ok(compareItems(heavy,enhanced,s).lines.find(l=>l.key==='attackRate').delta>0);
  const same=compareItems(light,{...light,uid:'same'},s);
  assert.equal(same.lines.find(l=>l.key==='attackRate').delta,0);
  assert.doesNotMatch(linesHtml(same),/data-line="attackRate"/);
  s.equipped.body=light.uid;
  assert.doesNotMatch(splitComparisonHtml({...light,uid:'same'},s),/data-line="attackRate"/);
});
// Captured from untouched bf5bb31 before W1 implementation; never regenerate to accept a regression.
// Re-pinned 10-12 on main 32ffb48 without W1 (pre-W1 sim), verified byte-identical with W1 applied.
const legacyDigest={
 // Re-pinned 10-14 for melee guard ×0.8 + slash 16 (cocy); proven identical to the old digest with guard=1/slash=14.
 blade:'2ba5682ad95c9724e6b4962256c99765b8eec62edbef4a405ea3b3d03becbb4f',
 bow:'521de05aeb8ddcae1acedb376ace615dd0b07b369248aa934bc822ad3563cd9f',
 focus:'3470a5aa2db0240bed2c145e27d979057aafa41d740e09ea6bae002f6bcd8633',
};
for (const weapon of ['blade','bow','focus']) test(`${weapon}: missing/zero armor combo-disabled keeps pre-W1 whole-world/event trace digest byte-identical`, () => withoutCombos(() => {
  for (const extra of [{},{armorWeight:0}]) {
    const w=createWorld({seed:72});addPlayer(w,{pid:'p',weapon,x:400,y:400,mods:{maxHp:10000,...extra}});
    const e=spawnMonster(w,'goblin_grunt',610,400);e.spawnLeft=0;
    const trace=[];
    for(let t=0;t<240;t++) {
      if(t===120)setLoad(w,'p',1.1);
      trace.push(structuredClone(step(w,{p:{...emptyInput(),attack:t%50<30,skillEdge:t===80||t===180,dodgeEdge:t===40,aimX:1,mx:t===40?1:0}})));
    }
    const digest=createHash('sha256').update(JSON.stringify({world:w,trace},(k,v)=>k==='def'?undefined:v)).digest('hex');
    assert.equal(digest,legacyDigest[weapon]);
  }
}));

test('guest prediction applies the same armor slowdown as the host step', async () => {
  const { createWorld, addPlayer, startStage, step, emptyInput } = await import('../js/sim/world.js');
  const { encodeSnapshot, decodeSnapshot } = await import('../js/net/protocol.js');
  const { predictPlayerTick } = await import('../js/net/player-prediction.js');
  for (const weapon of ['bow', 'blade', 'focus']) {
    const world = createWorld({ seed: 5 });
    addPlayer(world, { pid: 'g', weapon, mods: { armorWeight: 14, weaponWeight: 9, attackSpeedBonus: .1 } });
    startStage(world, 'S2'); world.entities = world.entities.filter(e => e.kind === 'player');
    world.round.pending = []; world.round.goal = 'timer'; world.round.timerTicks = 1e6;
    let acts = 0;
    for (let t = 0; t < 600; t++) {
      const input = { ...emptyInput(), attack: t % 50 < 30, mx: t % 80 < 40 ? 1 : -1, skillEdge: t % 97 === 0 };
      const view = decodeSnapshot(JSON.parse(JSON.stringify(encodeSnapshot(world, { g: 0 }))), 'g');
      assert.equal(view.entities[0].armorWeight, 14);
      const predicted = predictPlayerTick(view.entities[0], input, { arena: world.arena, others: view.entities.slice(1) });
      step(world, { g: input });
      const host = world.entities[0];
      if (host.act?.phase === 'windup' && host.act.elapsed === 1) acts++;
      assert.equal(predicted.act?.id ?? null, host.act?.id ?? null, `${weapon} t${t}`);
      assert.equal(predicted.act?.left ?? null, host.act?.left ?? null, `${weapon} t${t}`);
      assert.deepEqual(predicted.act?.phaseTicks ?? null, host.act?.phaseTicks ?? null, `${weapon} t${t}`);
    }
    assert.ok(acts > 3, `${weapon} acts ${acts}`);
  }
});
