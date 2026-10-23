import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {skeletonAppearance} from '../js/render/skeleton-equipment-state.js';
import {skeletonLayout} from '../js/render/skeleton-layout.js';
import {physicalShieldPose} from '../js/render/physical-shield.js';
import {portraitShieldDescriptor} from '../js/render/portrait-shield.js';
import {createSkeletonSave} from '../js/meta/character-creation.js';
import {ITEMS,instance} from '../js/meta/items.js';
const fixture=()=>createSkeletonSave({lineage:'skeleton_knight',name:'fit',answers:[0,0,0,0,0],createdAt:1});
test('approved skeleton chooses all five real weapon families and independent valid shield layers',()=>{
 for(const[id,form,shield]of[['iron_sword','sword',true],['chief_maul','blunt',true],['hunter_bow','bow',false],['apprentice_wand','wand',true],['altar_staff','staff',false]]){
  for(const off of ['round_shield','buckler','kite_shield','tower_shield','bone_shield']){const s=fixture();s.items.push(instance('w',id),instance('o',off));s.equipped.weapon='w';s.equipped.offhand='o';const before=JSON.stringify(s),d=skeletonAppearance(s);assert.deepEqual(d.layers,['base',form,...(shield?[off]:[])]);assert.equal(JSON.stringify(s),before);}
 }
});
test('existing armor classes/tier IDs map only actual equipped slots; no innate-clothing removal',()=>{
 const s=fixture();for(const slot of ['hands','feet','body','head']){const ids=Object.keys(ITEMS).filter(k=>ITEMS[k].slot===slot);assert.ok(ids.length>3);for(const id of ids){s.items.push(instance('part',id));s.equipped[slot]='part';assert.ok(skeletonAppearance(s).layers.includes(slot));s.equipped[slot]=null;s.items.pop();assert.ok(!skeletonAppearance(s).layers.includes(slot));}}
 assert.equal(skeletonAppearance(s).layers[0],'base');
});
test('permanent DK descriptor and human-style physical shield path remain independent',()=>{
 const s=fixture();s.permanentDeathKnight=true;assert.equal(skeletonAppearance(s).id,'player-death-knight');assert.deepEqual(skeletonAppearance(s).layers,[]);
 const e={kind:'player',weapon:'blade',offhand:'shield',facing:0};assert.equal(physicalShieldPose(e,0,{baked:true}),null);assert.ok(physicalShieldPose(e,0,{x:4,y:-10,scale:1}));assert.equal(portraitShieldDescriptor(s,{appearance:{id:'player-skeleton-equipment'}},true),null);
});
test('sparse selected layout preserves negative trims, individual layer bounds and rejects missing sources',()=>{
 const m={frames:['a','b'],layers:{base:{frames:{a:{index:0,offset:[20,30]},b:{index:0,offset:[20,30]}},rects:[[0,0,30,50]]},sword:{frames:{a:{index:0,offset:[40,-8]},b:null},rects:[[0,0,10,95]]}}};const l=skeletonLayout(m,['base','sword']);assert.deepEqual(l.frames.a.trim, [20,-8,30,95]);assert.deepEqual(l.frames.b.trim,[20,30,30,50]);assert.throws(()=>skeletonLayout(m,['base','missing']),/Missing/);assert.throws(()=>skeletonLayout(m,['base','base']),/Invalid/);
});
test('new source sockets remain physical direct-frame values; production selector never normalizes clips',()=>{
 const s=readFileSync(new URL('../js/render/atlas-visual.js',import.meta.url),'utf8');assert.ok(s.includes("manifest.animations[stateName+'_'+direction]?.[frame]"));assert.ok(s.includes('manifest.sockets?.[sourceName]?.offhand'));assert.ok(s.includes('hand[0]*equipmentScale'));
});

test('delivered independent source kit has368 exact frames,15 layers, physical sockets and explicit approved aliases',()=>{
 const m=JSON.parse(readFileSync(new URL('../assets/sprites/player-skeleton-equipment/manifest.json',import.meta.url)));assert.equal(m.version,'warrior-player-independent-v2');assert.equal(m.frames.length,368);assert.equal(Object.keys(m.layers).length,15);assert.equal(m.layouts,undefined);for(const d of ['E','SE','S','SW','W','NW','N','NE']){for(const [state,count]of[['idle',13],['run',10],['attack',13],['death',10]])assert.equal(m.animations[state+'_'+d].length,count);assert.deepEqual(m.animations['dodge_'+d],m.animations['idle_'+d]);assert.deepEqual(m.animations['hit_'+d],m.animations['idle_'+d]);}
 for(const n of m.frames){const s=m.sockets[n];assert.ok(s.mainhand.every(Number.isFinite));assert.ok(s.offhand.every(Number.isFinite));for(const side of ['r','l']){const px=s.hands[side].pixel;const socket=side==='r'?s.mainhand:s.offhand;assert.ok(Math.abs(socket[0]-(px[0]-128*m.anchor.x))<.00001);assert.ok(Math.abs(socket[1]-(px[1]-128*m.anchor.y))<.00001);}}
 for(const k of ['round_shield','buckler','kite_shield','tower_shield','bone_shield'])for(const n of m.frames.filter(n=>n.startsWith('death_')))assert.equal(m.layers[k].frames[n],null);
});
test('portrait negative-trim padding preserves physical scale and leaves human/DK unchanged',async()=>{
 const{portraitPadding}=await import('../js/render/paperdoll-portrait.js');const m=JSON.parse(readFileSync(new URL('../assets/sprites/player-skeleton-equipment/manifest.json',import.meta.url)));const asset={id:m.id,manifest:{...m,layout:skeletonLayout(m,['base','staff'])}};const pad=portraitPadding(asset);assert.ok(pad>=11);for(const d of ['E','SE','S','SW','W','NW','N','NE']){const [x,y,w,h]=asset.manifest.layout.frames['idle_'+d+'_000'].trim;assert.ok(x+pad>=0&&y+pad>=0&&x+w+pad<=128+pad*2&&y+h+pad<=128+pad*2);}assert.equal(portraitPadding({id:'player-death-knight'}),0);assert.equal(portraitPadding({id:'paperdoll-blade'}),0);
});
