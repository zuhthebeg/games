const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

// Regression: an AI-proposed trade could be accepted by BOTH the human and a host-run AI,
// paying the proposer twice. A proposal must now resolve exactly once.
assert(html.includes('function claimTradeProposal'), 'must have a single-claim helper for trade proposals');
assert(html.includes('function isTradeProposalResolved'), 'must expose a resolved check for the host AI accept timer');
assert(html.includes('resolvedTradeProposals: new Set()'), 'mpState must track resolved trade proposals');

// Apply handler (every client) is the claim authority for relayed accepts.
assert(/if \(!claimTradeProposal\(proposalId\)\) return true;/.test(html),
  'TRADE_ACCEPT apply handler must claim the proposal and ignore duplicates');

// Local optimistic accept must claim before mutating so a racing AI accept cannot also pay.
assert(/if \(!claimTradeProposal\(proposalId\)\) \{\s*\n\s*showToast\(pt\("tradeAlreadyResolved"\)/.test(html),
  'human accept click must claim the proposal before applying the swap');

// Host AI auto-accept timer must early-out if the proposal is already resolved.
assert(html.includes('if (isTradeProposalResolved(proposalId)) return;'),
  'host AI accept timer must skip already-resolved proposals');

// Ledger reset at the turn boundary so it does not grow unbounded.
assert(/reason === "turn-change" \|\| reason === "winner"[\s\S]*resolvedTradeProposals && mpState\.resolvedTradeProposals\.clear\(\)/.test(html),
  'resolved trade ledger must reset on turn change / game end');

console.log('PASS pingtan trade double-accept guard');
