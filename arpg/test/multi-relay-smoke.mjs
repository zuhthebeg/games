import assert from 'node:assert/strict';
import { CoopSession } from '../js/net/session.js';
import { emptyInput } from '../js/sim/world.js';
import { fixtureSave } from './fixtures/multi-round.js';
import { buildRoundMods } from '../js/meta/run.js';
const base = process.env.ARPG_RELAY_TEST_URL || 'ws://127.0.0.1:8792';
const room = `arpg-test-${Date.now()}`;
const peers = {}, sessions = {}, rosters = {}, messages = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function wait(fn, label) {
  for (let i=0;i<150;i++) { if (fn()) return; await sleep(100); }
  throw new Error(`timeout: ${label}`);
}
try {
  for (const uid of ['host','guest']) {
    const ws = new WebSocket(`${base}/room/${room}?g=arpg&u=${uid}`); peers[uid] = ws;
    await new Promise((resolve,reject) => { ws.onopen=resolve; ws.onerror=reject; });
    ws.onmessage = ({data}) => {
      const d=JSON.parse(data); messages.push({uid,type:d.type});
      if (d.type==='roster') { rosters[uid]=d; sessions[uid]?.roster(d); }
      if (d.type==='started') {
        const save=fixtureSave(uid);
        sessions[uid]=new CoopSession({uid,host:'host',players:d.players,config:d.config,
          profile:{name:uid,level:save.level,weapon:'blade',mods:buildRoundMods(save),threats:{S2:1}},
          sendRt:data=>ws.send(JSON.stringify({type:'rt',data})),
          sendAction:action=>ws.send(JSON.stringify({type:'action',action})),
        });
      }
      if (d.type==='rt') sessions[uid]?.rt(d.from,d.data);
      if (d.type==='event') sessions[uid]?.action(d.event.data);
    };
    ws.send(JSON.stringify({type:'ready',ready:true}));
  }
  await wait(()=>rosters.host?.players.length===2,'2-person roster');
  assert.equal(rosters.host.hostUser,'host');
  peers.host.send(JSON.stringify({type:'start',config:{stageId:'S2',threat:1,seed:11}}));
  await wait(()=>sessions.host&&sessions.guest,'started for both');
  for(let i=0;i<20;i++) { sessions.guest.update(34,emptyInput()); sessions.host.update(34,emptyInput()); await sleep(15); }
  await wait(()=>sessions.host.world&&sessions.guest.buffer.frames.length,'profile handshake + guest snapshot');
  const player=sessions.host.world.entities.find(p=>p.pid==='guest'),x=player.x;
  for(let i=0;i<20;i++) { sessions.guest.update(34,{...emptyInput(),mx:1,autoAttack:false}); await sleep(10); sessions.host.update(34,emptyInput()); }
  assert.ok(player.x>x+20); assert.equal(sessions.guest.world,null);
  const view=sessions.guest.view(); assert.equal(view.entities.filter(p=>p.kind==='player').length,2);
  assert.ok(view.entities.some(p=>p.kind==='monster'));
  peers.guest.close(); await wait(()=>!sessions.host.world.entities.some(p=>p.pid==='guest'),'guest departure removal');
  console.log(JSON.stringify({passed:true,room,started:messages.filter(m=>m.type==='started').length,
    rtMessages:messages.filter(m=>m.type==='rt').length,guestMovement:player.x-x,guestOwnsSim:false,guestDeparture:true}));
} finally { for(const ws of Object.values(peers)) ws.close(); }
