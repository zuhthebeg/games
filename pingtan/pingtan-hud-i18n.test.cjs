const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

const keys = [
  'turnTimer', 'endTurn', 'road', 'settlement', 'city', 'devCard', 'roadBuilding',
  'settings', 'activityTitle', 'activityEmptyHint', 'noLog', 'robberMove',
  'setupSettlement', 'setupRoad'
];
for (const key of keys) assert(html.includes(`${key}:`), `PINGTAN_I18N should include ${key}`);

const snippets = [
  '${pt("turnTimer")}:', '${pt("endTurn")}', '${pt("clearTarget")}:',
  '${pt("road")}', '${pt("settlement")}', '${pt("city")}', '${pt("devCard")}',
  '${pt("roadBuilding")}', '${pt("settings")}', 'pt("activityTitle")',
  'pt("activityEmptyHint")', 'pt("noLog")', 'pt("robberMove")',
  'pt("setupSettlement")', 'pt("setupRoad")'
];
for (const snippet of snippets) assert(html.includes(snippet), `HUD should use i18n snippet ${snippet}`);

console.log('PASS pingtan HUD i18n');
