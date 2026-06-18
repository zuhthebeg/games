const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

// Decision (cocy 2026-06-18): the AI-fill button adds ONE bot per click. No auto fill-to-capacity.
const fn = html.slice(html.indexOf('async function fillAIPlayers()'),
                      html.indexOf('async function removeAIPlayer()'));
assert(fn, 'fillAIPlayers must exist');
assert(fn.includes('emptyAiSeats()'), 'fillAIPlayers must respect remaining seat capacity');
assert(fn.includes('mpState.aiPlayers.push('), 'fillAIPlayers must add exactly one AI (push), not bulk fill');
assert(!fn.includes('buildAiPlayers'), 'fillAIPlayers must not bulk-fill to capacity anymore');

assert(html.includes('async function removeAIPlayer()'), 'must have a remove-one-AI control');
assert(html.includes('mpState.aiPlayers.pop()'), 'removeAIPlayer must pop the last bot');
assert(html.includes('window.removeAIPlayer = removeAIPlayer'), 'removeAIPlayer must be wired to the button');

// Lobby UI exposes both add and remove, plus a seat count.
assert(html.includes('onclick="removeAIPlayer()"'), 'lobby must render a remove-AI button');
assert(/빈 자리 \$\{emptyAiSeats\(\)\} \/ 정원/.test(html), 'lobby must show remaining/capacity seat count');

// Game init must NOT silently fill empty seats — only manually added AIs are used.
const init = html.slice(html.indexOf('async function maybeHostInitGame()'),
                        html.indexOf('async function maybeHostInitGame()') + 1200);
assert(!init.includes('buildAiPlayers'), 'maybeHostInitGame must not auto-fill seats to capacity');

console.log('PASS pingtan manual AI fill (add/remove one)');
