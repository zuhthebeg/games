const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

assert(html.includes('AI_REACTION_COOLDOWN_MS'), 'AI reactions should be rate-limited');
assert(html.includes('async function getAIReactionWithLLM'), 'AI reactions should use an LLM first');
assert(html.includes('fallbackAIReaction'), 'AI reactions should have template fallback only for failures');
assert(html.includes('https://llm.cocy.io/v2/chat/completions'), 'AI reaction LLM should use llm.cocy.io');
assert(html.includes('maybeAIReactToHumanReaction'), 'human reactions should optionally trigger AI responses');
assert(html.includes('maybeAIIntroReaction'), 'AI should greet lightly at game start');
assert(html.includes('리액션 JSON'), 'AI reaction prompt should request compact JSON');

assert(html.includes('function returnToSingleMapSelect'), 'single-player victory modal should support returning to map select');
assert(html.includes('function returnToRoomForRematch'), 'multiplayer victory modal should support returning to room');
assert(html.includes('방으로 돌아가기'), 'multiplayer winner modal should expose room return action');
assert(html.includes('맵 선택으로'), 'single-player winner modal should expose map-select return action');
assert(html.includes('state.screen = "map-select"'), 'single-player victory flow should return to map select');
assert(html.includes('state.screen = "room-lobby"'), 'room rematch should return players to lobby');

console.log('PASS pingtan AI reactions and rematch design');
