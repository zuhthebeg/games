import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { ITEMS, RECIPES, craft, equip, instance, rollDrops, dismantle, dismantleMaterial } from '../js/meta/items.js';
import { TIER4_GEAR_DROPS, NEW_MONSTER_DROPS } from '../js/content/loot.js';
import { createSave, validateSave, SaveStore, SAVE_VERSION } from '../js/meta/save.js';
import { statBudget, BASE_STATS, STAT_KEYS } from '../js/meta/stats.js';
import { itemArtKey, itemArtPath } from '../js/ui/item-art.js';
import { shopStock } from '../js/meta/shop.js';
import { HubUI } from '../js/ui/hub.js';
const common = ['revenant_blade','bone_bow','soulfire_wand','gravekeeper_staff','ossuary_maul','shroud_robe','shadow_leather','ossuary_plate'];
const rare = ['dragonfang_blade','dragon_scale_armor'];
const fresh = () => {const s=createSave({name:'I1',answers:[0,0,0,0,0],createdAt:123});s.gold=100000;s.level=30;s.stats={...BASE_STATS,str:100};s.statPoints=statBudget(s.level)-STAT_KEYS.reduce((n,k)=>n+s.stats[k]-BASE_STATS[k],0);for(const r of Object.values(RECIPES))for(const k of Object.keys(r))if(k!=='gold')s.stacks[k]=1000;return s;};
function roundtrip(s) { const m=new Map(),store=new SaveStore({getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)});assert.ok(validateSave(s));store.save(s);assert.deepEqual(store.load(),s);assert.equal(s.version,SAVE_VERSION); }
for(const id of [...common,...rare]) test(`I1 ${id}: exact T4 definition, craft/drop route, equip and save`,()=>{
 const d=ITEMS[id],s=fresh();assert.equal(d.huntTier,4);assert.equal(d.requiredLevel,15,'authored T4 band; not a runtime gate');
 assert.equal(d.rarity,rare.includes(id)?'rare':'fine');
 if(d.slot==='weapon')assert.equal(d.power,id==='dragonfang_blade'?1.95:1.85);
 else assert.equal(d.ac,Math.round((id==='dragon_scale_armor'?110:100)*2/3));
 assert.equal(d.material,ITEMS[d.baseId].material);assert.ok(d.requiredStr<=100);
 let made;
 if(common.includes(id)){
  assert.deepEqual(TIER4_GEAR_DROPS,common);const r=RECIPES[id];assert.equal(r.gold,360);assert.equal(r.dragon_scale,1);
  assert.equal(r[dismantleMaterial(instance('probe',id))],36);
  made=craft(s,id);assert.deepEqual(made,craft(s,id));assert.equal(made.gold,s.gold-360);
  for(const [k,n]of Object.entries(r))if(k!=='gold')assert.equal(made.stacks[k],s.stacks[k]-n);
  const missing=structuredClone(s);delete missing.stacks.dragon_scale;assert.throws(()=>craft(missing,id),/수호룡 비늘/);assert.deepEqual(missing.items,s.items);
  const salvaged=dismantle(made,made.items.at(-1).uid);assert.equal(salvaged.stacks.dragon_scale,s.stacks.dragon_scale-1);roundtrip(salvaged);
 }else{
  assert.equal(RECIPES[id],undefined);assert.equal(d.dropOnly,'throne_dragon');assert.throws(()=>craft(s,id),/없는 제작법/);
  let dropped;for(let seed=0;seed<1000&&!dropped;seed++)dropped=rollDrops('throne_dragon',seed,{boss:true,huntTier:3}).items.find(i=>i.id===id);
  assert.ok(dropped);made=structuredClone(s);made.items.push(dropped);
 }
 const it=made.items.at(-1);roundtrip(made);const equipped=equip(made,it.uid);assert.equal(equipped.equipped[d.slot],it.uid);roundtrip(equipped);
 if(d.requiredStr){const weak=structuredClone(made);weak.stats.str=d.requiredStr-1;assert.throws(()=>equip(weak,it.uid),/힘/);}
});
test('I1 rare guardian rolls: each 4%, LUK monotonic, reproducible, no rare recipe/ordinary pool',()=>{
 for(const id of rare){assert.equal(NEW_MONSTER_DROPS.throne_dragon.items.find(e=>e.id===id).chance,.04);let base=0,lucky=0;
 for(let seed=0;seed<10000;seed++){
  const a=rollDrops('throne_dragon',seed,{boss:true,huntTier:3}),b=rollDrops('throne_dragon',seed,{boss:true,huntTier:3,dropLuck:1});
  assert.equal(a.stacks.dragon_scale,1);assert.deepEqual(a,rollDrops('throne_dragon',seed,{boss:true,huntTier:3}));
  const hit=a.items.some(i=>i.id===id),boost=b.items.some(i=>i.id===id);if(hit){base++;assert.ok(boost);}if(boost)lucky++;
 }assert.ok(base>300&&base<500,`${id}: ${base}`);assert.ok(lucky>650&&lucky<950,`${id}: ${lucky}`);
 }
 assert.ok(Object.values(ITEMS).filter(d=>rare.includes(d.baseId)).every(d=>d.dropOnly==='throne_dragon'));
});
test('I1 1,000 seeds / existing monster: exact baseline JSON bytes, TD1 only adds new rewards',()=>{
 const root=new URL('../js/meta/',import.meta.url);
 const read=p=>execFileSync('git',['show',`7792637:arpg/js/${p}`],{encoding:'utf8'});
 let src=read('meta/items.js').replace(/from '([^']+)'/g,(_,p)=>'from '+JSON.stringify(new URL(p,root).href));
 src=src.replace(new URL('../content/loot.js',root).href,'data:text/javascript;base64,'+Buffer.from(read('content/loot.js')).toString('base64'));
 src=src.replaceAll(new URL('economy.js',root).href,'data:text/javascript;base64,'+Buffer.from(read('meta/economy.js').replace('../content/balance.js',new URL('../content/balance.js',root).href)).toString('base64'));
 const monsters=['scarecrow','goblin_grunt','goblin_slinger','iron_boar','goblin_chief','wolf','rune_guardian','gargoyle','spirit','poison_spider','throne_dragon'];
 const contexts=[{}, {huntTier:3,boss:true,materialBonus:7,dropLuck:.5,threat:2}];
 const script=`const {rollDrops,ITEMS,RECIPES}=await import(${JSON.stringify('data:text/javascript;base64,'+Buffer.from(src).toString('base64'))});
 const drops=[];for(const m of ${JSON.stringify(monsters)})for(const c of ${JSON.stringify(contexts)})for(let seed=0;seed<1000;seed++)drops.push(JSON.stringify(rollDrops(m,seed,c)));
 console.log(JSON.stringify({items:ITEMS,recipes:RECIPES,drops}));`;
 const old=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8',maxBuffer:64*1024*1024}));let ix=0;
 for(const [id,d]of Object.entries(old.items))assert.equal(JSON.stringify(ITEMS[id]),JSON.stringify(d),`unchanged definition: ${id}`);
 for(const [id,r]of Object.entries(old.recipes))assert.deepEqual(RECIPES[id],r,`unchanged recipe: ${id}`);
 for(const m of monsters)for(const c of contexts)for(let seed=0;seed<1000;seed++){
  const a=rollDrops(m,seed,c);if(m==='throne_dragon'){assert.equal(a.stacks.dragon_scale,1);delete a.stacks.dragon_scale;a.items=a.items.filter(i=>!rare.includes(i.id));}
  assert.equal(JSON.stringify(a),old.drops[ix++],`${m}/${seed}/${JSON.stringify(c)}`);
 }
});
test('I1 UI labels and new material render from definitions with no schema/UI redesign',()=>{
 const h=Object.assign(Object.create(HubUI.prototype),{save:fresh(),forgeTab:'salvage',showInnPanel:(_t,html)=>h.html=html});h.showForge();
 assert.match(h.html,/수호룡 비늘: 1/);for(const id of common)assert.ok(h.html.includes(`data-id="${id}"`));
 for(const id of rare)assert.ok(!h.html.includes(`data-id="${id}"`));assert.doesNotMatch(h.html,/undefined|NaN/);
});

test('I1 T4 art is nonempty and every silhouette is distinct from every delivered icon',()=>{
 const r=JSON.parse(execFileSync('python3',['arpg/tools/item-art-tier4-check.py'],{encoding:'utf8'}));assert.equal(r.files,11);assert.equal(r.distinctMasks,11);assert.ok(r.minPairDifference>100);
 const records=JSON.parse(readFileSync(new URL('../assets/items/manifest.json',import.meta.url))).filter(r=>r.source==='arpg/tools/item-art-tier4.py');
 const sourceHash=createHash('sha256').update(readFileSync(new URL('../tools/item-art-tier4.py',import.meta.url))).digest('hex');
 assert.equal(records.length,11);for(const r of records)assert.equal(r.sourceSha256,sourceHash);
 const keys=[...common,...rare].map(id=>itemArtPath(itemArtKey(id,ITEMS[id])));assert.equal(new Set(keys).size,10);
});
test('I1 T4 acquisition stays out of merchant stock including rarity variants',()=>{
 for(let seed=0;seed<1000;seed++)assert.ok(shopStock(seed,seed%5).every(i=>ITEMS[i.id].huntTier<4));
});
test('I1 authored Lv15 metadata does not restore level gates: real Lv1 T4 light weapon equip/save',()=>{
 for(const id of ['bone_bow','soulfire_wand','gravekeeper_staff']){
  const s=createSave({name:'I1 level',answers:[0,0,0,0,0],createdAt:123});s.gold=1000;
  for(const [k,n]of Object.entries(RECIPES[id]))if(k!=='gold')s.stacks[k]=n;
  const made=craft(s,id),it=made.items.at(-1);assert.equal(made.level,1);assert.equal(ITEMS[id].requiredLevel,15);
  roundtrip(equip(made,it.uid));
 }
});
