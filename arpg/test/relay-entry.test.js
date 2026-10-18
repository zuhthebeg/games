import test from 'node:test';
import assert from 'node:assert/strict';
import { invitationUrl, roomEntry } from '../js/net/lobby.js';
test('copied invitation preserves ordinary room, never host lineage or opt-in mode',()=>{
 const url=new URL(invitationUrl('https://game.cocy.io/arpg/?character=skeleton_knight&u=host&coopTest=host&dev=1','r123',true));
 assert.equal(url.searchParams.get('room'),'r123');assert.equal(url.searchParams.get('invasion'),null);assert.equal(url.searchParams.get('relay'),'do');
 for(const key of ['character','u','coopTest','coopRelayTest'])assert.equal(url.searchParams.has(key),false,key);
});
test('ordinary invitation offers local character selection and cannot inherit invasion mode',()=>{
 const url=new URL(invitationUrl('https://game.cocy.io/arpg/?character=human&invasion=1','r456',false));
 assert.equal(url.searchParams.has('character'),false);assert.equal(url.searchParams.has('invasion'),false);
});
test('any room entry selects local slot, including legacy links',()=>{
 for(const suffix of ['','&character=human','&character=skeleton_knight','&dev=1']){
  const entry=roomEntry(new URLSearchParams('room=r123&invasion=1'+suffix));assert.equal(entry.invasionInvite,false);assert.equal(entry.legacyEntry,false);
 }
 assert.equal(roomEntry(new URLSearchParams('room=legacy')).legacyEntry,false);
 assert.equal(roomEntry(new URLSearchParams('character=skeleton_knight&room=legacy')).legacyEntry,false);
});

// Existing and fresh slots join the same ordinary room without a tutorial or consent.
import { HubUI } from '../js/ui/hub.js';
import { createSave } from '../js/meta/save.js';
test('pending room joins once from the selected local slot',()=>{
 const h=Object.assign(Object.create(HubUI.prototype),{roomInvite:true,save:createSave({name:'H',answers:[0,0,0,0,0],createdAt:1}),startCoop(stage){this.joined=stage;}});
 h.showInn();assert.ok(h.joined);assert.equal(h.roomInvite,false);
});
test('new human from room invitation is saved then joins, never auto tutorial',()=>{
 const h=Object.assign(Object.create(HubUI.prototype),{roomInvite:true,name:'Fresh',answers:[0,0,0,0,0],commit(s){this.save=s;},startCoop(stage){this.joined=stage;},launch(){throw Error('must not launch');}});
 h.action('create',{});assert.ok(h.joined);assert.equal(h.save.name,'Fresh');assert.equal(h.save.activeInvasion,undefined);
});
test('existing skeleton invitation uses chosen local slot and same normal room',()=>{
 const save={...createSave({name:'Bone',answers:[0,0,0,0,0],createdAt:123}),lineage:'skeleton_knight'};
 const h=Object.assign(Object.create(HubUI.prototype),{roomInvite:true,initialCharacters:{read:()=>save,human:()=>{throw Error('must not read human');}},startCoop(stage){this.joined=stage;}});
 h.action('choose-skeleton',{});assert.equal(h.save,save);assert.ok(h.joined);
});
