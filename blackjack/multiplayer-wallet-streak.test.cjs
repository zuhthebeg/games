const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

assert(html.includes('function applyMultiWalletSettlement'), 'client should apply multiplayer settlement to SharedWallet exactly once');
assert(html.includes('applyMultiWalletSettlement(gs, data)'), 'settled event handler should apply wallet delta from authoritative state');
assert(html.includes('mpAppliedSettlementKeys'), 'client should dedupe repeated settled events/state refreshes');
assert(!html.includes('walletRemove(hand.bet);\n        }\n        await mpUI.sendAction({ type: "double" })'), 'double should not deduct local wallet before server settlement');
assert(!html.includes('walletRemove(hand.bet);\n        }\n        await mpUI.sendAction({ type: "split" })'), 'split should not deduct local wallet before server settlement');
assert(html.includes('streakDisplay'), 'multiplayer player rows should render each player streak');
assert(html.includes('p.streak'), 'multiplayer player rows should read streak from server player state');
assert(html.includes('canCoverExtraBet'), 'double/split buttons should require enough local gold without deducting early');
assert(html.includes('alert(t("goldInsufficient"));'), 'double/split actions should block when local gold cannot cover extra bet');

console.log('PASS multiplayer wallet settlement and streak display');
