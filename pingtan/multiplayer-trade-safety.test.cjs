const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

assert(html.includes('function dismissActiveTradeProposals'), 'turn changes and game end should dismiss stale multiplayer trade proposal modals');
assert(html.includes('dismissActiveTradeProposals("turn-change")'), 'onTurnStart should close active trade proposals so old offers cannot be accepted on a later turn');
assert(html.includes('dismissActiveTradeProposals("winner")'), 'winner detection should close active trade proposals');
assert(html.includes('canPlayersExecuteTrade(proposer, me, offer, want)'), 'accept click should re-check both proposer and accepter resources before mutating');
assert(html.includes('canPlayersExecuteTrade(proposer, accepter, offer, want)'), 'TRADE_ACCEPT replay should re-check both sides before applying');
assert(html.includes('applyTradeSwap(proposer, me, offer, want)'), 'accept click should use the shared atomic trade swap helper');
assert(html.includes('applyTradeSwap(proposer, accepter, offer, want)'), 'remote accept should use the shared atomic trade swap helper');
assert(!html.includes('state.tradeRejectedThisTurn = true'), 'rejected trades should not arm auto turn-end; the player can trade again until the timer expires');
assert(html.includes('return; // Human turns should use their full timer after dice/trade decisions.'), 'auto-end should not consume the remaining human turn timer');
assert(html.includes('BUY_DEV_CARD: "BUY_DEV_CARD"'), 'multiplayer dev-card purchases should have an explicit synchronized action');
assert(html.includes('await sendGameAction(ACTION.BUY_DEV_CARD'), 'human multiplayer dev-card purchases should be sent through multiplayer action sync');
assert(html.includes('if (type === ACTION.BUY_DEV_CARD)'), 'remote clients should apply synchronized dev-card purchases');

console.log('PASS pingtan multiplayer trade safety and full-turn behavior');
