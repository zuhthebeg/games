const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

assert(html.includes('CATAN_ACTIVITY_LOG_KEY'), 'A activity log should persist locally with a dedicated localStorage key');
assert(html.includes('function addActivityLog'), 'important user-facing events should be appended to a local activity log');
assert(html.includes('function renderActivityStatus'), 'A area should render as a toggleable activity/status panel');
assert(html.includes('toggleActivityLog'), 'A activity log should be expandable/collapsible');
assert(html.includes('activity-log-entry'), 'expanded A panel should render chat-like log entries');
assert(html.includes('renderActivityStatus()'), 'game screen should use the new A activity panel instead of raw statusText');
assert(!html.includes('<div class="status">${statusText()}</div>'), 'A area should not duplicate the full B turn/status text');
assert(html.includes('showReactionEmote({'), 'reaction display path should still exist');
assert(html.includes('addActivityLog("reaction"'), 'reactions should be displayed in A activity log');
assert(!html.includes('reaction-emote-overlay'), 'reactions should no longer create a central overlay that covers the board');
assert(!html.includes('MAX_REACTIONS_PER_TURN = 3'), 'reaction count limit should be removed');
assert(!html.includes('reactionTurnCount'), 'reaction per-turn count state should be removed');
assert(!html.includes('state.reactionTurnCount >='), 'reaction sending should not block by per-turn count');

const bannerActionRule = html.match(/#turn-banner \.banner-action\s*\{[\s\S]*?\n\s*\}/)?.[0] || '';
assert(bannerActionRule.includes('white-space: normal'), 'B banner action should wrap onto its own multiline area instead of truncating');
assert(!bannerActionRule.includes('text-overflow: ellipsis'), 'B banner action should not ellipsize long content');

assert(html.includes(':fullscreen.catan-landscape-fullscreen #sw-bar'), 'landscape fullscreen should hide global nav/wallet bar');
assert(html.includes('--wallet-bar-height: 0px'), 'landscape fullscreen should remove wallet/nav reserved space');
assert(html.includes('function syncFullscreenLayoutClass'), 'fullscreen layout class should be synced from actual fullscreen/orientation state');
assert(html.includes('banner.style.display = "grid"'), 'B banner should keep its multiline grid layout when shown');

console.log('PASS catan status activity log');
