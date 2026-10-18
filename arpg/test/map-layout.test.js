import test from 'node:test';
import assert from 'node:assert/strict';
import { HubUI } from '../js/ui/hub.js';
import { createSave } from '../js/meta/save.js';
import { REGIONS, REGION_EDGES, MAPS, mapUnlocked } from '../js/content/world-map.js';
const fresh = () => createSave({ name:'지도 시험', answers:[0,0,0,0,0], createdAt:1 });
const hub = save => Object.assign(Object.create(HubUI.prototype), {save, showInnPanel(title, html, panel, footer, options) {Object.assign(this,{html,footer,options});}});
const stageIds = html => [...html.matchAll(/data-stage="([^"]+)"/g)].map(m => m[1]);
const regionIds = html => [...html.matchAll(/data-action="map-region" data-region="([^"]+)"/g)].map(m => m[1]);
function assertDiscovered(h, s) {
  h.showBoard();
  const ids=Object.keys(MAPS).filter(id=>mapUnlocked(s,id));
  assert.deepEqual(stageIds(h.html).sort(),ids.sort());
  const regions=REGIONS.filter(r=>ids.some(id=>MAPS[id].regionId===r.id));
  assert.deepEqual(regionIds(h.html).sort(),regions.map(r=>r.id).sort());
  for(const r of REGIONS) {
    assert.equal(h.html.includes(`/arpg/assets/world-map/${r.id}.webp`),regions.includes(r),r.id+' art disclosure');
    if(!regions.includes(r))assert.ok(!h.html.includes(r.name),r.id+' no future name');
  }
  for(const [a,b] of REGION_EDGES)assert.equal(h.html.includes(`data-route="${a}:${b}"`),regions.some(r=>r.id===a)&&regions.some(r=>r.id===b),a+':'+b);
  assert.doesNotMatch(h.html,/class="contract lock"|잠긴 지역도|style="left:/);
  assert.equal(h.options.keepScroll,true);
}
test('fresh board exposes S1 only and replaces a stale undiscovered selection',()=>{
  const s=fresh(),h=hub(s);h.mapRegion='necropolis';assertDiscovered(h,s);
  assert.deepEqual(stageIds(h.html),['S1']);assert.equal(h.mapRegion,'outskirts');
  assert.match(h.html,/data-region="outskirts"[^>]*aria-pressed="true"/);
  assert.doesNotMatch(h.options.eyebrow,/묘지|지하묘역/);
  s.cleared.S1=true;assertDiscovered(h,s);assert.deepEqual(stageIds(h.html),['S1','S2']);
  assert.match(h.html,/data-stage="S1" class="contract clear"/);
  assert.match(h.html,/data-stage="S2" class="contract depart" aria-current="step"/);
});
test('progress reveals only the frontier, including branch OR gates and late regions',()=>{
  for(let count=0;count<=27;count++) {
    const s=fresh();for(let i=1;i<=count;i++)s.cleared['S'+i]=true;
    const h=hub(s);assertDiscovered(h,s);
    if(count===4){assert.match(h.html,/data-region="outskirts" class="region-node clear"/);assert.match(h.html,/data-region="forest"[^>]*aria-current="location"/);}
    if(count===10){assert.ok(regionIds(h.html).includes('mine'));assert.ok(regionIds(h.html).includes('swamp'));assert.ok(!regionIds(h.html).includes('castle'));assert.ok(stageIds(h.html).includes('M_MINE_CART'));assert.ok(!stageIds(h.html).includes('M_MARSH_MARKERS'));}
    if(count===11)assert.ok(stageIds(h.html).includes('M_MARSH_MARKERS'));
    if(count===20)for(const id of ['S21','TD1','M_THRONE_GARGOYLE'])assert.ok(stageIds(h.html).includes(id));
    if(count===23)assert.ok(stageIds(h.html).includes('S24'));
  }
  for(const branch of ['S17','S18']) {const s=fresh();for(let i=1;i<=10;i++)s.cleared['S'+i]=true;s.cleared[branch]=true;const h=hub(s);assertDiscovered(h,s);assert.ok(stageIds(h.html).includes('S14'),branch+' alone opens castle');}
  const s=fresh();s.cleared.S23=true;s.cleared.S24=true;const h=hub(s);assertDiscovered(h,s);assert.deepEqual(regionIds(h.html),['outskirts'],'historical trial clears do not bypass S20');
});
test('completed regions stay selectable and offered side contracts remain available',()=>{
  const s=fresh();for(let i=1;i<=10;i++)s.cleared['S'+i]=true;
  const h=hub(s);h.mapRegion='outskirts';assertDiscovered(h,s);assert.equal(h.mapRegion,'outskirts');
  assert.match(h.html,/data-region="outskirts"[^>]*aria-pressed="true"/);assert.match(h.html,/data-quest="QF1"/);
  assert.doesNotMatch(h.html,/S5 · S11 · S16/,'side contract omits undiscovered destinations');
});
test('current highlight also follows an outstanding objective after the main campaign',()=>{
  const s=fresh();for(const id of Object.keys(MAPS))s.cleared[id]=true;
  s.cleared.M_MINE_CART=false;const h=hub(s);assertDiscovered(h,s);
  assert.match(h.html,/data-region="mine"[^>]*aria-current="location"/);
  assert.match(h.html,/data-stage="M_MINE_CART"[^>]*aria-current="step"/);
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
