import test from 'node:test';
import assert from 'node:assert/strict';
import { clearRoomInvite, canStartParty } from '../js/net/lobby.js';
test('leaving an invite removes room routing without losing other URL state',()=>{
 assert.equal(clearRoomInvite('https://game.cocy.io/arpg/?room=ABCD&relay=do&character=human#play'),
   'https://game.cocy.io/arpg/?character=human#play');
});
test('host with three ready peers ignores own ready flag and disconnected ghost',()=>{
 const roster={hostUser:'host',connections:4,players:[{user:'host',ready:false},{user:'a',ready:true},{user:'b',ready:true},{user:'c',ready:true}]};
 const profiles={host:{},a:{},b:{},c:{},stale:{}};
 assert.equal(canStartParty(roster,'host',profiles),true);
 assert.equal(canStartParty({...roster,players:[...roster.players,{user:'stale',ready:false,disconnected:true}]},'host',profiles),true);
 assert.equal(canStartParty({...roster,players:roster.players.map(p=>p.user==='c'?{...p,ready:false}:p)},'host',profiles),false);
 assert.equal(canStartParty(roster,'host',{host:{},a:{},b:{}}),true); // profile negotiation follows ready/start, not a second lobby gate
});
