const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

assert(html.includes('<title>삥탄 - Korean Slang Multiplayer Board Game</title>'), 'page title should position Pingtan for global sharing');
assert(html.includes('name="description"'), 'page should include meta description');
assert(html.includes('property="og:title"'), 'page should include Open Graph title');
assert(html.includes('property="og:description"'), 'page should include Open Graph description');
assert(html.includes('name="twitter:card"'), 'page should include Twitter card metadata');
assert(html.includes('rel="canonical" href="https://game.cocy.io/pingtan/"'), 'page should include canonical URL');

assert(html.includes('function roomInviteText'), 'room invites should use viral invite copy helper');
assert(html.includes('Come get ppinged'), 'invite copy should preserve pping/K-slang hook');
assert(html.includes('No install. Open link and play.'), 'invite copy should emphasize zero-friction play');
assert(html.includes('function resultShareText'), 'winner modal should have result share copy helper');
assert(html.includes('I survived 삥탄'), 'winner share copy should be memeable');
assert(html.includes('I got ppinged in 삥탄'), 'loser share copy should be memeable');
assert(html.includes('copyResultShare'), 'winner modal should expose copy/share result action');
assert(html.includes('K-Reactions'), 'reaction panel should frame Korean reactions as a feature');

console.log('PASS pingtan viral share hooks');
