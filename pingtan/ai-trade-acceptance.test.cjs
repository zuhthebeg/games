const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

assert(html.includes('function evaluateAITradeOffer'), 'AI trade should have a local acceptance heuristic');
assert(html.includes('fairTradeAcceptChance'), 'fair trades should have a boosted accept chance');
assert(html.includes('favorableScore'), 'AI should auto-accept clearly favorable trades');
assert(html.includes('상대가 줄 것 = 당신이 받는 자원'), 'LLM prompt should clarify trade direction from AI perspective');
assert(html.includes('공정한 1:1 거래는 웬만하면 수락'), 'LLM prompt should tell AI to accept fair trades more often');
assert(html.includes('heuristic.accept'), 'trade flow should use heuristic acceptance before/with LLM');

console.log('PASS catan AI trade acceptance balance');
