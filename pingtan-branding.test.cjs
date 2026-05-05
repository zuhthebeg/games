const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = __dirname;
const apps = fs.readFileSync(path.join(root, 'apps.json'), 'utf8');
const html = fs.readFileSync(path.join(root, 'pingtan/index.html'), 'utf8');

assert(html.includes('<title>삥탄</title>'), 'game title should use 삥탄');
assert(html.includes('gameName: "🏝️ 삥탄"'), 'shared multiplayer lobby should show 삥탄');
assert(html.includes('삥탄 방에 참가'), 'invite text should use 삥탄');
assert(html.includes('📖 삥탄 가이드'), 'guide title should use 삥탄');
assert(html.includes("title: '삥탄 - game.cocy.io'"), 'structured metadata should use 삥탄');
assert(!html.includes('제도 개척전'), 'old public name should be removed from public HTML');
assert(!html.includes('카탄 방'), 'Catan/Korean mark should stay removed');
assert(!html.includes('카탄 스타일'), 'SEO description must not describe itself as Catan-style');

const entry = JSON.parse(apps).find(app => app.slug === 'pingtan' || /\/pingtan\//.test(app.url || ''));
assert(entry, 'apps.json should expose the renamed pingtan app');
assert.equal(entry.title, '삥탄', 'apps.json title should use 삥탄');
assert.equal(entry.url, 'https://game.cocy.io/pingtan/index.html', 'apps.json URL should use the pingtan public slug');
assert(!apps.includes('"title": "제도 개척전"'), 'apps.json should not expose old title');
assert(!apps.includes('"title": "카탄"'), 'apps.json should not expose Catan title');

console.log('PASS pingtan public branding');
