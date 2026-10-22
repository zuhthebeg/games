import test from 'node:test';
import assert from 'node:assert/strict';
import { victoryResultDelay } from '../js/ui/victory-result-delay.js';
test('victory presents exactly once after 5000ms; duplicate events do not restart clock',()=>{
 const timer=victoryResultDelay(), receipt={terminal:'clear'};let shown=0;
 timer.schedule(receipt,()=>shown++,100);timer.update(100);timer.update(5099);assert.equal(shown,0);
 timer.schedule(receipt,()=>shown++,5099);timer.update(5100);timer.update(9000);timer.schedule(receipt,()=>shown++,9000);
 assert.equal(shown,1);assert.equal(timer.pending,false);
});
test('death and return stay immediate; defeat supersedes pending victory',()=>{
 const timer=victoryResultDelay();let shown=0;timer.schedule({terminal:'clear'},()=>shown++,0);
 timer.schedule({terminal:'death'},()=>shown++,1);assert.equal(shown,1);timer.update(5000);assert.equal(shown,1);
 timer.schedule({terminal:'return_scroll'},()=>shown++,2);assert.equal(shown,2);
});
test('new run/menu/dispose cancellation prevents stale modal; next victory gets own clock',()=>{
 const timer=victoryResultDelay();let shown=0;timer.schedule({terminal:'clear'},()=>shown++,0);timer.cancel();timer.update(5000);assert.equal(shown,0);
 timer.schedule({terminal:'clear'},()=>shown++,6000);timer.update(10999);assert.equal(shown,0);timer.update(11000);assert.equal(shown,1);
});
