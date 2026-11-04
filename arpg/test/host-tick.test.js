import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startNetworkTicks, suspendHiddenSession, hostWaitingLabel } from '../js/net/host-tick.js';
import { TICK_MS } from '../js/sim/core.js';
import { pair } from './fixtures/invasion-party.js';
import { emptyInput } from '../js/sim/world.js';

function fixture(fail = false) {
  let now = 0, callback, interval, terminated = 0;
  class Worker { constructor(url) { assert.ok(url instanceof URL); if (fail) throw Error('CSP'); } postMessage(ms) { assert.equal(ms, TICK_MS); } terminate() { terminated++; } }
  let worker;
  class FakeWorker extends Worker { constructor(url) { super(url); worker = this; } }
  return { options: { Worker: FakeWorker, now: () => now, setInterval: (fn, ms) => { callback = fn; interval = ms; return 42; }, clearInterval: id => assert.equal(id, 42) },
    fire: ms => { now += ms; if (worker) worker.onmessage(); else callback(); }, get interval() { return interval; }, get terminated() { return terminated; }, get worker() { return worker; } };
}
test('hidden host keeps TICK_MS updates through worker without window timer', () => {
  const f = fixture(), calls = [];
  const stop = startNetworkTicks(dt => calls.push(dt), f.options);
  for (let i = 0; i < 300; i++) f.fire(TICK_MS);
  assert.equal(f.interval, undefined); assert.equal(calls.length, 300);
  for (const dt of calls) assert.ok(Math.abs(dt - TICK_MS) < 1e-9);
  stop(); assert.equal(f.terminated, 1);
});
test('Worker construction failure falls back to existing interval cadence', () => {
  const f = fixture(true), calls = [];
  const stop = startNetworkTicks(dt => calls.push(dt), f.options);
  f.fire(TICK_MS); assert.equal(f.interval, TICK_MS); assert.deepEqual(calls, [TICK_MS]); stop();
});
test('asynchronous worker failure switches to one fallback and terminates worker', () => {
  const f = fixture(), calls = [];
  const stop = startNetworkTicks(dt => calls.push(dt), f.options);
  f.worker.onerror({ preventDefault() {} }); assert.equal(f.interval, TICK_MS); assert.equal(f.terminated, 1); stop();
});
test('visibility suspend excludes host but retains guest and solo behavior', () => {
  let calls = 0; const suspend = () => calls++;
  suspendHiddenSession({isHost:true,suspend}); assert.equal(calls,0);
  suspendHiddenSession({isHost:false,suspend}); assert.equal(calls,1);
  suspendHiddenSession(null); assert.equal(calls,1);
});
test('guest waiting label uses existing snapshot clock and clears on recovery', () => {
  const s = {isHost:false,phase:'running',now:2000,lastHostAt:500};
  assert.equal(hostWaitingLabel(s),'방장:대기');
  s.lastHostAt=2000; assert.equal(hostWaitingLabel(s),'');
  s.lastHostAt=0; s.isHost=true; assert.equal(hostWaitingLabel(s),'');
  assert.equal(hostWaitingLabel(null),'');
});
test('main routes network ticks and visibility while retaining clamp and empty input', () => {
 const main = readFileSync(new URL('../js/main.js',import.meta.url),'utf8');
 for (const needle of ['startNetworkTicks(', 'suspendHiddenSession(coopSession)', 'hidden || !input.enabled ? emptyInput()', 'hostWaitingLabel(coopSession)', 'else if (coopSession && !coopSession.isHost) resumeCoop()']) assert.ok(main.includes(needle),needle);
 assert.ok(readFileSync(new URL('../js/net/session.js',import.meta.url),'utf8').includes('Math.min(250, dt)'));
});

test('real hidden host advances and broadcasts for ten seconds without suspending or resuming', () => {
  const {s}=pair({invasion:false,guestLineage:'human',guestRole:'hunter',guestConsent:false});
  const host=s.host, f=fixture();
  assert.equal(host.phase,'running');
  host.world.round.goal='timer';host.world.round.timerTicks=1e7;
  let suspends=0; const original=host.suspend.bind(host);host.suspend=()=>{suspends++;original();};
  const start=host.world.tick, snaps=host.snapshots, resumes=host.resumeStats.count;
  const stop=startNetworkTicks(dt=>host.update(dt,emptyInput()),f.options);
  suspendHiddenSession(host);
  for(let i=0;i<300;i++)f.fire(TICK_MS);
  assert.equal(suspends,0);assert.equal(host.suspended,false);assert.equal(host.resumeStats.count,resumes);
  assert.ok(host.world.tick-start>=299);assert.ok(host.snapshots-snaps>=149);
  stop();
});
