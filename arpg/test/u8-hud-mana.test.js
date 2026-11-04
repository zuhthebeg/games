import test from 'node:test';
import assert from 'node:assert/strict';
import { HUD } from '../js/ui/hud.js';
import { ABILITIES } from '../js/content/combat.js';

function fixture() {
  const node = () => {
    const classes = new Set();
    return { textContent: '', lastElementChild: { textContent: '' }, style: { setProperty() {} },
      dataset: { guard: 'false' }, setAttribute() {}, querySelector() { return null; },
      classList: { toggle(key, on) { on ? classes.add(key) : classes.delete(key); },
        remove(key) { classes.delete(key); }, contains(key) { return classes.has(key); } } };
  };
  const nodes = Object.fromEntries(['hp-fill','hp-text','mp-fill','mp-text','objective','green','green-active','potion','mana','scroll','skill','skill2','skill3','dodge'].map(key => [key,node()]));
  const skill = Object.keys(ABILITIES).find(key => ABILITIES[key].manaCost === 16 && !ABILITIES[key].dodgeShot);
  assert.ok(skill);
  const player = { kind:'player', hp:10,maxHp:10,mp:5,maxMp:47,skills:[skill],cds:{},dodge:{cdLeft:0},potions:1,manaPotions:1 };
  const hud = { nodes, updateParty() {}, text:HUD.prototype.text, noticeLeft:0 };
  const update = () => HUD.prototype.update.call(hud,{entities:[player],round:{state:'running',pending:[]}},0);
  return { nodes, player, skill, update };
}

test('U8: insufficient mana shows required MP and distinct class without hover', () => {
  const { nodes, player, update } = fixture();
  update();
  assert.equal(nodes.skill.lastElementChild.textContent,'MP 16');
  assert.equal(nodes.skill.disabled,true);
  assert.equal(nodes.skill.classList.contains('needs-mana'),true);
  player.mp=16; update();
  assert.equal(nodes.skill.lastElementChild.textContent,'');
  assert.equal(nodes.skill.disabled,false);
  assert.equal(nodes.skill.classList.contains('needs-mana'),false);
});

test('U8: cooldown and casting retain priority over mana status; empty slots clear class', () => {
  const { nodes, player, skill, update } = fixture();
  update(); player.cds[skill]=60; update();
  assert.equal(nodes.skill.lastElementChild.textContent,'2.0');
  assert.equal(nodes.skill.disabled,true);
  assert.equal(nodes.skill.classList.contains('needs-mana'),false);
  player.cds[skill]=0; player.act={id:skill}; update();
  assert.equal(nodes.skill.lastElementChild.textContent,'…');
  assert.equal(nodes.skill.classList.contains('needs-mana'),false);
  player.act=null; update(); player.skills=[]; update();
  assert.equal(nodes.skill.disabled,true);
  assert.equal(nodes.skill.classList.contains('needs-mana'),false);
});
