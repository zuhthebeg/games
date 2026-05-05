const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

const keys = [
  'trade', 'tradeModalTitle', 'giveResources', 'wantResources', 'cancel', 'bankTrade', 'proposeTrade',
  'tradeProposal', 'tradeGive', 'tradeWant', 'accept', 'reject', 'insufficientResources',
  'myResourceSnapshot', 'myResources', 'onAcceptDelta', 'noTradeableAI', 'tradeProposalSending',
  'tradeOfferSent', 'tradeOfferSendFailed',
  'robberAppeared', 'robberToast', 'robberSevenHint', 'discardCardsPrompt', 'remainingPick',
  'heldCards', 'leftCards', 'confirmDiscard', 'needMoreCards', 'chooseVictim', 'playerColor',
  'cardsCount', 'ownBankOpponents',
  'resBrick', 'resLumber', 'resWool', 'resGrain', 'resOre'
];
for (const key of keys) assert(html.includes(`${key}:`), `PINGTAN_I18N should include ${key}`);

const snippets = [
  'pt("tradeModalTitle")', 'pt("giveResources"', 'pt("wantResources"', 'pt("cancel")',
  'pt("bankTrade")', 'pt("proposeTrade")', 'pt("tradeProposal")', 'pt("tradeGive")',
  'pt("tradeWant")', 'pt("accept")', 'pt("reject")', 'pt("insufficientResources")',
  'pt("myResourceSnapshot")', 'pt("myResources"', 'pt("onAcceptDelta")',
  'pt("robberAppeared")', 'pt("robberToast")', 'pt("robberSevenHint")',
  'pt("discardCardsPrompt"', 'pt("remainingPick"', 'pt("heldCards"', 'pt("leftCards"',
  'pt("confirmDiscard")', 'pt("needMoreCards"', 'pt("chooseVictim")',
  'pt("playerColor")', 'pt("cardsCount"', 'pt("ownBankOpponents"', 'resourceName(r)'
];
for (const snippet of snippets) assert(html.includes(snippet), `modal UI should use i18n snippet ${snippet}`);

const koreanOnlySnippets = [
  '<h3>💱 거래</h3>', '>📤 줄 자원', '>📥 받을 자원', '>🏦 은행</button>',
  '>🤝 제안</button>', '🦹 도둑 출현!</div>', '내 자원 (수락 시 증감)</div>'
];
for (const snippet of koreanOnlySnippets) {
  assert(!html.includes(snippet), `modal UI should not keep hard-coded Korean snippet: ${snippet}`);
}

console.log('PASS pingtan modal i18n');
