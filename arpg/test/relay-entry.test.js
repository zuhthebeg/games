import test from 'node:test';
import assert from 'node:assert/strict';
import { invitationUrl, roomEntry } from '../js/net/lobby.js';
test('invasion invitation preserves room and opt-in mode, never host lineage or identity',()=>{
 const url=new URL(invitationUrl('https://game.cocy.io/arpg/?character=skeleton_knight&u=host&coopTest=host&dev=1','r123',true));
 assert.equal(url.searchParams.get('room'),'r123');assert.equal(url.searchParams.get('invasion'),'1');assert.equal(url.searchParams.get('relay'),'do');
 for(const key of ['character','u','coopTest','coopRelayTest'])assert.equal(url.searchParams.has(key),false,key);
});
test('ordinary invitation stays human-only and cannot inherit invasion mode',()=>{
 const url=new URL(invitationUrl('https://game.cocy.io/arpg/?character=human&invasion=1','r456',false));
 assert.equal(url.searchParams.get('character'),'human');assert.equal(url.searchParams.has('invasion'),false);
});
test('invasion room entry always selects a local slot and requires consent, even debug entry',()=>{
 for(const suffix of ['','&character=human','&character=skeleton_knight','&dev=1']){
  const entry=roomEntry(new URLSearchParams('room=r123&invasion=1'+suffix));assert.equal(entry.invasionInvite,true);assert.equal(entry.legacyEntry,false);
 }
 assert.equal(roomEntry(new URLSearchParams('room=legacy')).legacyEntry,true);
 assert.equal(roomEntry(new URLSearchParams('character=skeleton_knight&room=legacy')).legacyEntry,false);
});

// Existing/new local characters reach consent without issuing a network join or auto tutorial.
import { HubUI } from '../js/ui/hub.js';
import { createSave } from '../js/meta/save.js';
test('pending invitation intercepts inn once, not future inn visits',()=>{
 const h=Object.assign(Object.create(HubUI.prototype),{invasionInvite:true,showInvasionConsent(){this.consented=true;}});
 h.showInn();assert.equal(h.consented,true);assert.equal(h.invasionInvite,false);
});
test('new human from invitation is saved then shown consent, never auto-launched into tutorial',()=>{
 const h=Object.assign(Object.create(HubUI.prototype),{invasionInvite:true,name:'Fresh',answers:[0,0,0,0,0],commit(s){this.save=s;},showInvasionConsent(){this.consent=true;},launch(){throw Error('must not launch');}});
 h.action('create',{});assert.equal(h.consent,true);assert.equal(h.save.name,'Fresh');assert.equal(h.save.activeInvasion,undefined);
});
test('existing skeleton invitation respects chosen slot before showing consent',()=>{
 const save={...createSave({name:'Bone',answers:[0,0,0,0,0],createdAt:123}),lineage:'skeleton_knight'};
 const h=Object.assign(Object.create(HubUI.prototype),{invasionInvite:true,initialCharacters:{read:()=>save,human:()=>{throw Error('must not read human');}},showInvasionConsent(){this.consent=true;}});
 h.action('choose-skeleton',{});assert.equal(h.save,save);assert.equal(h.consent,true);
});
