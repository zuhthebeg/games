const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync('index.html', 'utf8');

assert(html.includes('.dice-button'), 'dice button should have dedicated visible dice styling');
assert(html.includes('.die-face'), 'dice result should render individual die faces');
assert(html.includes('.dice-total'), 'dice result should render a prominent total number');
assert(html.includes('function renderDiceButtonContent'), 'dice button content should persist rolled result after render');
assert(html.includes('function animateDiceRoll'), 'dice roll should use an animated rolling helper');
assert(html.includes('await animateDiceRoll(el, d1, d2, sum)'), 'rollDice should wait for animation before applying/rendering result');
assert(html.includes('lastDiceValues'), 'state should retain the latest dice values for visible result display');

const knightBlockStart = html.indexOf('if (state.phase === "knight-robber")');
const knightBlockEnd = html.indexOf('if (state.phase !== "robber")', knightBlockStart);
const knightBlock = html.slice(knightBlockStart, knightBlockEnd);
assert(knightBlock.includes('humanPickVictim'), 'knight robber move should use the same victim-pick flow as robber when multiple victims exist');
assert(knightBlock.includes('chosenVictimId'), 'knight robber move should pass the chosen victim into playKnight');

assert(html.includes('formatRobberMoveMessage({ actorName, source, hexLabel, victimName, stolenResource: picked })'), 'knight/robber message should include stolen resource result');

console.log('PASS pingtan dice animation and knight steal rules');
