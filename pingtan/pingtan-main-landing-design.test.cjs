const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

const keys = [
  'heroEyebrow', 'heroTagline', 'heroSubcopy', 'heroSingleDesc', 'heroMultiDesc',
  'menuDiceCue', 'menuRobberCue', 'menuTradeCue', 'menuBuildCue', 'menuTradeToken'
];
for (const key of keys) assert(html.includes(`${key}:`), `PINGTAN_I18N should include ${key}`);

const classes = [
  '.pingtan-title-menu', '.pingtan-board-stage', '.pingtan-menu-hex', '.pingtan-menu-token',
  '.pingtan-menu-dice', '.pingtan-menu-robber', '.pingtan-menu-actions', '.pingtan-mode-button.primary'
];
for (const cls of classes) assert(html.includes(cls), `main mode screen should include game-menu class ${cls}`);

const snippets = [
  'pingtan-title-menu', 'pingtan-board-stage', 'pingtan-menu-hex brick', 'pingtan-menu-hex lumber',
  'pingtan-menu-token pingtan-menu-dice dice', 'pingtan-menu-robber', 'pt("menuDiceCue")', 'pt("menuRobberCue")', 'pt("menuTradeToken")',
  'showMapSelect(\'single\')', 'showMultiOptions()', 'renderPingtanLangSwitch()', 'onAiDifficultyChange(this.value)'
];
for (const snippet of snippets) assert(html.includes(snippet), `mode screen should use game-menu snippet ${snippet}`);

assert(html.includes('<h1 class="pingtan-menu-title">${PINGTAN_BRAND}</h1>'), 'mode screen should use game title, not marketing hero title');
assert(!html.includes('pingtan-hero-stats'), 'main mode should not use marketing stat/chip strip');
assert(!html.includes('heroNoInstall'), 'main mode should not promote no-install marketing chips');
assert(!html.includes('heroFastRoom'), 'main mode should not promote link-sharing marketing chips');

console.log('PASS pingtan main game-menu design');
