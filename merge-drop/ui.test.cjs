const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

test('exposes a visible build tag in the header for QA', () => {
  assert.match(
    html,
    /<[^>]+id="buildTag"[^>]*>\s*빌드\s+20250407[a-z]?\s*<\/[^>]+>/u
  );
});

test('includes a visible button to reopen the tutorial card', () => {
  assert.match(
    html,
    /<button[^>]+id="reopenTutorialBtn"[^>]*>\s*튜토리얼 다시 보기\s*<\/button>/u
  );
});
