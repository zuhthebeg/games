const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = __dirname;
const apps = fs.readFileSync(path.join(root, 'apps.json'), 'utf8');
const html = fs.readFileSync(path.join(root, 'archipelago/index.html'), 'utf8');

assert(html.includes('<title>제도 개척전</title>'), 'game title should use the new public name');
assert(!html.includes('<title>카탄</title>'), 'public title must not use Catan/Korean mark');
assert(!html.includes('gameName: "🏝️ 카탄"'), 'shared multiplayer lobby must not show Catan name');
assert(!html.includes('📖 카탄 가이드'), 'guide title must not show Catan name');
assert(!html.includes('카탄 방'), 'invite/share text must not show Catan name');
assert(!html.includes('카탄 스타일'), 'SEO description must not describe itself as Catan-style');

const entry = JSON.parse(apps).find(app => app.slug === 'archipelago' || /\/archipelago\//.test(app.url || ''));
assert(entry, 'apps.json should expose the renamed archipelago app');
assert.equal(entry.title, '제도 개척전', 'apps.json title should use the new public name');
assert.equal(entry.url, 'https://game.cocy.io/archipelago/index.html', 'apps.json URL should use the new public slug');
assert(!apps.includes('"title": "카탄"'), 'apps.json should not expose Catan title');

console.log('PASS archipelago public branding');
