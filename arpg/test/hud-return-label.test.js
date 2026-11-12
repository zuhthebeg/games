import test from 'node:test';
import assert from 'node:assert/strict';
import { HUD } from '../js/ui/hud.js';
import { PLAYER_BASE } from '../js/content/combat.js';
import { ticks } from '../js/sim/core.js';

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
  // Match index.html's initial return button before testing reused HUD state.
  nodes.scroll.setAttribute('aria-label', '귀환');
  nodes.scroll.title = '귀환 · R';
  const roots = { '#hud': element(), '#pause': element() };
  globalThis.document = { body: { dataset: {} }, createElement: () => element(), querySelector: key => roots[key] };
  const hud = Object.assign(Object.create(HUD.prototype), { nodes, ritualFeedback: element(), updateParty() {} });
  const begin = (skills, goal = 'timer', loadout = []) => {
    const world = { entities: [{ kind:'player', hp:10,maxHp:10,mp:100,maxMp:100,skills,cds:{},dodge:{cdLeft:0},potions:1,manaPotions:1 }], round: { goal, state:'running', pending:[], t:0, timerTicks:300 } };
    hud.begin(world, loadout);
    return world;
  };
  try { run({ nodes, begin, hud }); } finally { globalThis.document = prior; }
}

function expectName(nodes, sanctuary) {
  assert.equal(nodes.scroll.getAttribute('aria-label'), sanctuary ? '여관으로 돌아가기' : '귀환');
  assert.equal(nodes.scroll.title, sanctuary ? '여관으로 돌아가기 · R' : '귀환 · R');
}
for (const goal of ['timer', 'survival', 'coop']) {
  for (const sequence of [[goal], ['sanctuary', goal], [goal, 'sanctuary', goal, 'sanctuary', goal]]) {
    test('HR1: names follow ' + sequence.join(' → '), () => fixture(({ nodes, begin }) => {
      for (const mode of sequence) {
        begin([], mode);
        expectName(nodes, mode === 'sanctuary');
        assert.deepEqual(['skill','skill2','skill3'].map(key => nodes[key].hidden), [true,true,true], 'HB1 empty slots stay hidden');
      }
    }));
  }
}
test('HR1: return quantity, retry, channel, disabled and world remain unchanged across modes', () => fixture(({ nodes, begin, hud }) => {
  const cases = [
    [{scrolls:3}, '3', false, '0%'],
    [{scrolls:0}, '0', true, '0%'],
    [{scrolls:3,scrollRetry:30}, '3 · 1.0', true, '0%'],
    [{scrolls:3,channel:30}, '1.0', true, `${(1 - 30 / ticks(PLAYER_BASE.scroll.channelMs)) * 100}%`],
    [{scrolls:3,act:{id:'lunge'}}, '3', true, '0%'],
  ];
  for (const goal of ['timer','survival','coop']) {
    for (const [state, text, disabled, progress] of cases) {
      for (const mode of [goal,'sanctuary',goal]) {
        const world = begin([], mode);
        Object.assign(world.entities[0], {scrolls:3,scrollRetry:0,channel:0,act:null}, state);
        const snapshot = JSON.stringify(world);
        hud.update(world, 0);
        expectName(nodes, mode === 'sanctuary');
        assert.equal(nodes.scroll.lastElementChild.textContent, mode === 'sanctuary' ? '나가기' : text);
        assert.equal(nodes.scroll.disabled, mode === 'sanctuary' ? false : disabled);
        assert.equal(nodes.scroll.style.values['--progress'], progress);
        assert.equal(JSON.stringify(world), snapshot, 'HUD must not mutate simulation/save-facing state');
      }
    }
  }
}));
