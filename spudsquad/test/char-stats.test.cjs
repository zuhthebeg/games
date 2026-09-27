const {test}=require('node:test'),a=require('node:assert/strict'),S=require('../js/sim.js');
test('character stat modifiers add to base stats (not overwrite)',()=>{a.equal(S.createPlayer('a','basic').maxHp,10);a.equal(S.createPlayer('a','muscle').maxHp,15);a.equal(S.createPlayer('a','science').maxHp,7);a.equal(S.createPlayer('a','science').stats.range,40)});
