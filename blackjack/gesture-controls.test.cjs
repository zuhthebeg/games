const fs = require('fs');
const assert = require('assert');
const vm = require('vm');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

function extractFunction(name, nextName) {
  const start = html.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`Function not found: ${name}`);
  if (nextName) {
    const end = html.indexOf(`function ${nextName}(`, start);
    return html.slice(start, end === -1 ? html.length : end).trim();
  }
  const open = html.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < html.length; i++) {
    const ch = html[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return html.slice(start, i + 1).trim();
    }
  }
  throw new Error(`Could not parse function: ${name}`);
}

const script = [
  extractFunction('interpretBlackjackGesture', 'attachBlackjackGestureControls')
].join('\n');

const ctx = {};
vm.createContext(ctx);
vm.runInContext(script, ctx);

assert.equal(ctx.interpretBlackjackGesture({ durationMs: 160, moveX: 2, moveY: 3, tapCount: 2 }), 'hit', 'double tap should map to hit');
assert.equal(ctx.interpretBlackjackGesture({ durationMs: 280, moveX: 72, moveY: 8, tapCount: 1 }), 'stand', 'horizontal drag should map to stand');
assert.equal(ctx.interpretBlackjackGesture({ durationMs: 280, moveX: 10, moveY: 40, tapCount: 1 }), null, 'vertical drag should not trigger action');
assert.equal(ctx.interpretBlackjackGesture({ durationMs: 500, moveX: 0, moveY: 0, tapCount: 1 }), null, 'single tap should not trigger action');

assert(html.includes('더블탭') && html.includes('드래그') && html.includes('스탠드'), 'rules text should mention the new gesture shortcuts in Korean');
assert(html.includes('Double tap') && html.includes('Drag') && html.includes('Stand'), 'rules text should mention the new gesture shortcuts in English');

console.log('PASS blackjack gesture controls');
