const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const rollStart = html.indexOf('async function rollDice()');
const rollEnd = html.indexOf('if (state.winner || state.phase !== "roll") return;', rollStart);
const multiRoll = html.slice(rollStart, rollEnd);

assert(multiRoll.includes('await sendGameAction(ACTION.ROLL_DICE'), 'multiplayer roll should send and apply the dice action locally');
assert(multiRoll.includes('await resolveHumanGoldIfNeeded();'), 'local multiplayer dice roll should open the gold choice picker after local apply');
assert(
  multiRoll.indexOf('await sendGameAction(ACTION.ROLL_DICE') < multiRoll.indexOf('await resolveHumanGoldIfNeeded();'),
  'gold choice picker should run after dice resources have been distributed'
);
assert(
  multiRoll.indexOf('await resolveHumanGoldIfNeeded();') < multiRoll.indexOf('maybeAutoEndTurn();'),
  'auto-end-turn must wait until local gold choice is resolved'
);

console.log('PASS pingtan local multiplayer gold choice after roll');
