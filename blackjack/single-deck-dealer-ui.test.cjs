const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

assert(html.includes('id="soloDeckStatus"'), 'solo UI should render deck status');
assert(html.includes('id="soloDeckText"'), 'solo UI should render deck count text');
assert(html.includes('deckSize: 52'), 'solo state should know a standard 52-card deck size');
assert(html.includes('reshuffleCount: 0'), 'solo state should track reshuffles');
assert(html.includes('if (!state.deck.length) {\n        state.deck = makeDeck();\n        state.reshuffleCount += 1;'), 'solo draw should reshuffle only when the deck is empty');
assert(!html.includes('function resetRound() {\n      state.deck = makeDeck();'), 'solo resetRound should not reset the deck every round');
assert(html.includes('document.getElementById("soloApp")?.style.setProperty("--dealer-bg"'), 'solo dealer backdrop should follow voice gender');

console.log('PASS blackjack single persistent deck and dealer UI');
