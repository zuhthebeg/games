const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const ai = fs.readFileSync(__dirname + '/ai.js', 'utf8');

assert(html.includes('async function sendAIMultiplayerTradeProposal'), 'multiplayer AI should have a relay trade proposal sender');
assert(html.includes('await sendAIMultiplayerTradeProposal(pIdx)'), 'multiplayer AI main turn should try player trade proposals');
assert(html.includes('type: "TRADE_PROPOSE"'), 'AI multiplayer trade should use the existing relay trade proposal action');
assert(html.includes('playerId: p.userId || p.id'), 'AI proposal should identify the AI as proposer');
assert(html.includes('aiTradeProposalFromLLM'), 'AI multiplayer trade should reuse LLM-style trade suggestion logic');
assert(ai.includes('leaderPressureBonus'), 'robber targeting should include leader pressure');
assert(ai.includes('nearVictoryBonus'), 'robber targeting should pressure near-victory players');
assert(ai.includes('effectiveHumanPenalty'), 'human penalty should be reduced when human is leading');

console.log('PASS multiplayer AI trade and leader pressure wiring');
