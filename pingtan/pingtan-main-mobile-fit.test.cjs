const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

assert(html.includes('#app.mode-app'), 'mode screen should remove in-game top banner padding with an explicit app class');
assert(html.includes('app.classList.toggle("mode-app", state.screen === "mode")'), 'render should set mode-app class directly instead of relying on :has');
assert(html.includes('padding-top: 0 !important;'), 'mode screen should use compact top padding instead of turn-banner spacing');
assert(html.includes('.pingtan-menu-actions { grid-template-columns: 1fr 1fr;'), 'mobile mode menu should keep single/multiplayer CTAs side by side so both are visible');
assert(html.includes('.pingtan-board-stage { min-height: 122px;'), 'mobile board preview should be compact enough to reveal controls');
assert(html.includes('.pingtan-menu-title { font-size: clamp(44px, 14vw, 72px);'), 'mobile title should be compact enough for the menu viewport');

console.log('PASS pingtan main mobile fit');
