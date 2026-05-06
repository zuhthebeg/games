const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

assert(!html.includes('pingtan_ACTIVITY_LOG_KEY'), 'A activity log should not persist in localStorage across game sessions');
assert(html.includes('activityLog: []'), 'A activity log should live in current game state only');
assert(html.includes('function clearActivityLog'), 'A activity log should be clearable when a game session resets or ends');
assert(html.includes('clearActivityLog();'), 'new games and ended games should clear old A activity log entries');
assert(html.includes('function addActivityLog'), 'important user-facing events should be appended to a local activity log');
assert(html.includes('function renderActivityStatus'), 'A area should render as a toggleable activity/status panel');
assert(html.includes('toggleActivityLog'), 'A activity log should be expandable/collapsible');
assert(html.includes('activity-log-entry'), 'expanded A panel should render chat-like log entries');
assert(html.includes('renderActivityStatus()'), 'game screen should use the new A activity panel instead of raw statusText');
assert(!html.includes('<div class="status">${statusText()}</div>'), 'A area should not duplicate the full B turn/status text');
assert(html.includes('showReactionEmote({'), 'reaction display path should still exist');
assert(html.includes('addActivityLog("reaction"'), 'reactions should be displayed in A activity log');
assert(html.includes('name.length >= 2'), 'activity player highlighting should ignore one-character names like 나 to avoid coloring words such as 지쳤나요');
assert(html.includes('거래 완료'), 'completed trades should be shown as completed trade entries in A activity log');
assert(html.includes('삥뜯겼습니다') || html.includes('삥을 뜯겼습니다'), 'robber/knight steal events should show the victim got shaken down in A activity log');
assert(html.includes('${victimName}가 ${actorName}에게 ${formatStealResourceText(picked)}를 삥뜯겼습니다'), 'robber/knight steal entries should name the actor and stolen resource');
assert(html.includes('은행에게 삥을 뜯겼습니다'), '7/discard events should show bank shakedown entries in A activity log');
assert(!html.includes('reaction-emote-overlay'), 'reactions should no longer create a central overlay that covers the board');
assert(!html.includes('MAX_REACTIONS_PER_TURN = 3'), 'reaction count limit should be removed');
assert(!html.includes('reactionTurnCount'), 'reaction per-turn count state should be removed');
assert(!html.includes('state.reactionTurnCount >='), 'reaction sending should not block by per-turn count');

const bannerActionRule = html.match(/#turn-banner \.banner-action\s*\{[\s\S]*?\n\s*\}/)?.[0] || '';
assert(bannerActionRule.includes('white-space: normal'), 'B banner action should wrap onto its own multiline area instead of truncating');
assert(!bannerActionRule.includes('text-overflow: ellipsis'), 'B banner action should not ellipsize long content');

assert(html.includes(':fullscreen.pingtan-landscape-fullscreen #sw-bar'), 'landscape fullscreen should hide global nav/wallet bar');
assert(html.includes('--wallet-bar-height: 0px'), 'landscape fullscreen should remove wallet/nav reserved space');
assert(html.includes('function syncFullscreenLayoutClass'), 'fullscreen layout class should be synced from actual fullscreen/orientation state');
assert(html.includes('banner.style.display = "grid"'), 'B banner should keep its multiline grid layout when shown');

console.log('PASS pingtan status activity log');
