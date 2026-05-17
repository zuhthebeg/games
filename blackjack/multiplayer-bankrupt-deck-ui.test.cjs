const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

assert(html.includes('id="mpDeckStatus"'), 'multiplayer UI should render deck status');
assert(html.includes('id="mpDeckText"'), 'multiplayer UI should render deck count text');
assert(html.includes('reshuffleCount'), 'client should track server reshuffle count');
assert(html.includes('deckCount'), 'client should read server deck count');
assert(html.includes('function scheduleBankruptLeave'), 'client should auto-leave bankrupt players');
assert(html.includes('mePlayer?.bankrupt'), 'client should use server bankrupt state');
assert(html.includes('assets/dealer-male.webp') && html.includes('assets/dealer-female.webp'), 'voice gender should select dealer backdrop assets');
assert(html.includes('updateDealerBackdrop'), 'voice toggle should update dealer backdrop');

console.log('PASS blackjack multiplayer bankrupt, deck, and dealer UI');
