const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

assert(html.includes('function formatStealResourceText'), 'robber steal feedback should use a shared resource text formatter');
assert(html.includes('에게 ${formatStealResourceText(picked)}를 삥뜯겼습니다'), 'victim activity should say who stole what');
assert(html.includes('에게<br>${formatStealResourceText(picked)}를 삥뜯었다'), 'thief overlay should say who was stolen from and what was stolen');
assert(html.includes('background:rgba(0,130,80,0.92)') || html.includes('rgba(0,130,80,0.92)'), 'thief overlay should use a green/positive counterpart to the red victim overlay');

assert(html.includes('function publicVPForPlayer'), 'score rendering should distinguish public VP from hidden VP-card score');
assert(html.includes('hiddenDevVpForPlayer'), 'VP-card points should be hidden from opponents during the game');
assert(html.includes('state.winner !== null'), 'hidden VP should be revealed after final scoring/winner state');
assert(!html.includes('${p.vp}${lr}${la}</span>`'), 'turn banner should not directly expose raw VP for every opponent');

assert(html.includes('function grantSecondSetupResources(playerIdx, vIdx)'), 'second setup resource grant should be centralized');
assert(html.includes('if (hex.type === "gold")'), 'second setup should handle gold tiles specially');
assert(html.includes('state._pendingHumanGold += 1'), 'human gold setup reward should be selected with the gold picker');
assert(html.includes('setTimeout(() => resolveHumanGoldIfNeeded(), 0)'), 'multiplayer local setup gold should open picker after synced settlement action');

console.log('PASS robber feedback, hidden VP, and setup gold rules');
