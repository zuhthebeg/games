const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

assert(html.includes('function myResourceSnapshotHtml'), 'dev card popups should render current owned resources');
assert(html.includes('function resourceDeckStatusHtml'), 'dev card popups should render resource/card availability counts');
assert(html.includes('const bank = bankRemaining(resource)'), 'popup resource counts should include the same bank remaining value as the game screen');
assert(html.includes('pt("ownBankOpponents", { own: owned, bank, opponents: others })'), 'popup resource counts should show localized owned/bank values like the game screen');
assert(html.includes('function monopolyGainPreview'), 'monopoly popup should preview how many cards can be stolen');
assert(html.includes('모노폴리 선택 시 획득 예정'), 'monopoly popup should show hidden board counts inside the popup');
assert(html.includes('풍년 선택'), 'year of plenty popup should show selected resources');
assert(html.includes('window._yopConfirm'), 'year of plenty should require a final confirm button');
assert(html.includes('sel.filter(Boolean).length === 2'), 'year of plenty confirm button should only enable after two selections');
assert(html.includes('선택 완료'), 'year of plenty popup should expose a completion button');
assert(html.includes('선택됨'), 'selected year of plenty resources should be visibly marked');
assert(html.includes('p.resources[sel[0]] += 1'), 'year of plenty should grant resources only after confirmation');

console.log('PASS pingtan dev card popup UX');
