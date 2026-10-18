import test from 'node:test';
import assert from 'node:assert/strict';
import { CoopSession } from '../js/net/session.js';
import { partyConfig, validLobbyProfile, validParty } from '../js/net/invasion.js';
import { createMemoryTransport } from '../js/net/loopback.js';
import { createSave } from '../js/meta/save.js';
import { createSkeletonSave } from '../js/meta/character-creation.js';
import { buildRoundMods } from '../js/meta/run.js';
import { emptyInput } from '../js/sim/world.js';
function profile(bone, name) {
 const save = bone ? createSkeletonSave({lineage:'skeleton_knight',name,answers:[0,0,0,0,0],createdAt:1}) : createSave({name,answers:[0,0,0,0,0],createdAt:1});
 save.cleared.S1 = true; save.activeInvasion = 'local-token-' + name;
 return {name,level:save.level,lineage:bone?'skeleton_knight':'human',role:bone?'invader':'hunter',rewardSave:save,weapon:'blade',mods:buildRoundMods(save),threats:{S2:1}};
}
for (const count of [2,3,4]) test(`ordinary S2 quest has ${count} total participants, skeleton always opposing`,()=>{
 const profiles = Object.fromEntries(Array.from({length:count},(_,i)=>['p'+i,profile(i===1,'P'+i)]));
 const players=Object.keys(profiles),network=createMemoryTransport(),sessions={};
 for(const uid of players){const transport=network.connect(uid,(from,p)=>p.t==='action'?sessions[uid].action(p.action):sessions[uid].rt(from,p));sessions[uid]=new CoopSession({uid,host:'p0',players,profile:profiles[uid],config:{stageId:'S2',threat:1},...transport});}
 for(const uid of players.slice(1))sessions[uid].update(34,emptyInput());
 const host=sessions.p0;assert.equal(host.phase,'running');assert.equal(host.world.round.stageId,'S2');assert.equal(host.world.entities.length,count);
 const human=host.world.entities.find(p=>p.pid==='p0'),bone=host.world.entities.find(p=>p.pid==='p1');
 assert.notEqual(bone.team,human.team);assert.equal(bone.invasionRole,'invader');
 for(const uid of players.slice(1)){assert.equal(sessions[uid].phase,'running');assert.equal(sessions[uid].world,null);}
 assert.equal(Object.keys(host.lootLedger.accounts).length,count);
 assert.deepEqual(host.lootLedger.accounts.p0.save.items,profiles.p0.rewardSave.items);
 host.roster({players:players.filter(id=>id!=='p1'),hostUser:'p0'});host.roster({players,hostUser:'p0'});
 assert.ok(!host.world.entities.some(p=>p.pid==='p1'),'mid-round reconnect cannot recreate/refill skeleton');
});
test('lobby config follows live ordinary roster, not an opt-in flag or old departed skeleton',()=>{
 const human=profile(false,'H'),bone=profile(true,'B'),config={stageId:'S2',threat:1};
 assert.equal(partyConfig(config,{h:human,b:bone}).invasion,true);
 assert.equal(partyConfig(config,{h:human}).invasion,false);
 for(const bad of [{...bone,role:'hunter'},{...bone,team:0},{...bone,lineage:'human'}])assert.equal(validLobbyProfile(bad),false);
 assert.equal(validLobbyProfile(bone),true);
 assert.equal(validParty(config,{h:human}),false);
 assert.equal(validParty(config,Object.fromEntries(Array.from({length:5},(_,i)=>['p'+i,human]))),false);
});
test('receiver cannot accept forged start, unknown sender, or its own skeleton rewritten as ally',()=>{
 const bone=profile(true,'B'),human=profile(false,'H');
 const guest=new CoopSession({uid:'b',host:'h',players:['h','b'],profile:bone,config:{stageId:'S2',threat:1}});
 const data={config:{stageId:'S2',threat:1},profiles:{h:human,b:human},seed:1};
 guest.action({type:'ARPG_START',payload:data});assert.equal(guest.phase,'prepare');
 guest.rt('b',{t:'snapshot',start:data});assert.equal(guest.phase,'prepare');
 guest.rt('outsider',{t:'snapshot',start:data});assert.equal(guest.phase,'prepare');
 guest.rt('h',{t:'snapshot',start:data});assert.equal(guest.phase,'prepare');
});
test('ordinary human-only start is sender-bound and stays cooperative without ledger',()=>{
 const h=profile(false,'H'),g=profile(false,'G');let packet;
 const host=new CoopSession({uid:'h',host:'h',players:['h','g'],profile:h,config:{stageId:'S2',threat:1},sendRt:p=>packet=p});
 const guest=new CoopSession({uid:'g',host:'h',players:['h','g'],profile:g,config:{stageId:'S2',threat:1}});
 host.rt('g',{t:'profile',profile:g});assert.equal(host.phase,'running');assert.equal(host.lootLedger,undefined);
 assert.equal(new Set(host.world.entities.map(p=>p.team)).size,1);
 guest.rt('g',packet);assert.equal(guest.phase,'prepare');guest.rt('h',packet);assert.equal(guest.phase,'running');assert.equal(guest.world,null);
});
