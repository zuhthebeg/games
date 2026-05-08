const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

assert(html.includes('function formatCompactGold(value)'), 'snake should compact long gold values to keep HUD stable');
assert(html.includes('goldEarnedCompact'), 'earned HUD should have a compact stable value span');
assert(/\.stats\s*{[\s\S]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/.test(html), 'stats HUD should use fixed 3-column grid');
assert(/\.stat\s*{[\s\S]*min-width:\s*0;[\s\S]*overflow:\s*hidden;/.test(html), 'stat cells should not expand and shake layout');
assert(/\.stat-value\s*{[\s\S]*white-space:\s*nowrap;[\s\S]*font-variant-numeric:\s*tabular-nums;/.test(html), 'stat values should be single-line tabular numbers');
assert(/\.stat-label\s*{[\s\S]*white-space:\s*nowrap;/.test(html), 'stat labels should avoid broken Korean syllable wrapping');
assert(/\.next-value\s*{[\s\S]*overflow:\s*hidden;[\s\S]*text-overflow:\s*ellipsis;[\s\S]*white-space:\s*nowrap;/.test(html), 'next-level text should truncate instead of wrapping');
assert(html.includes("document.getElementById('goldEarnedCompact').textContent = formatCompactGold(goldEarned)"), 'earned HUD should render compact gold');
assert(!html.includes("document.getElementById('earned').textContent = goldEarned.toLocaleString() + 'G'"), 'earned HUD should not render unbounded long gold string');

console.log('PASS snake stable HUD layout');
