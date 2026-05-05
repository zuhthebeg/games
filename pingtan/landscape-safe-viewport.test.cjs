const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync('index.html', 'utf8');

assert(
  html.includes('function syncpingtanViewportMetrics'),
  'pingtan should sync visualViewport height/offset for mobile landscape webviews'
);
assert(
  html.includes('--pingtan-vh'),
  'CSS should use a JS-backed viewport height variable instead of raw 100dvh only'
);

const appRule = html.match(/#app\s*\{[\s\S]*?\n\s*\}/)?.[0] || '';
assert(appRule.includes('var(--pingtan-vh, 100dvh)'), 'base #app height should use corrected viewport height');
assert(!appRule.includes('- 44px - env(safe-area-inset-bottom)'), 'base #app height must not subtract the turn banner and then also pad for it');
assert(appRule.includes('- env(safe-area-inset-top)'), 'base #app height should account for top safe area/body offset');

const landscapeRule = html.match(/@media \(orientation: landscape\) and \(max-height: 560px\) \{[\s\S]*?\.status \{ display: none; \}/)?.[0] || '';
assert(landscapeRule.includes('var(--pingtan-vh, 100dvh)'), 'landscape #app height should use corrected viewport height');
assert(!landscapeRule.includes('- 44px - env(safe-area-inset-bottom)'), 'landscape #app height must not double-subtract the turn banner');
assert(landscapeRule.includes('padding-top: calc(var(--turn-banner-height) + 2px)'), 'landscape #app should reserve banner space with padding, not height subtraction');

assert(
  html.includes('window.visualViewport.addEventListener("resize", syncpingtanViewportMetrics'),
  'visualViewport resize should resync pingtan viewport metrics'
);

console.log('PASS pingtan landscape safe viewport');
