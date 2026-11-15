import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {Sim,FIXED_DT} from '../js/sim.js';
import {WTYPES} from '../js/data.js';
const base='2b8f8e3206befbcdfccf7c86428828836ed4d3e3';
const uri=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const oldData=execFileSync('git',['show',base+':beasthunt/js/data.js'],{encoding:'utf8'});
const oldSim=execFileSync('git',['show',base+':beasthunt/js/sim.js'],{encoding:'utf8'}).replace('./data.js?v=20261114fix',uri(oldData));
const {Sim:Old}=await import(uri(oldSim));const {WTYPES:OLD}=await import(uri(oldData));
const save=weapon=>({weapon,w:{gs:1,db:1,bow:1},armor:1});
function contact(Type,weapon,move,node,frac=0){
 const s=new Type({mon:'boar'},save(weapon),1);s.p.lock=false;s.p.x=s.p.z=0;s.mParts=()=>[{n:'body',x:0,z:1,r:.5}];
 s.startAtk(move,frac,node,0,false);s.drainEvents();const hp=s.m.hp;
 for(let i=0;i<100;i++){s.updPlayer(FIXED_DT);if(weapon==='bow')s.updProjs(FIXED_DT);}
 return {damage:hp-s.m.hp,st:s.p.st,hits:s.p.hits,nextEntity:s.nextEntity,events:s.drainEvents()};
}
for(const weapon of ['gs','db','bow'])test(weapon+' exact legacy-to-R20 actual normal damage delta, independent frozen base data',()=>{
 const before=[],after=[];
 for(let i=0;i<WTYPES[weapon].light.length;i++){
  before.push(contact(Old,weapon,OLD[weapon].light[i%OLD[weapon].light.length],i%OLD[weapon].light.length).damage);
  after.push(contact(Sim,weapon,WTYPES[weapon].light[i],i).damage);
 }
 assert.deepEqual(before,{gs:[29,34,53],db:[12,12,12,22],bow:[12,12,12]}[weapon]);
 assert.deepEqual(after,{gs:[29,37,53],db:[10,12,15,25],bow:[10,12,15]}[weapon]);
 console.log('R20 actual isolated body contact '+weapon+' '+JSON.stringify(before)+' -> '+JSON.stringify(after));
});
for(const weapon of ['gs','db','bow'])for(const frac of [0,.5,1])test(weapon+' heavy actual damage/contact/stamina/events exactly unchanged at charge '+frac,()=>{
 assert.deepEqual(contact(Sim,weapon,WTYPES[weapon].heavy,-1,frac),contact(Old,weapon,OLD[weapon].heavy,-1,frac));
});
for(const node of [3,4])test('GS B node '+node+' real damage/events unchanged',()=>{
 assert.deepEqual(contact(Sim,'gs',WTYPES.gs.combo.moves[node],node),contact(Old,'gs',OLD.gs.combo.moves[node],node));
});
