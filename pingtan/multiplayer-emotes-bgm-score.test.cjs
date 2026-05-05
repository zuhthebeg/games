const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

assert(html.includes('REACTION_EMOTE'), 'pingtan should define/handle REACTION_EMOTE multiplayer actions');
assert(html.includes('const REACTION_EMOTES'), 'pingtan should define fixed reaction emotes');
assert(html.includes('function showEmotePanel'), 'pingtan should expose an emote selection panel');
assert(html.includes('async function sendReactionEmote'), 'pingtan should send emotes through multiplayer');
assert(html.includes('function showReactionEmote'), 'pingtan should display received emotes');
assert(html.includes('emoteCooldownUntil'), 'emotes should have a local cooldown');
assert(html.includes('speechSynthesis'), 'emote voice should use browser speech synthesis');
assert(html.includes('soundSettings.voice'), 'emote voice should respect voice setting');
assert(html.includes('BGM.ensureUnlocked'), 'BGM should support unlock/resume from a user gesture');
assert(html.includes('BGM.start();'), 'BGM should be started from game flow when enabled');
assert(html.includes('function targetScoreForMap'), 'map target score helper should exist');
assert(html.includes('클리어 목표'), 'UI should show clear score target text');
assert(html.includes('onclick="showEmotePanel()"'), 'game actions should include emote button');

console.log('PASS pingtan multiplayer emotes bgm score polish');
