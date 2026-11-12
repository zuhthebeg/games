import test from 'node:test';
import assert from 'node:assert/strict';
import { HUD } from '../js/ui/hud.js';
import { ABILITIES } from '../js/content/combat.js';

// Minimal DOM supports the real begin/update lifecycle, including stale child removal.
function element(className = '') {
  const classes = new Set(className.split(' '));
  const attributes = new Map();
  const node = { className, textContent: '', children: [], hidden: false,
    dataset: { guard: 'false' }, style: { values: {}, setProperty(k, v) { this.values[k] = v; } },
    classList: { toggle(k, on) { on ? classes.add(k) : classes.delete(k); }, remove(k) { classes.delete(k); }, contains(k) { return classes.has(k); } },
    setAttribute(k, v) { attributes.set(k, v); }, getAttribute(k) { return attributes.get(k) ?? null; }, removeAttribute(k) { attributes.delete(k); },
    querySelector(selector) { return this.children.find(child => selector.split(', ').some(s => child.className.split(' ').includes(s.slice(1)))) ?? null; },
    insertBefore(child, before) { child.parent = this; this.children.splice(this.children.indexOf(before), 0, child); },
    insertAdjacentHTML(_where, html) { const child = element(html.includes('slot-blocked') ? 'slot-blocked' : 'skill-icon'); child.textContent = html.includes('slot-blocked') ? '✕' : ''; child.parent = this; this.children.unshift(child); },
    remove() { this.parent.children.splice(this.parent.children.indexOf(this), 1); },
    get lastElementChild() { return this.children.at(-1); },
  };
  return node;
}
function fixture(run) {
  const prior = globalThis.document;
  const nodes = Object.fromEntries(['hp-fill','hp-text','mp-fill','mp-text','stage-name','objective','green','green-active','potion','mana','scroll','skill','skill2','skill3','dodge','attack','notice','ritual'].map(key => {
    const node = element(); node.children.push(element('status')); return [key, node];
  }));
  const roots = { '#hud': element(), '#pause': element() };
  globalThis.document = { body: { dataset: {} }, createElement: () => element(), querySelector: key => roots[key] };
  const hud = Object.assign(Object.create(HUD.prototype), { nodes, ritualFeedback: element(), updateParty() {} });
  const begin = (skills, goal = 'timer', loadout = []) => {
    const world = { entities: [{ kind:'player', hp:10,maxHp:10,mp:100,maxMp:100,skills,cds:{},dodge:{cdLeft:0},potions:1,manaPotions:1 }], round: { goal, state:'running', pending:[], t:0, timerTicks:300 } };
    hud.begin(world, loadout);
    return world;
  };
  try { run({ nodes, begin }); } finally { globalThis.document = prior; }
}
const ids = Object.keys(ABILITIES).filter(id => !ABILITIES[id].dodgeShot).slice(0, 3);
const slots = nodes => [nodes.skill, nodes.skill2, nodes.skill3];

for (const [count, hidden] of [[0,[true,true,true]],[1,[false,true,true]],[2,[false,false,true]],[3,[false,false,false]]]) {
  test('HB1: ordinary hunt shows exactly ' + count + ' equipped slots', () => fixture(({ nodes, begin }) => {
    begin(ids.slice(0, count));
    assert.deepEqual(slots(nodes).map(n => n.hidden), hidden);
  }));
}

test('HB1: re-entry with no skills clears old names, status and progress', () => fixture(({ nodes, begin }) => {
  begin(ids);
  for (const node of slots(nodes)) { node.lastElementChild.textContent = '2.0'; node.style.setProperty('--progress', '80%'); }
  begin([]);
  for (const node of slots(nodes)) {
    assert.equal(node.hidden, true);
    assert.equal(node.getAttribute('aria-label'), null);
    assert.equal(node.title, '');
    assert.equal(node.querySelector('.skill-label')?.textContent ?? '', '');
    assert.equal(node.querySelector('.skill-icon'), null);
    assert.equal(node.lastElementChild.textContent, '');
    assert.equal(node.style.values['--progress'], '0%');
    assert.equal(node.disabled, true);
  }
}));

test('HB1: sanctuary transitions hide all slots and preserve other combat controls', () => fixture(({ nodes, begin }) => {
  for (const goal of ['timer','survival','coop']) {
    begin(ids, goal);
    begin(ids, 'sanctuary');
    assert.deepEqual(slots(nodes).map(n => n.hidden), [true,true,true]);
    for (const key of ['dodge','attack','green','potion','mana']) assert.equal(nodes[key].hidden, true);
    begin(ids.slice(0,1), goal);
    assert.deepEqual(slots(nodes).map(n => n.hidden), [false,true,true]);
    assert.equal(nodes.attack.hidden, false);
  }
}));

test('HB1: saved weapon-incompatible skill keeps visible disabled cross', () => fixture(({ nodes, begin }) => {
  begin([], 'timer', [ids[0]]);
  assert.deepEqual(slots(nodes).map(n => n.hidden), [false,true,true]);
  assert.equal(nodes.skill.disabled, true);
  assert.equal(nodes.skill.classList.contains('blocked'), true);
  assert.equal(nodes.skill.querySelector('.slot-blocked').textContent, '✕');
  assert.equal(nodes.skill.getAttribute('aria-label'), ABILITIES[ids[0]].name);
}));
