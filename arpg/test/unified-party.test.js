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
 return {combatVersion:9,name,level:save.level,lineage:bone?'skeleton_knight':'human',role:bone?'invader':'hunter',rewardSave:save,weapon:'blade',mods:buildRoundMods(save),threats:{S2:1}};
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
 const h=profile(false,'H'),g=profile(false,'G');const packets=[];
 const host=new CoopSession({uid:'h',host:'h',players:['h','g'],profile:h,config:{stageId:'S2',threat:1},sendRt:p=>packets.push(p)});
 const guest=new CoopSession({uid:'g',host:'h',players:['h','g'],profile:g,config:{stageId:'S2',threat:1}});
 host.rt('g',{t:'profile',profile:g});assert.equal(host.phase,'running');assert.equal(host.lootLedger,undefined);
 assert.equal(new Set(host.world.entities.map(p=>p.team)).size,1);
 for(const packet of packets)guest.rt('g',packet);assert.equal(guest.phase,'prepare');for(const packet of packets)guest.rt('h',packet);assert.equal(guest.phase,'running');assert.equal(guest.world,null);
});

for (const mixed of [false,true]) test(`begin rejects ${mixed ? 'mixed' : 'human-only'} mode mismatch without changing local config`,()=>{
 const profiles={h:profile(false,'H'),g:profile(mixed,'G')};
 const guest=new CoopSession({uid:'g',host:'h',players:['h','g'],profile:profiles.g,config:{stageId:'S2',threat:1,invasion:!mixed}});
 guest.begin({config:{stageId:'S2',threat:1,invasion:mixed},profiles,seed:1,...(mixed?{runId:'test-run'}:{})});
 assert.equal(guest.phase,'prepare');assert.equal(guest.config.invasion,!mixed);assert.equal(guest.startData,undefined);
});

test('only host roster negotiation, not snapshot mode, can switch a human guest to a validated mixed party',()=>{
 const profiles={h:profile(true,'B'),g:profile(false,'H')};
 const guest=new CoopSession({uid:'g',host:'h',players:['h','g'],profile:profiles.g,config:{stageId:'S2',threat:1,invasion:false}});
 const data={config:{stageId:'S2',threat:1,invasion:true},profiles,seed:1,runId:'test-run'};
 const snapshot={t:'snapshot',start:data};
 guest.rt('h',snapshot);assert.equal(guest.phase,'prepare');assert.equal(guest.config.invasion,false);
 for(const from of ['g','outsider'])guest.rt(from,{t:'party',profiles});
 assert.equal(guest.config.invasion,false);
 for(const bad of [{...profiles,h:null},{...profiles,h:{...profiles.h,role:'hunter'}},{g:profiles.g},{...profiles,x:profiles.g},{...profiles,g:{...profiles.g,rewardSave:profile(false,'Changed').rewardSave}}])guest.rt('h',{t:'party',profiles:bad});
 assert.equal(guest.config.invasion,false);assert.equal(guest.negotiatedProfiles,undefined);
 guest.rt('h',{t:'party',profiles});assert.equal(guest.config.invasion,true);assert.equal(guest.phase,'prepare');assert.equal(guest.lootLedger,undefined);
 guest.begin({...data,config:{...data.config,invasion:false}});assert.equal(guest.phase,'prepare');
 guest.begin({...data,profiles:{...profiles,h:profile(true,'Other')}});assert.equal(guest.phase,'prepare');
 guest.begin({...data,config:{...data.config,stageId:'S20'}});assert.equal(guest.phase,'prepare');
 guest.begin(data);assert.equal(guest.phase,'running');assert.equal(guest.world,null);assert.equal(guest.config.invasion,true);
});
test('sender-bound negotiation prunes departed profiles and can derive human-only mode before begin',()=>{
 const h=profile(false,'H'),g=profile(false,'G'),b=profile(true,'B');
 const guest=new CoopSession({uid:'g',host:'h',players:['h','g','b'],profile:g,config:{stageId:'S2',threat:1,invasion:true}});
 guest.rt('h',{t:'party',profiles:{h,g,b}});assert.equal(guest.config.invasion,true);
 guest.roster({players:['h','g'],hostUser:'h'});
 guest.rt('h',{t:'party',profiles:{h,g,b}});assert.equal(guest.config.invasion,true);
 guest.rt('h',{t:'party',profiles:{h,g}});assert.equal(guest.config.invasion,false);
 guest.begin({config:{stageId:'S2',threat:1,invasion:false},profiles:{h,g},seed:1});assert.equal(guest.phase,'running');assert.equal(guest.lootLedger,undefined);
});

test('reordered snapshot waits for host negotiation and a repeated snapshot then starts without losing ledger data',()=>{
 const profiles={h:profile(false,'H'),g:profile(true,'B')},packets=[];
 const host=new CoopSession({uid:'h',host:'h',players:['h','g'],profile:profiles.h,config:{stageId:'S2',threat:1},sendRt:p=>packets.push(structuredClone(p))});
 const guest=new CoopSession({uid:'g',host:'h',players:['h','g'],profile:profiles.g,config:{stageId:'S2',threat:1}});
 host.rt('g',{t:'profile',profile:profiles.g});
 const snapshot=packets.find(p=>p.t==='snapshot'),party=packets.find(p=>p.t==='party');assert.ok(snapshot&&party);
 guest.rt('h',snapshot);assert.equal(guest.phase,'prepare');assert.equal(guest.invasionAccount,undefined);
 guest.rt('h',party);assert.equal(guest.phase,'prepare');assert.equal(guest.invasionAccount,undefined);
 guest.rt('h',{...snapshot,start:{...snapshot.start,config:{...snapshot.start.config,invasion:false}}});assert.equal(guest.phase,'prepare');
 guest.rt('h',snapshot);assert.equal(guest.phase,'running');assert.equal(guest.world,null);
 assert.deepEqual(guest.invasionAccount,host.lootLedger.state('g'));assert.equal(guest.startData.runId,host.startData.runId);
 guest.rt('h',{t:'party',profiles:{h:profiles.h,g:profiles.h}});assert.equal(guest.config.invasion,true);
});
