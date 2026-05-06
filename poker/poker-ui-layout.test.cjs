const fs = require('fs');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

assert(html.includes('viewport-fit=cover'), 'viewport meta should include viewport-fit=cover');
assert(/--wallet-bar-h\s*:\s*56px/.test(html), 'wallet bar height variable should exist');
assert(/body\s*{[\s\S]*padding-top:\s*calc\(var\(--wallet-bar-h\) \+ env\(safe-area-inset-top\)\)/.test(html), 'body should reserve SharedWallet + safe area top space');
assert(!/header\s*{[\s\S]*?margin-top:\s*50px/.test(html), 'header should not use hard-coded SharedWallet margin');
assert(/\.game-container\s*{[\s\S]*height:\s*calc\(100dvh - var\(--wallet-bar-h\) - env\(safe-area-inset-top\)\)/.test(html), 'game container should use 100dvh safe-area app height');
for (const selector of ['.mode-select', '.lobby', '.waiting-room']) {
  const escaped = selector.replace('.', '\\.');
  assert(new RegExp(`${escaped}\\s*{[\\s\\S]*padding-top:\\s*calc\\(var\\(--wallet-bar-h\\) \\+ env\\(safe-area-inset-top\\)\\)`).test(html), `${selector} should use safe-area wallet padding`);
}

console.log('poker-ui-layout.test.cjs passed');
