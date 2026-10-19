import test from 'node:test';
import assert from 'node:assert/strict';
import {createSave,validateSave,SaveStore} from '../js/meta/save.js';
import {enchant,enchantPreview} from '../js/meta/enchant.js';
import {ENCHANT,ENCHANT_STONES,STONE,BLESSED_STONE,CURSED_STONE} from '../js/meta/economy.js';
import {deriveMods} from '../js/meta/stats.js';
import {enchantPresentation} from '../js/ui/enchant-fx.js';
import {socketsHtml} from '../js/ui/gear-view.js';
const fixture=(level,seed=1)=>{const s=createSave({name:'위험 검증',answers:[0,0,0,0,0],createdAt:seed});s.items[0].enhance=level;for(const id of ENCHANT_STONES)s.stacks[id]=1000;return s;};
test('cap20 preserves every old level and valid max saves roundtrip with finite derived stats',()=>{
 assert.equal(ENCHANT.max,20);const memory=new Map(),store=new SaveStore({getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)});
 for(let level=0;level<=20;level++){const s=fixture(level);assert.ok(validateSave(s));store.save(s);assert.deepEqual(store.load(),s);assert.ok(Object.values(deriveMods(s)).filter(v=>typeof v==='number').every(Number.isFinite));}
 assert.equal(validateSave(fixture(21)),false);
 for(const id of ENCHANT_STONES){const s=fixture(20),before=JSON.stringify(s);assert.throws(()=>enchant(s,'starter:weapon',id),/最大|최대/);assert.equal(JSON.stringify(s),before);}
});
test('unsafe cursed risk is resolved before every weighted branch; preview is unconditional and honest',()=>{
 for(const level of [6,11,12,16,19]){const counts=new Map(),n=10000,preview=enchantPreview(fixture(level),'starter:weapon',CURSED_STONE);
 assert.ok(preview.chance<1);assert.ok(preview.destroyChance>0);assert.ok(Math.abs(preview.probabilities.reduce((a,r)=>a+r.chance,0)-1)<1e-12);
 for(let seed=1;seed<=n;seed++){const s=fixture(level,seed),a=enchant(s,'starter:weapon',CURSED_STONE),key=a.result.outcome==='destroyed'?'destroyed':a.result.to;counts.set(key,(counts.get(key)||0)+1);assert.ok(validateSave(a.save));}
 for(const row of preview.probabilities){const actual=counts.get(row.to===null?'destroyed':row.to)||0,p=row.chance;assert.ok(Math.abs(actual-n*p)<5*Math.sqrt(n*p*(1-p))+3,`${level}/${row.to}: ${actual} vs ${n*p}`);}
 }
});
test('above12 every stone has escalating destruction risk and cost, ordinary luck cannot erase risk',()=>{
 for(const id of ENCHANT_STONES){let lastRisk=0,lastCost=0;for(let level=12;level<20;level++){const p=enchantPreview(fixture(level),'starter:weapon',id);assert.ok(p.destroyChance>lastRisk);assert.ok(p.cost>lastCost);lastRisk=p.destroyChance;lastCost=p.cost;}}
 for(const level of [12,19])for(const id of ENCHANT_STONES){const s=fixture(level);s.stacks[id]=enchantPreview(s,'starter:weapon',id).cost-1;const before=JSON.stringify(s);assert.throws(()=>enchant(s,'starter:weapon',id),/부족/);assert.equal(JSON.stringify(s),before);}
});
test('downgrade and unchanged never dispatch a success cue; inn sockets show actual level',()=>{
 assert.equal(enchantPresentation({id:'training_sword',outcome:'success',from:12,to:11}).sound,'enchant-down');
 assert.equal(enchantPresentation({id:'training_sword',outcome:'success',from:12,to:12}).sound,'hurt');
 for(const level of [12,20])assert.match(socketsHtml(fixture(level)),new RegExp(`data-enchant-level="${level}"[^>]*>\\+${level}`));
});

test('+20 host/guest profile survives JSON wire, restart handshake and finite pawn stats without guest authority',async()=>{
 const {buildRoundMods}=await import('../js/meta/run.js'),{CoopSession}=await import('../js/net/session.js'),{validLobbyProfile}=await import('../js/net/invasion.js');
 const profile=name=>{const rewardSave=fixture(20);rewardSave.name=name;rewardSave.cleared.S1=true;return JSON.parse(JSON.stringify({name,level:1,lineage:'human',role:'hunter',rewardSave,weapon:'blade',mods:buildRoundMods(rewardSave),threats:{S2:1}}));};
 const h=profile('Host'),g=profile('Guest'),packets=[];assert.ok(validLobbyProfile(h)&&validLobbyProfile(g));
 const host=new CoopSession({uid:'h',host:'h',players:['h','g'],profile:h,config:{stageId:'S2',threat:1},sendRt:p=>packets.push(JSON.parse(JSON.stringify(p)))});
 host.rt('g',{t:'profile',profile:g});assert.equal(host.phase,'running');
 for(const pawn of host.world.entities.filter(p=>p.kind==='player')){assert.ok(Number.isFinite(pawn.hp)&&Number.isFinite(pawn.dmgMult.blade));assert.equal(pawn.dmgMult.blade,buildRoundMods(g.rewardSave).dmgMult.blade);}
 for(let reconnect=0;reconnect<2;reconnect++){const guest=new CoopSession({uid:'g',host:'h',players:['h','g'],profile:g,config:{stageId:'S2',threat:1}});for(const packet of packets)guest.rt('h',packet);assert.equal(guest.phase,'running');assert.equal(guest.world,null);assert.equal(guest.profiles.g.rewardSave.items[0].enhance,20);}
});
