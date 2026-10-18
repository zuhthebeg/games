import test from 'node:test';
import assert from 'node:assert/strict';
import { HubUI } from '../js/ui/hub.js';
import { createSave } from '../js/meta/save.js';
import { REGIONS, mapUnlocked } from '../js/content/world-map.js';
import { OBJECTIVE_QUESTS } from '../js/content/quest-expansion.js';
const fresh = () => createSave({ name:'지도 시험', answers:[0,0,0,0,0], createdAt:1 });
const hub = save => Object.assign(Object.create(HubUI.prototype), {save, showInnPanel(title, html, panel, footer, options) {Object.assign(this,{html,footer,options});}});
test('region navigation has explicit selection/preview semantics, nine real art paths and no absolute positions', () => {
  const h=hub(fresh());h.showBoard();
  assert.match(h.html,/class="map-party-actions"/);
  assert.match(h.html,/class="map-board"/);
  assert.doesNotMatch(h.html,/style="left:/);
  for(const r of REGIONS) {
    assert.ok(h.html.includes(`/arpg/assets/world-map/${r.id}.webp`));
    assert.match(h.html,new RegExp(`data-region="${r.id}"[^>]*aria-controls="map-region-${r.id}"`));
    assert.match(h.html,new RegExp(`id="map-region-${r.id}"[^>]*aria-labelledby="map-heading-${r.id}"`));
  }
  assert.match(h.html,/data-region="outskirts"[^>]*aria-pressed="true"/);
  assert.match(h.html,/data-region="forest"[^>]*aria-pressed="false"/);
  assert.equal(h.options.keepScroll,true,'selection preserves keyboard focus and map scroll');
});
test('locked region preview never opens quests; clear/current/open states and objective quests are retained', () => {
  const s=fresh(),h=hub(s);h.mapRegion='necropolis';h.showBoard();
  assert.match(h.html,/data-region="necropolis"[^>]*aria-pressed="true"/);
  for(const id of ['S24','S25','S26','S27'])assert.match(h.html,new RegExp(`data-stage="${id}" class="contract lock" disabled`));
  for(const q of Object.values(OBJECTIVE_QUESTS))assert.ok(h.html.includes(`data-stage="${q.mapId}"`));
  s.cleared.S1=true;h.mapRegion='outskirts';h.showBoard();
  assert.match(h.html,/data-stage="S1" class="contract clear"/);
  assert.match(h.html,/data-stage="S2" class="contract depart" aria-current="step"/);
  assert.equal(mapUnlocked(s,'S3'),false);
  for(const id of ['S2','S3','S4'])s.cleared[id]=true;
  h.showBoard();assert.match(h.html,/data-region="outskirts" class="region-node clear"/);
  assert.match(h.html,/data-region="forest"[^>]*aria-current="location"/);
});
test('sortie keeps threat/launch confirmation, undead/silver advice and separate opt-in modes for each lineage', () => {
  const previous=globalThis.matchMedia;globalThis.matchMedia=()=>({matches:false});
  try {for(const lineage of [undefined,'skeleton_knight']) {
    const s=fresh();s.lineage=lineage;s.cleared.S20=true;
    const h=hub(s);h.showSortie('S21');
    assert.match(h.html,/class="map-sortie"/);assert.match(h.html,/world-map\/graveyard.webp/);
    assert.match(h.html,/언데드 다수 출현/);assert.match(h.html,/class="map-party-actions"/);
    assert.equal(h.html.includes('data-action="coop"'),!lineage);
    assert.match(h.html,/data-action="invasion"/);assert.doesNotMatch(h.html,/data-action="invasion-accept"/);
    assert.match(h.html,/data-threat="2"[^>]*disabled/);assert.match(h.footer,/data-action="launch"/);
    h.showBoard();assert.equal(h.html.includes('data-action="coop"'),!lineage);
  }}finally{globalThis.matchMedia=previous;}
});
