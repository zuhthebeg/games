import test from 'node:test';
import assert from 'node:assert/strict';
import { victoryResultDelay } from '../js/ui/victory-result-delay.js';
test('victory presents exactly once after 3000ms; duplicate events do not restart clock',()=>{
 const timer=victoryResultDelay(), receipt={terminal:'clear'};let shown=0;
 timer.schedule(receipt,()=>shown++,100);timer.update(100);timer.update(3099);assert.equal(shown,0);
 timer.schedule(receipt,()=>shown++,3099);timer.update(3100);timer.update(9000);timer.schedule(receipt,()=>shown++,9000);
 assert.equal(shown,1);assert.equal(timer.pending,false);
});
test('death and return stay immediate; defeat supersedes pending victory',()=>{
 const timer=victoryResultDelay();let shown=0;timer.schedule({terminal:'clear'},()=>shown++,0);
 timer.schedule({terminal:'death'},()=>shown++,1);assert.equal(shown,1);timer.update(5000);assert.equal(shown,1);
 timer.schedule({terminal:'return_scroll'},()=>shown++,2);assert.equal(shown,2);
});
test('new run/menu/dispose cancellation prevents stale modal; next victory gets own clock',()=>{
 const timer=victoryResultDelay();let shown=0;timer.schedule({terminal:'clear'},()=>shown++,0);timer.cancel();timer.update(5000);assert.equal(shown,0);
 timer.schedule({terminal:'clear'},()=>shown++,6000);timer.update(8999);assert.equal(shown,0);timer.update(9000);assert.equal(shown,1);
});

test('clear cue appears instantly and hides on result',()=>{
 let cue=0, hidden=0, shown=0;
 const timer=victoryResultDelay({onClear:()=>cue++,onCancel:()=>hidden++});
 timer.schedule({terminal:'clear'},()=>shown++,10);
 assert.equal(cue,1); assert.equal(shown,0);
 timer.update(3009); assert.equal(shown,0);
 timer.update(3010); assert.equal(shown,1); assert.equal(hidden,1);
});
