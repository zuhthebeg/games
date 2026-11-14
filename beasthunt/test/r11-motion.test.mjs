import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const src=fs.readFileSync(new URL('../js/motion-authoring.js',import.meta.url),'utf8');
const ctx={THREE:{Vector3:class{},MathUtils:{clamp:(x,a,b)=>Math.max(a,Math.min(b,x))}}};vm.createContext(ctx);vm.runInContext(src.split(String.fromCharCode(10)).filter(x=>!x.startsWith('import ')).join(String.fromCharCode(10)).replace(/export /g,'')+String.fromCharCode(10)+'this.turns=whirlwindTurns;',ctx);
test('R11 whirlwind has exactly two turns, monotone yaw and continuous nonzero accent speed',()=>{
 const f=ctx.turns;assert.equal(f(-1),0);assert.equal(f(0),0);assert.equal(f(1),2);assert.equal(f(2),2);let last=0;
 for(let i=0;i<=10000;i++){const v=f(i/10000);assert.ok(v>=last-1e-12);last=v;}
 const e=1e-6;for(const u of [.28,.56]){const left=(f(u)-f(u-e))/e,right=(f(u+e)-f(u))/e;assert.ok(Math.abs(left-right)<.001);assert.ok(left>1);}
 assert.ok((f(e)-f(0))/e<.001);assert.ok((f(1)-f(1-e))/e<.001);
 assert.ok((f(.84)-f(.76))/.08>(f(.18)-f(.1))/.08);
});
test('R11 every skinned adapter authors recovery without replacing stun/dead source clips',()=>{
 for(const wt of ['bow','gs','db']){const s=fs.readFileSync(new URL('../js/'+wt+'-motion.js',import.meta.url),'utf8');assert.ok(s.includes(wt==='db'?'dualBladeClips(clips)':'recoveryClips(clips)'));}
 assert.ok(src.includes("c.name==='down'?authored:c"));assert.ok(src.includes('Hips.quaternion'));
});
test('R11 bow nock has no lag/clamp; arrow release is authoritative h0',()=>{
 const s=fs.readFileSync(new URL('../js/bow-motion.js',import.meta.url),'utf8');assert.doesNotMatch(s,/STR_MAX|nockPos.lerp/);assert.ok(s.includes('p.cur?.h0'));assert.match(s,/RightHandMiddle1/);
});
