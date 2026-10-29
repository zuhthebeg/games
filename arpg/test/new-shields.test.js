import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSave,validateSave,SaveStore} from '../js/meta/save.js';
import {trained} from './fixtures/trained.js';
import {ITEMS,RECIPES,instance,equip,craft,dismantle,dismantleRefund,rollDrops} from '../js/meta/items.js';
import {deriveMods} from '../js/meta/stats.js';
import {buildRoundMods} from '../js/meta/run.js';
import {shopStock,gearPrice,buyGear,sellItem} from '../js/meta/shop.js';
import {enchant} from '../js/meta/enchant.js';
import {SHIELDS} from '../js/content/shields.js';
import {createWorld,addPlayer,spawnMonster,step,emptyInput} from '../js/sim/world.js';
import {ABILITIES,PLAYER_BASE} from '../js/content/combat.js';
import {shieldDamage} from '../js/sim/movement.js';
import {encodeSnapshot,decodeSnapshot} from '../js/net/protocol.js';
import {physicalShieldPose,drawPhysicalShield} from '../js/render/physical-shield.js';
import {compareItems} from '../js/meta/compare.js';
import {itemArtKey,itemArtPath} from '../js/ui/item-art.js';
import {itemDetailsHtml,cardHtml} from '../js/ui/gear-view.js';
const bases=Object.keys(SHIELDS),model=type=>({v:1,type});
function saved(id){const s=trained(createSave({name:'방패',weapon:'blade',answers:[0,0,0,0,0],createdAt:19}),30);s.items.push(instance('shield',id,0,[]));s.gold=100000;return equip(s,'shield');}
test('four shield families cover all four rarities, save roundtrip and unchanged legacy optional socket',()=>{
 for(const id of bases) {
  const variants=Object.entries(ITEMS).filter(([,d])=>d.baseId===id);assert.equal(variants.length,4);
  for(const [key,d] of variants){const s=saved(key);assert.ok(validateSave(s));assert.deepEqual(deriveMods(s).shieldModel,model(id));assert.equal(d.boneSet,undefined);const values=new Map(),store=new SaveStore({getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)});store.save(s);assert.deepEqual(store.load(),s);}
 }
 const old=createSave({name:'old',weapon:'blade',answers:[0,0,0,0,0],createdAt:1});delete old.equipped.offhand;assert.ok(validateSave(old));assert.equal(deriveMods(old).shieldModel,undefined);assert.equal(shieldDamage(100),30);
});
test('new shields preserve two-hand exclusion and both supported lineages',()=>{
 for(const id of bases){let s=saved(id);s.items.push(instance('two','rune_greatsword',0,[]));s.stats.str=200;const next=equip(s,'two');assert.equal(next.equipped.offhand,null);assert.equal(deriveMods(next).shieldModel,undefined);assert.throws(()=>equip(next,'shield'),/방패/);s.lineage='skeleton_knight';assert.equal(equip(s,'shield').equipped.offhand,'shield');}
});
test('shield tradeoffs reach host movement, actual attack rate mods, AC and common comparison UI',()=>{
 const round=deriveMods(saved('round_shield'));
 for(const id of bases){const s=saved(id),m=deriveMods(s),w=createWorld(),p=addPlayer(w,{pid:'p',mods:buildRoundMods(s)});assert.deepEqual(p.shieldModel,model(id));assert.equal(p.ac,m.ac);assert.equal(p.speed,PLAYER_BASE.speed*m.speedMult);const cmp=compareItems(instance('round','round_shield',0,[]),s.items.at(-1),s);assert.ok(cmp.lines.some(l=>l.key==='block'&&l.to===SHIELDS[id].block*100));assert.ok(cmp.lines.some(l=>l.key==='moveSpeed'));
 assert.match(itemDetailsHtml(s.items.at(-1),s),new RegExp(Math.round(SHIELDS[id].block*100)+'%'));assert.match(cardHtml(s.items.at(-1),s,{compact:true}),new RegExp(ITEMS[id].name));
 if(id==='buckler'){assert.ok(m.speedMult>round.speedMult);assert.ok(m.attackSpeedBonus>round.attackSpeedBonus);}if(id==='tower_shield'){assert.ok(m.speedMult<round.speedMult);assert.ok(m.ac>round.ac);}
 }
});
function contact(id,undead=true,hold=true){const s=saved(id),w=createWorld(),p=addPlayer(w,{pid:'p',x:500,y:400,mods:{...buildRoundMods(s),maxHp:1000,hpRegen:0,mpRegen:0}});const m=spawnMonster(w,undead?'ghoul':'goblin_grunt',900,400,{hpMult:100});m.spawnLeft=0;m.frozenUntil=10000;
 for(let i=0;i<20;i++)step(w,{p:{...emptyInput(),aimX:1,dodgeHeld:hold}});
 w.projectiles.push({id:w.nextId++,ownerId:m.id,ownerKind:'monster',team:m.team,abilityId:'sling_stone',def:{...ABILITIES.sling_stone,damage:100,knockback:0},x:550,y:400,vx:-1500,vy:0,r:3,travelled:0,range:500,pierce:0,hit:[],dmgMult:1,poiseMult:1});const hp=p.hp;const events=step(w,{p:{...emptyInput(),aimX:1,dodgeHeld:hold}});return {damage:hp-p.hp,events,w,p};}
test('real authoritative impacts apply per-shield block once and bone ward only versus undead',()=>{
 const round=contact('round_shield');assert.equal(round.damage,24);
 assert.ok(contact('buckler').damage>round.damage);assert.ok(contact('tower_shield').damage<round.damage);assert.ok(contact('kite_shield').damage<=round.damage);
 const dead=contact('bone_shield',true,false),living=contact('bone_shield',false,false);assert.ok(dead.damage<living.damage);assert.ok(dead.damage/living.damage>.85);
 for(const id of bases){const r=contact(id);assert.equal(r.events.filter(e=>e.type==='shieldBlock').length,1);assert.ok(r.damage>0);}
});
test('versioned snapshots preserve guest model identity and reject invalid additions while old packets still decode',()=>{
 for(const id of bases){const {w}=contact(id);w.round={stageId:'S1',state:'running',pending:[]};const packet=encodeSnapshot(w);assert.deepEqual(decodeSnapshot(packet,'p').entities[0].shieldModel,model(id));delete packet.entities[0].shieldModel;assert.ok(decodeSnapshot(packet,'p'));for(const bad of [{v:2,type:id},{v:1,type:'evil'},null]){packet.entities[0].shieldModel=bad;assert.equal(decodeSnapshot(packet,'p'),null);}}
});
test('four unique silhouettes use the same frame socket at all 8 facings, guard and bash, with redraw-safe shape changes',()=>{
 for(const id of bases)for(let d=0;d<8;d++)for(const action of [null,{id:'shield_bash'}]){
 const hand={x:13,y:-29,facing:d*Math.PI/4,scale:.8,behind:d>4},p=physicalShieldPose({kind:'player',weapon:'blade',offhand:'shield',shieldModel:model(id),facing:d*Math.PI/4,act:action},0,hand);assert.equal(p.shape,SHIELDS[id].shape);assert.equal(p.handX,13);assert.equal(p.handY,-29);assert.equal(p.behind,hand.behind);assert.ok(Math.hypot(p.x-13,p.y+29)<=6);
 const commands=[],g=new Proxy({},{get:(_,k)=>(...a)=>{commands.push([k,...a]);return g;}});drawPhysicalShield(g,p);assert.ok(commands.length>5);
 }
 assert.equal(new Set(bases.map(id=>physicalShieldPose({kind:'player',weapon:'blade',offhand:'shield',shieldModel:model(id),facing:Math.PI/2}).shape)).size,4);
});
test('reviewed WebP paths are distinct, decode headers valid, every rarity shares its own type',()=>{
 const paths=new Set();for(const id of bases)for(const [key,d]of Object.entries(ITEMS).filter(([,d])=>d.baseId===id)){const k=itemArtKey(key,d);assert.equal(k,id);const path=itemArtPath(k);paths.add(path);const bytes=readFileSync(new URL('../'+path,import.meta.url));assert.equal(bytes.subarray(0,4).toString(),'RIFF');assert.equal(bytes.subarray(8,12).toString(),'WEBP');}assert.equal(paths.size,4);
});
test('all shields enter seeded hunt-tier drops without extra gear or currency draws',()=>{
 const found=new Set();for(const tier of [1,2,3,4])for(let seed=0;seed<900&&!bases.every(id=>found.has(id));seed++)for(const i of rollDrops('goblin_chief',seed,{huntTier:tier}).items){const d=ITEMS[i.id];if(d.shieldType){assert.equal(d.huntTier,Math.min(3,tier));found.add(d.shieldType);}}
 assert.deepEqual([...found].sort(),bases.slice().sort());
});
test('recipes cost realistic primary material, share craft rarity path, salvage and sell cannot mint paid gold',()=>{
 for(const id of bases){let s=saved('round_shield');for(const [key,n]of Object.entries(RECIPES[id]))if(key!=='gold')s.stacks[key]=n+50;const before=structuredClone(s),made=craft(s,id),item=made.items.at(-1);assert.ok(validateSave(made));assert.equal(before.gold-made.gold,RECIPES[id].gold);assert.equal(ITEMS[item.id].baseId,id);const refund=dismantleRefund(item);const primary=id==='bone_shield'?'undead_bone':'scrap';assert.ok(refund<=Math.floor(RECIPES[id][primary]*.25));assert.ok(sellItem(made,item.uid).gold<before.gold);assert.ok(dismantle(made,item.uid).gold<=made.gold);}
});
test('safe enchant works through shared cap20 path without new passive enchant AC or losing model',()=>{
 for(const id of bases){const s=saved(id);s.stacks.enhance_stone_1=50;const before=deriveMods(s),next=enchant(s,'shield','enhance_stone_1').save;assert.equal(next.items.find(i=>i.uid==='shield').enhance,1);assert.equal(deriveMods(next).ac,before.ac);assert.deepEqual(deriveMods(next).shieldModel,model(id));assert.ok(validateSave(next));}
});
test('merchant keeps original guaranteed offer and rotates all four shield types over refreshes',()=>{
 const seen=new Set();for(let refresh=0;refresh<120;refresh++){const stock=shopStock(19,refresh);assert.equal(stock.find(i=>i.uid.endsWith('offhand:0')).id,'round_shield');const i=stock.find(i=>i.uid.endsWith('offhand:1'));seen.add(ITEMS[i.id].shieldType);assert.ok(['common','fine'].includes(ITEMS[i.id].rarity));assert.equal(i.price,gearPrice(i));}assert.deepEqual([...seen].sort(),bases.slice().sort());
});

test('host reconstructs new shield identity from validated save, never a guest claimed mod',async()=>{
 const {CoopSession}=await import('../js/net/session.js');const config={stageId:'S2',seed:1,threat:1};
 const trusted=saved('buckler');trusted.cleared.S1=true;
 const profiles={host:{combatVersion:3,weapon:'blade',level:30,mods:{offhand:'shield',shieldModel:model('tower_shield')},rewardSave:trusted,lineage:'human',role:'hunter'},guest:{combatVersion:3,weapon:'blade',level:1,mods:{offhand:'shield',shieldModel:model('tower_shield')}}};
 const c=new CoopSession({uid:'host',host:'host',players:['host','guest'],profile:profiles.host,config});c.begin({profiles,config,seed:1});
 assert.deepEqual(c.world.entities.find(e=>e.pid==='host').shieldModel,model('buckler'));assert.equal(c.world.entities.find(e=>e.pid==='guest').shieldModel,undefined);
});
