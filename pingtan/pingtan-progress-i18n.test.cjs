const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

const keys = [
  'autoEndNoActions', 'turnRollHint', 'initialSettlementHint', 'secondSetupHint', 'mainGameStartHint',
  'multiplayerStartSetup', 'connectedRoadHint', 'settlementBuiltHint', 'roadBuiltHint', 'cityBuiltHint',
  'devDeckEmpty', 'devCardCostMissing', 'devCardBought', 'devCardToast', 'noKnightCard', 'knightUseHint',
  'knightCardToast', 'noMonopolyCard', 'monopolyFailed', 'monopolyUsedHint', 'monopolyToast',
  'noRoadBuildingCard', 'roadBuildingHint', 'roadBuildingRemainingHint', 'roadBuildingDoneHint', 'roadBuildingToast',
  'noYearOfPlentyCard', 'yearOfPlentyHint', 'yearOfPlentyToast', 'noResources', 'chooseWantedResource',
  'bankTradeUnavailable', 'bankTradeHint', 'insufficientTradeResources', 'tradeSuccessToast',
  'tradeAcceptedToast', 'tradeMatchedToast', 'tradeRejectedToast', 'tradeOfferToast', 'noTradeAccepted',
  'resourceMissingToast', 'initWaiting', 'hostGeneratingMap', 'multiplayerRecovered', 'initializingGame'
];
for (const key of keys) assert(html.includes(`${key}:`), `PINGTAN_I18N should include ${key}`);

const snippets = [
  'pt("autoEndNoActions")', 'pt("turnRollHint"', 'pt("initialSettlementHint")', 'pt("secondSetupHint")',
  'pt("mainGameStartHint")', 'pt("multiplayerStartSetup")', 'pt("connectedRoadHint")',
  'pt("settlementBuiltHint")', 'pt("roadBuiltHint")', 'pt("cityBuiltHint")', 'pt("devDeckEmpty")',
  'pt("devCardCostMissing")', 'pt("devCardBought")', 'pt("devCardToast")', 'pt("noKnightCard")',
  'pt("knightUseHint")', 'pt("knightCardToast")', 'pt("noMonopolyCard")', 'pt("monopolyFailed")',
  'pt("monopolyUsedHint"', 'pt("monopolyToast"', 'pt("noRoadBuildingCard")', 'pt("roadBuildingHint"',
  'pt("roadBuildingRemainingHint"', 'pt("roadBuildingDoneHint")', 'pt("roadBuildingToast")',
  'pt("noYearOfPlentyCard")', 'pt("yearOfPlentyHint"', 'pt("yearOfPlentyToast"', 'pt("noResources")',
  'pt("chooseWantedResource")', 'pt("bankTradeUnavailable")', 'pt("bankTradeHint"',
  'pt("insufficientTradeResources")', 'pt("tradeSuccessToast")', 'pt("tradeAcceptedToast"',
  'pt("tradeMatchedToast"', 'pt("tradeRejectedToast"', 'pt("tradeOfferToast"', 'pt("noTradeAccepted")',
  'pt("resourceMissingToast"', 'pt("initWaiting")', 'pt("hostGeneratingMap")',
  'pt("multiplayerRecovered")', 'pt("initializingGame")'
];
for (const snippet of snippets) assert(html.includes(snippet), `progress UI should use i18n snippet ${snippet}`);

console.log('PASS pingtan progress hints/toasts i18n');
