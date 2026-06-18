const fs = require('fs');
const assert = require('assert');
const dir = __dirname;

// Task 3: DO multiplayer must settle gold from the server's authoritative zero-sum/net delta,
// applied once per round. Regression: the old code skipped settlement in DO mode.

// --- gostop: zero-sum scores[myId], settle once inside _resultShown-guarded mpResult ---
const gostop = fs.readFileSync(dir + '/gostop/index.html', 'utf8');
const gsResult = gostop.slice(gostop.indexOf('function mpResult('), gostop.indexOf('function mpResult(') + 900);
assert(/my>0 \? SharedWallet\.addGold\(my\) : SharedWallet\.removeGold\(-my\)/.test(gsResult),
  'gostop DO must settle my own zero-sum delta to the wallet');
assert(gostop.includes('if(MP._resultShown)return; MP._resultShown=true;'),
  'gostop settlement must be guarded once per round');

// --- mahjong: settle r.deltas[myId]; the !MP._doMode skip must be gone ---
const mj = fs.readFileSync(dir + '/mahjong/index.html', 'utf8');
const mjResult = mj.slice(mj.indexOf('function mpShowResult('), mj.indexOf('function mpShowResult(') + 2600);
assert(!mjResult.includes('!MP._doMode&&myDelta!==0&&typeof SharedWallet'),
  'mahjong must no longer skip wallet settlement in DO mode');
assert(mjResult.includes('if(myDelta!==0&&typeof SharedWallet') && mjResult.includes('SharedWallet.addGold(myDelta)'),
  'mahjong DO must settle its own delta');
assert(mj.includes('if(MP._resultShown)return; MP._resultShown=true;'),
  'mahjong settlement must be guarded once per round');

// --- blackjack: net payout delta, settled unconditionally (idempotency key guards double-apply) ---
const bj = fs.readFileSync(dir + '/blackjack/index.html', 'utf8');
const bjFn = bj.slice(bj.indexOf('function applyMultiWalletSettlement('), bj.indexOf('function applyMultiWalletSettlement(') + 1300);
assert(!/if \(!doClient\) \{/.test(bjFn), 'blackjack must no longer skip wallet settlement in DO mode');
assert(/if \(myDelta > 0\) walletAdd\(Math\.floor\(myDelta\)\);/.test(bjFn),
  'blackjack DO must apply the net payout delta to the wallet');
assert(bjFn.includes('mpAppliedSettlementKeys.add(key)') && bjFn.includes('mpAppliedSettlementKeys.has(key)'),
  'blackjack settlement must be idempotent per round (key guard)');

console.log('PASS DO wallet settlement (gostop/mahjong/blackjack)');
