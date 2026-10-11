import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HubUI } from '../js/ui/hub.js';
import { getHeroPortrait } from '../js/ui/gear-view.js';
import { createSave } from '../js/meta/save.js';
import { instance } from '../js/meta/items.js';
import { ENCHANT, SCROLLS } from '../js/meta/economy.js';
import { PORTRAIT_DIRECTIONS, setPortraitDirection } from '../js/render/paperdoll-portrait.js';
const fresh = () => createSave({name:'H1',answers:[0,0,0,0,0],createdAt:1});
const hub = () => Object.assign(Object.create(HubUI.prototype), {save:fresh(), dialogHtml:(title,body,footer)=>footer, mountSheet(html){this.html=html;}, showForge(){this.forgeShown=true;}});

test('socket footer has merchant and selected-equipment forge shortcut; max/empty disabled', () => {
  const h=hub();h.showSocket('weapon');
  assert.match(h.html,/socket-actions/);assert.match(h.html,/장비상 둘러보기/);
  assert.match(h.html,/data-action="socket-forge" data-uid="starter:weapon"/);
  assert.doesNotMatch(h.html,/disabled/);
  h.save.items[0].enhance=ENCHANT.max;h.showSocket('weapon');assert.match(h.html,/data-action="socket-forge"[^>]*disabled/);
  h.showSocket('head');assert.match(h.html,/data-action="socket-forge"[^>]*disabled/);
});
test('shortcut resets forge tab/scroll and selects armor, not default weapon; invalid/max no-op', () => {
  const h=hub();const item=instance('head','head_light_common_t1');h.save.items.push(item);h.save.equipped.head=item.uid;
  h.forgeTab='salvage';h.forgeScroll=SCROLLS.weapon.blessed;
  const before=JSON.stringify(h.save);h.action('socket-forge',{uid:item.uid});
  assert.equal(h.selectedUid,item.uid);assert.equal(h.forgeTab,'enhance');assert.equal(h.forgeScroll,SCROLLS.armor.normal);assert.equal(h.forgeShown,true);assert.equal(JSON.stringify(h.save),before);
  h.forgeShown=false;item.enhance=ENCHANT.max;h.action('socket-forge',{uid:item.uid});assert.equal(h.forgeShown,false);
  h.action('socket-forge',{uid:'missing'});assert.equal(h.forgeShown,false);
});
test('all eight idle directions match each original atlas; direction only changes presentation', () => {
  for(const weapon of ['blade','bow','focus']) for(const direction of PORTRAIT_DIRECTIONS) {
    const s=createSave({name:'H1',answers:[0,0,0,0,0],weapon,createdAt:1});const before=JSON.stringify(s);const p=getHeroPortrait(s,direction);
    const atlas=JSON.parse(readFileSync(new URL('../'+p.url+'.json',import.meta.url)));
    assert.deepEqual(atlas.frames[p.frame].frame,{x:p.x,y:p.y,w:128,h:128});assert.equal(JSON.stringify(s),before);
    const node={dataset:{},style:{}};setPortraitDirection(node,direction);assert.equal(node.dataset.direction,direction);assert.equal(node.style.backgroundPosition,`-${p.x}px -${p.y}px`);
  }
});
