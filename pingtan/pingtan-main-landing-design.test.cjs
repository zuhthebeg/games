const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

const keys = [
  'heroEyebrow', 'heroTagline', 'heroSubcopy', 'heroNoInstall', 'heroFastRoom',
  'heroKReactions', 'heroBoardGame', 'heroSingleDesc', 'heroMultiDesc'
];
for (const key of keys) assert(html.includes(`${key}:`), `PINGTAN_I18N should include ${key}`);

const classes = [
  '.pingtan-hero', '.pingtan-hero::before', '.pingtan-hero-title', '.pingtan-hero-tagline',
  '.pingtan-hero-stats', '.pingtan-hero-actions', '.pingtan-mode-button', '.pingtan-mode-button.primary'
];
for (const cls of classes) assert(html.includes(cls), `main landing should include ${cls}`);

const snippets = [
  'pingtan-hero', 'pt("heroEyebrow")', 'pt("heroTagline")', 'pt("heroSubcopy")',
  'pt("heroNoInstall")', 'pt("heroFastRoom")', 'pt("heroKReactions")', 'pt("heroBoardGame")',
  'pt("heroSingleDesc")', 'pt("heroMultiDesc")', 'showMapSelect(\'single\')', 'showMultiOptions()'
];
for (const snippet of snippets) assert(html.includes(snippet), `mode screen should use designed landing snippet ${snippet}`);

assert(html.includes('<h1 class="pingtan-hero-title">${PINGTAN_BRAND}</h1>'), 'mode screen should use designed hero title');

console.log('PASS pingtan main landing design');
