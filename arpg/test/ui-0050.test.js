import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HUD } from '../js/ui/hud.js';
import { weightDescription } from '../js/ui/hub.js';

 test('compact load keeps tier, tooltip, ratio transform and readable accessible numbers', () => {
  const attrs = {}, wrapper = { setAttribute: (k,v) => attrs[k] = v };
  const fill = { style: {}, parentElement: wrapper }, text = { textContent: '' };
  const hud = Object.create(HUD.prototype);
  hud.nodes = { 'load-fill': fill, 'load-text': text, 'temp-loot': { textContent: '' } };
  for (const weight of [50, 90, 110]) {
    const load = { weight, capacity: 100, ratio: weight / 100 };
    hud.meta(load, { tempLoot: { items: [], stacks: {}, gold: 0 }, depositedXp: 0 });
    const tier = weightDescription(weight, 100);
    assert.equal(wrapper.className, `bar load ${tier.tier}`);
    assert.equal(wrapper.title, tier.text);
    assert.equal(fill.style.transform, `scaleX(${Math.min(1, load.ratio / 1.2)})`);
    assert.equal(text.textContent, `${weight}/100`);
    assert.equal(attrs.role, 'img');
    assert.equal(attrs['aria-label'], `가방 무게 ${weight}/100 · ${tier.text}`);
  }
 });

 test('only adjacent sortie coop gets spacing and original load nodes remain', () => {
  const css = readFileSync(new URL('../css/game.css', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(css.includes('.threat-choices + button[data-action="coop"]{margin-top:12px}'));
  assert.ok(css.includes('#hud .bar.load i { display: none; }'));
  assert.match(css, /#hud \.bar\.load span \{[^}]*font-size: 12px;/);
  assert.ok(html.includes('<div class="bar load"><i id="load-fill"></i><span id="load-text"></span></div>'));
 });
