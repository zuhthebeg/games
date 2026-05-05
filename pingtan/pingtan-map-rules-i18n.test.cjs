const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

const keys = [
  'mapNameStandard', 'mapNameCentralLake', 'mapNameFourIslands', 'mapNameVolcanicRing',
  'mapNameGreaterPingtan', 'mapNameCrescentPingtan', 'mapNameFrontierOutback', 'mapNameGoldRush',
  'mapNameTwinContinents', 'mapNameFogIslands', 'mapNamePrairie', 'mapNameMegaPingtan',
  'mapDescStandard', 'mapDescCentralLake', 'mapDescFourIslands', 'mapDescVolcanicRing',
  'mapDescGreaterPingtan', 'mapDescCrescentPingtan', 'mapDescFrontierOutback', 'mapDescGoldRush',
  'mapDescTwinContinents', 'mapDescFogIslands', 'mapDescPrairie', 'mapDescMegaPingtan',
  'manualTitle', 'manualGoal', 'manualResources', 'manualBuildCosts', 'manualProgress',
  'manualRobber', 'manualDevCards', 'manualTrade', 'manualSpecialScore',
  'manualResourcesLine', 'manualCostRoad', 'manualCostSettlement', 'manualCostCity', 'manualCostDevCard',
  'manualProgressStep1', 'manualProgressStep2', 'manualProgressStep3',
  'manualRobberBullet1', 'manualRobberBullet2', 'manualRobberBullet3',
  'manualKnightCard', 'manualRoadBuildingCard', 'manualYearOfPlentyCard', 'manualMonopolyCard', 'manualVpCard',
  'manualTradeTap', 'manualBankTradeRule', 'manualProposalRule', 'manualLongestRoad', 'manualLargestArmy',
  'settingsGame', 'settingsSound', 'settingsManual', 'settingsLeaveGame',
  'instantSettingsMessage', 'hostOnlySettingsMessage', 'lockedSettingsMessage', 'preSettlementSettingsMessage'
];
for (const key of keys) assert(html.includes(`${key}:`), `PINGTAN_I18N should include ${key}`);

const snippets = [
  'function mapName(', 'function mapDescription(', 'function mapBehavior(',
  'mapName(m.id)', 'mapDescription(m.id)', 'mapName(preset.id)', 'mapDescription(preset.id)',
  'pt("manualTitle")', 'pt("manualGoal")', 'pt("manualResources")', 'pt("manualBuildCosts")',
  'pt("manualProgress")', 'pt("manualRobber")', 'pt("manualDevCards")', 'pt("manualTrade")',
  'pt("manualSpecialScore")', 'pt("manualResourcesLine")', 'pt("manualCostRoad")',
  'pt("manualCostSettlement")', 'pt("manualCostCity")', 'pt("manualCostDevCard")',
  'pt("manualProgressStep1")', 'pt("manualProgressStep2")', 'pt("manualProgressStep3")',
  'pt("manualRobberBullet1")', 'pt("manualRobberBullet2")', 'pt("manualRobberBullet3")',
  'pt("manualKnightCard")', 'pt("manualRoadBuildingCard")', 'pt("manualYearOfPlentyCard")',
  'pt("manualMonopolyCard")', 'pt("manualVpCard")', 'pt("manualTradeTap")',
  'pt("manualBankTradeRule")', 'pt("manualProposalRule")', 'pt("manualLongestRoad")', 'pt("manualLargestArmy")', 'pt("settingsGame")', 'pt("settingsSound")', 'pt("settingsManual")',
  'pt("settingsLeaveGame")', 'pt("instantSettingsMessage")', 'pt("hostOnlySettingsMessage")',
  'pt("lockedSettingsMessage")', 'pt("preSettlementSettingsMessage")'
];
for (const snippet of snippets) assert(html.includes(snippet), `map/rules UI should use i18n snippet ${snippet}`);

const hardcodedUi = [
  '<span style="font-size:16px;font-weight:700;">📖 삥탄 가이드</span>',
  '<b>🎯 목표</b>: 현재 맵의 승리 점수 먼저 달성!',
  '<div style="font-weight:700;margin-bottom:8px;">⚙️ 설정</div>',
  '🗺️ 맵 선택 (호스트)',
  'return "설정 변경은 즉시 적용됩니다."'
];
for (const snippet of hardcodedUi) {
  assert(!html.includes(snippet), `map/rules UI should not keep hard-coded Korean snippet: ${snippet}`);
}

console.log('PASS pingtan map/rules/settings i18n');
