const fs = require('fs');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

assert(html.includes('function formatGoldAmount(value)'), 'gold amount formatter should exist');
assert(html.includes('CHIP_VALUE = 1'), 'table unit should be treated as gold, not chip conversion');
assert(html.includes('id="opponentChips">1,000G</span>'), 'opponent balance should render with gold unit by default');
assert(html.includes('id="myChips">1,000G</span>'), 'player balance should render with gold unit by default');
assert(html.includes('팟: <span class="pot-amount" id="potAmount">0G</span>'), 'pot should render with gold unit by default');
assert(html.includes('formatGoldAmount(game.myChips)'), 'single player balances should use gold formatter');
assert(html.includes('formatGoldAmount(me.chips)'), 'multiplayer balances should use gold formatter');
assert(html.includes('콜 (${formatGoldAmount(toCall)})'), 'single player call button should show gold unit');
assert(html.includes('콜 (${formatGoldAmount(Math.min(toCall, me.chips))})'), 'multiplayer call button should show gold unit');
assert(html.includes('<b>올인</b>: 모든 골드를 베팅'), 'rules should describe all-in in gold');

assert(/\.card\s*{[\s\S]*grid-template-rows:\s*min-content minmax\(0, 1fr\) min-content;[\s\S]*overflow:\s*hidden;/.test(html), 'card grid should constrain content inside the card');
assert(/\.community-cards \.card\s*{\s*width:\s*var\(--cardW\);\s*height:\s*var\(--cardH\);\s*}/.test(html), 'community cards should not shrink below readable card content size');
assert(/@media \(max-width: 480px\)[\s\S]*\.card \{ padding:\s*4px 5px; \}[\s\S]*\.card \.rank \{ font-size:\s*0\.72rem; \}/.test(html), 'mobile card typography should be compact enough to avoid bottom clipping');

console.log('poker-gold-unit-card-layout.test.cjs passed');
