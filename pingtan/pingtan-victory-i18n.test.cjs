const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

const keys = [
  'winnerStatus', 'winnerHint', 'victoryPrizeToast', 'defeatToast', 'winnerTitle',
  'winnerGoalReached', 'shareResult', 'backToRoom', 'backToMapSelect', 'close',
  'gameOptionsLabel', 'turnTimeChangedLog', 'victoryVpChangedLog'
];
for (const key of keys) assert(html.includes(`${key}:`), `PINGTAN_I18N should include ${key}`);

const snippets = [
  'pt("winnerStatus"', 'pt("winnerHint"', 'pt("victoryPrizeToast"', 'pt("defeatToast"',
  'pt("winnerTitle"', 'pt("winnerGoalReached"', 'pt("shareResult")', 'pt("backToRoom")',
  'pt("backToMapSelect")', 'pt("close")', 'pt("gameOptionsLabel")',
  'pt("turnTimeChangedLog"', 'pt("victoryVpChangedLog"'
];
for (const snippet of snippets) assert(html.includes(snippet), `victory/result UI should use i18n snippet ${snippet}`);
assert(html.includes('renderWinnerModal()'), 'game screen should render the winner modal for all local players');
assert(html.includes('const isMe = state.winner === localPlayerIndex();'), 'winner modal should distinguish victory and defeat views');

const hardcodedUi = [
  '승자: ${state.players[state.winner].name}', '${escapeHtml(winner.name)} 승리!',
  '📣 결과 공유</button>',   ];
for (const snippet of hardcodedUi) {
  assert(!html.includes(snippet), `victory/result UI should not keep hard-coded Korean snippet: ${snippet}`);
}

console.log('PASS pingtan victory/result i18n');
