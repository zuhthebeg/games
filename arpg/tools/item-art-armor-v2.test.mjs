import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {ITEMS} from '../js/meta/items.js';
import {itemArtKey,itemArtPath} from '../js/ui/item-art.js';
import {itemIcon} from '../js/ui/icons.js';
const root=new URL('../',import.meta.url);
test('all head/feet/shield families and rarity variants use new art without losing semantic SVG',()=>{
 const seen=new Set(),rarities=new Set();let count=0;
 for(const [id,d] of Object.entries(ITEMS)){
  if(d.shieldType)continue; // Distinct new families have their own provenance + coverage.
  if(!['head','feet'].includes(d.slot)&&!(d.slot==='offhand'&&d.form==='shield'))continue;
  const expected=d.slot==='offhand'?'shield':d.slot==='head'?(d.armorClass==='light'||d.material==='leather'?'head-light':'head'):(d.armorClass==='heavy'?'feet-heavy':'feet');
  assert.equal(itemArtKey(id,d),expected,id);assert.equal(itemArtPath(expected),`assets/items/${expected}-armor-v2.webp`);
  const html=itemIcon(id,d);assert.match(html,/<svg/);assert.match(html,/alt=""/);assert.match(html,/aria-hidden="true"/);assert.match(html,/-armor-v2.webp/);
  assert.equal(d.rarity,ITEMS[id].rarity);seen.add(expected);rarities.add(d.rarity);count++;
 }
 assert.equal(seen.size,5);assert.deepEqual([...rarities].sort(),['common','epic','fine','rare']);assert.ok(count>80);
 for(const id of ['bone_set_head','bone_set_feet','boar_cap','boar_boots','round_shield'])assert.match(itemIcon(id,ITEMS[id]),/-armor-v2.webp/);
 assert.equal(itemArtKey('future',{slot:'offhand',form:'future'}),null);
 console.log('armor family items covered',count);
});
test('new manifest has offline model provenance, intact payloads, and legacy art remains byte-matched',()=>{
 const m=JSON.parse(readFileSync(new URL('assets/items/armor-v2-manifest.json',root)));
 assert.equal(m.offline,true);assert.equal(m.assets.length,5);assert.equal(m.paidApiUsed,false);assert.equal(m.cachedRevision,'0640e5837d88a339cfb3d9a9ac2715c93a54c036');
 let total=0;
 for(const a of m.assets){const b=readFileSync(new URL('assets/items/'+a.output,root));assert.equal(createHash('sha256').update(b).digest('hex'),a.outputSha256);assert.equal(b.length,a.outputBytes);assert.deepEqual(a.outputSize,[256,256]);assert.equal(a.steps,30);assert.equal(a.reviewedDirectly,true);assert.match(a.sourceSha256,/^[a-f0-9]{64}$/);assert.ok(a.prompt&&a.negative&&a.seed);total+=b.length;}
 assert.ok(total<150000);
 for(const r of JSON.parse(readFileSync(new URL('assets/items/manifest.json',root)))){const b=readFileSync(new URL('assets/items/'+r.file,root));assert.equal(createHash('sha256').update(b).digest('hex'),r.sha256);}
});
