const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const cases = JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'fixtures.json'),'utf8'));

const groups = Object.groupBy(cases, c=>c.group);
function stripped(s, field) { const out=structuredClone(s); delete out[field]; return out; }

test('each fixture includes full ordered game state and two legal decisions',()=>{
  assert.equal(cases.length,6);
  for (const c of cases) {
    for (const key of ['hand','jokers','handLevels','handsLeft','discardsLeft','deckComposition','bossModifier','score','target']) assert.ok(Object.hasOwn(c.state,key),`${c.id}: ${key}`);
    assert.ok(c.state.hand.length && Array.isArray(c.state.jokers));
    assert.equal(Object.keys(c.choices).length,2);
    assert.ok(Object.hasOwn(c.choices,c.expected));
  }
});
test('joker-order pair changes only order, not other combat state',()=>{
  const [a,b]=groups.joker_order;
  assert.deepEqual(stripped(a.state,'jokers'),stripped(b.state,'jokers'));
  assert.deepEqual(a.state.jokers.map(j=>j.id).sort(),b.state.jokers.map(j=>j.id).sort());
  assert.notEqual(a.expected,b.expected);
});
test('card-order pair changes only order, not card properties',()=>{
  const [a,b]=groups.card_order;
  assert.deepEqual(stripped(a.state,'hand'),stripped(b.state,'hand'));
  assert.deepEqual(a.state.hand.map(c=>c.id).sort(),b.state.hand.map(c=>c.id).sort());
  assert.notEqual(a.expected,b.expected);
});
test('level pair holds all other state constant',()=>{
  const [a,b]=groups.hand_level;
  assert.deepEqual(stripped(a.state,'handLevels'),stripped(b.state,'handLevels'));
  assert.notEqual(a.expected,b.expected);
});

test('recorded GPU results include both candidate orders for every checkpoint/case',()=>{
  const result = JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'results.json'),'utf8'));
  assert.equal(result.records.length,36);
  for (const model of ['english','typed-decisions','multilingual']) {
    const records=result.records.filter(r=>r.model===model);
    assert.equal(records.length,12);
    for (const fixture of cases) {
      const pair=records.filter(r=>r.case===fixture.id);
      assert.deepEqual(pair.map(r=>r.order),['original','reversed']);
      assert.ok(pair.every(r=>r.valid && !r.error_type && Object.hasOwn(fixture.choices,r.choice)));
    }
    assert.equal(result.summary[model].anchor_agreement,records.filter(r=>r.agrees_anchor).length);
  }
});
