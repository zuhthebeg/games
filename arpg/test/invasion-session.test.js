import test from 'node:test';
import assert from 'node:assert/strict';
import {step,emptyInput} from '../js/sim/world.js';
import {pair} from './fixtures/invasion-party.js';
test('ordinary rooms reject hostile roles; explicit consent and actual skeletal lineage required',()=>{for(const options of [{invasion:false},{guestConsent:false},{guestLineage:'human'},{guestRole:'monster'},{guestRole:'hunter'}]){const{s}=pair(options);assert.equal(s.host.world,null,JSON.stringify(options));}});
test('consent room assigns opposing teams and skeletal monster allies without granting monster-count victory',()=>{const{s}=pair();assert.equal(s.host.phase,'running');const w=s.host.world,[h,g]=w.entities;assert.notEqual(h.team,g.team);assert.equal(g.skeletal,true);assert.equal(g.invasionRole,'invader');w.round.pending=[];w.entities=w.entities.filter(e=>e.kind==='player');step(w);assert.equal(h.terminal,null);assert.equal(w.round.state,'running');g.hp=0;g.dead=true;g.terminal='death';step(w);assert.equal(h.terminal,'clear');assert.notEqual(g.terminal,'clear');});
test('untrusted action START cannot create or replace an invasion host world',()=>{const{s}=pair({guestConsent:false});s.host.action({type:'ARPG_START',payload:{config:{stageId:'S2',threat:1,invasion:true},profiles:{host:s.host.profile,guest:{...s.guest.profile,invasionConsent:true}},seed:1}});assert.equal(s.host.world,null);});
test('real hostile melee hits human, allied undead target only human, and ordinary healing never heals an enemy',()=>{
 const{s}=pair(),w=s.host.world,[h,g]=w.entities;h.x=300;h.y=300;g.x=340;g.y=300;g.facing=Math.PI;w.round.pending=[];
 for(let i=0;i<35;i++)step(w,{guest:{...emptyInput(),attack:true,aimX:-1,aimY:0}});
 assert.ok(h.hp<h.maxHp);assert.equal(g.hp,g.maxHp);assert.equal(g.terminal,null);
});
test('role/config/profile mutation is rejected and running profile/rejoin never restores consumed revival',()=>{
 const{s}=pair();const w=s.host.world,g=w.entities.find(e=>e.pid==='guest');g.boneRevivalReady=false;
 s.host.rt('guest',{t:'profile',profile:{...s.guest.profile,role:'hunter',mods:{boneRevival:true}}});assert.equal(g.boneRevivalReady,false);assert.equal(g.invasionRole,'invader');
 s.host.roster({players:['host'],hostUser:'host'});s.host.roster({players:['host','guest'],hostUser:'host'});assert.ok(!s.host.world.entities.some(e=>e.pid==='guest'));
 const blocked=pair({guestConsent:false}).s;blocked.host.profiles.guest={...blocked.guest.profile,invasionConsent:true,team:0};blocked.host.tryStart();assert.equal(blocked.host.world,null);
});
test('one hunter does not scale monsters as two cooperative players; healing light harms only opposing skeleton',()=>{const{s}=pair();assert.equal(s.host.world.partyHpMult,1);const w=s.host.world,[h,g]=w.entities;w.round.pending=[];h.weapon='focus';h.skills=['healing_light',null,null];h.maxMp=h.mp=1000;g.x=h.x+40;g.y=h.y;g.hp=40;for(let i=0;i<40;i++)step(w,{host:{...emptyInput(),skillEdge:i===0}});assert.ok(g.hp<40);assert.equal(h.hp,h.maxHp);});

test('ordinary transport rejects a bare revival flag without five validated bone slot IDs',()=>{const{s}=pair({invasion:false,guestLineage:'human',guestRole:'hunter',guestConsent:false});assert.equal(s.host.phase,'running');const blocked=pair({guestConsent:false}).s;blocked.host.config={stageId:'S2',threat:1};blocked.host.profiles.host={weapon:'blade',mods:{boneRevival:true},threats:{S2:1}};blocked.host.profiles.guest={weapon:'blade',mods:{},threats:{S2:1}};blocked.host.tryStart();assert.equal(blocked.host.world,null);});
