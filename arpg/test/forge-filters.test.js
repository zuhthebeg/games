import test from 'node:test';
import assert from 'node:assert/strict';
import {HubUI,forgeRecipeSet} from '../js/ui/hub.js';
import {createSave} from '../js/meta/save.js';
import {ITEMS,RECIPES,craft,craftingRecipes} from '../js/meta/items.js';
import {noteMaterials,recipeRevealed} from '../js/meta/recipe-discovery.js';
const fresh=()=>createSave({name:'Filters',answers:[0,0,0,0,0],createdAt:1});
const hubFor=save=>Object.assign(Object.create(HubUI.prototype),{save,forgeTab:'craft',showInnPanel(_title,html){this.html=html;},commit(next){this.save=next;}});
const ids=html=>[...html.matchAll(/data-recipe-id="([^"]+)"/g)].map(m=>m[1]).sort((a,b)=>craftingRecipes().findIndex(([id])=>id===a)-craftingRecipes().findIndex(([id])=>id===b));
const rich=()=>noteMaterials({...fresh(),gold:1000000,stacks:Object.fromEntries(Object.keys(ITEMS).filter(k=>ITEMS[k].kind==='material').map(k=>[k,10000]))});
const affordable=(s,id)=>Object.entries(RECIPES[id]).every(([k,n])=>(k==='gold'?s.gold:s.stacks[k]||0)>=n);

test('default list only renders revealed affordable recipes including gold, no stash; quantities and save unchanged',()=>{
 const save=noteMaterials({...fresh(),gold:0,stacks:{scrap:100,wood:100,fang:100},stash:{stacks:{scrap:99999}}}),before=structuredClone(save),hub=hubFor(save);
 hub.showForge();assert.deepEqual(ids(hub.html),[]);assert.match(hub.html,/recipe-empty/);assert.match(hub.html,/forge-show-all/);assert.deepEqual(save,before);
 save.gold=100000;save.stacks.scrap=1;hub.showForge();assert.deepEqual(ids(hub.html),craftingRecipes().map(([id])=>id).filter(id=>recipeRevealed(save,id)&&affordable(save,id)));assert.ok(ids(hub.html).length<Object.keys(RECIPES).length);assert.ok(!ids(hub.html).includes('iron_sword'),'stash cannot satisfy crafting costs');
 hub.action('forge-recipe-mode',{mode:'all'});assert.match(hub.html,/보유 \/ 필요/);assert.match(hub.html,/고철[^<]*1 \/ /);assert.match(hub.html,/G[^<]*100000 \/ /);assert.match(hub.html,/disabled/);
});

test('owned is current non-gold possession, all preserves hidden recipes, categories intersect and controls never save',()=>{
 const save=noteMaterials({...fresh(),gold:99999,stacks:{fang:1}});save.stacks={hide:1};const before=structuredClone(save),hub=hubFor(save);
 hub.action('forge-recipe-mode',{mode:'owned'});
 const relevant=craftingRecipes().map(([id])=>id).filter(id=>recipeRevealed(save,id)&&Object.keys(RECIPES[id]).some(k=>k!=='gold'&&(save.stacks[k]||0)>0));assert.deepEqual(ids(hub.html),relevant);assert.ok(!ids(hub.html).includes('iron_sword'));
 hub.action('forge-recipe-mode',{mode:'all'});const all=craftingRecipes().map(([id])=>id).filter(id=>recipeRevealed(save,id));assert.deepEqual(ids(hub.html),all);assert.ok(all.length<Object.keys(RECIPES).length);
 hub.action('forge-recipe-kind',{kind:'weapon'});assert.deepEqual(ids(hub.html),all.filter(id=>ITEMS[id].slot==='weapon'));
 const previous=hub.html;hub.action('forge-recipe-mode',{mode:'__proto__'});hub.action('forge-recipe-kind',{kind:'nope'});assert.equal(hub.html,previous);
 hub.action('forge-show-all',{});assert.deepEqual(ids(hub.html),all);assert.deepEqual(save,before);
});

test('rich data-driven categories combine in both modes; entry resets, tab switches retain',()=>{
 const save=rich(),hub=hubFor(save);
 for(const mode of ['craftable','owned','all'])for(const kind of ['all','weapon','armor','offhand','material']){
  hub.action('forge-recipe-mode',{mode});hub.action('forge-recipe-kind',{kind});
  const expected=craftingRecipes().map(([id])=>id).filter(id=>recipeRevealed(save,id)&&(kind==='all'||(ITEMS[id].slot ? (['weapon','offhand'].includes(ITEMS[id].slot) ? ITEMS[id].slot : 'armor') : 'material')===kind));assert.deepEqual(ids(hub.html),expected);
 }
 hub.action('forge-recipe-kind',{kind:'weapon'});hub.action('forge-tab',{tab:'enhance'});assert.deepEqual(ids(hub.html),[]);hub.action('forge-tab',{tab:'craft'});assert.ok(ids(hub.html).every(id=>ITEMS[id].slot==='weapon'));
 hub.action('forge',{});hub.action('forge-tab',{tab:'craft'});assert.deepEqual(ids(hub.html),craftingRecipes().map(([id])=>id));assert.equal(hub.forgeRecipeMode,'craftable');assert.equal(hub.forgeRecipeKind,'all');
});

test('exact craft cost and enhancement route remain; unaffordable crafting still rejects',()=>{
 const save=rich(),hub=hubFor(save);hub.action('craft',{id:'iron_sword'});assert.deepEqual(hub.save,craft(save,'iron_sword'));assert.equal(hub.forgeTab,'craft');assert.equal(hub.selectedUid,hub.save.items.at(-1).uid);
 const poor=hubFor({...fresh(),gold:0,stacks:{}});assert.throws(()=>poor.action('craft',{id:'iron_sword'}));
});

test('set filter intersects availability/kind; options only revealed sets; reset clears all three',()=>{
 const save=rich(),before=structuredClone(save),hub=hubFor(save);hub.showForge();
 hub.action('forge-recipe-set',{set:'set:warden'});assert.deepEqual(ids(hub.html),craftingRecipes().map(([id])=>id).filter(id=>['warden_blade','warden_maul','warden_plate'].includes(ITEMS[id].baseId||id)));assert.match(hub.html,/forge-set/);
 hub.action('forge-recipe-kind',{kind:'armor'});assert.ok(ids(hub.html).length>0);assert.ok(ids(hub.html).every(id=>(ITEMS[id].baseId||id)==='warden_plate'));
 const prior=hub.html;for(const set of ['set:unknown','set:undefined','set:hidden'])hub.action('forge-recipe-set',{set});assert.equal(hub.html,prior);
 hub.action('forge-show-all',{});assert.equal(hub.forgeRecipeSet,'all');assert.deepEqual(ids(hub.html),craftingRecipes().map(([id])=>id));
 hub.action('forge-recipe-set',{set:'none'});assert.ok(!ids(hub.html).includes('boar_hide_armor'));assert.ok(!ids(hub.html).includes('warden_blade'));assert.ok(ids(hub.html).includes('iron_sword'));assert.deepEqual(save,before);
 const empty=hubFor({...fresh(),stacks:{},seenMaterials:[]});empty.showForge();assert.doesNotMatch(empty.html,/data-set="set:/);assert.match(empty.html,/전체 세트/);assert.match(empty.html,/세트 없음/);
});

test('definition setId/setName metadata override fallback; unfamiliar IDs are escaped, hidden options stay hidden',()=>{
 const save=noteMaterials({...fresh(),gold:1000,stacks:{scrap:8,fang:3,wood:8}}),hub=hubFor(save);
 const savedIron={...ITEMS.iron_sword},savedBoar={...ITEMS.boar_hide_armor};
 try{
  Object.assign(ITEMS.iron_sword,{setId:'custom"<set>',setName:'새로운 <세트>'});Object.assign(ITEMS.boar_hide_armor,{setId:'hidden',setName:'숨김'});
  const undiscovered=hubFor({...fresh(),stacks:{wood:1},seenMaterials:[]});undiscovered.showForge();assert.doesNotMatch(undiscovered.html,/data-set="set:hidden"/);
  hub.showForge();assert.match(hub.html,/새로운 &lt;세트&gt;/);assert.match(hub.html,/set:custom&quot;&lt;set&gt;/);hub.action('forge-recipe-set',{set:'set:custom"<set>'});assert.deepEqual(ids(hub.html),['iron_sword']);
 }finally{Object.keys(ITEMS.iron_sword).forEach(k=>delete ITEMS.iron_sword[k]);Object.assign(ITEMS.iron_sword,savedIron);Object.keys(ITEMS.boar_hide_armor).forEach(k=>delete ITEMS.boar_hide_armor[k]);Object.assign(ITEMS.boar_hide_armor,savedBoar);}
});

test('set resolver prefers metadata, labels unknown metadata without guessing an equipment group',()=>{
 assert.deepEqual(forgeRecipeSet('fixture',{setId:'unknown'}),{id:'unknown',name:'unknown'});
 assert.deepEqual(forgeRecipeSet('fixture',{setId:'bone'}),{id:'bone',name:'뼈'});
 assert.deepEqual(forgeRecipeSet('warden_blade',{baseId:'warden_blade',setId:'custom',setName:'새 세트'}),{id:'custom',name:'새 세트'});
});
