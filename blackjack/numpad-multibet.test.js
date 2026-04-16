const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

function extractFunction(name) {
  const marker = `function ${name}(`;
  const start = html.indexOf(marker);
  if (start === -1) throw new Error(`Function not found: ${name}`);
  let i = html.indexOf('{', start);
  let depth = 0;
  for (; i < html.length; i++) {
    const ch = html[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return html.slice(start, i + 1);
      }
    }
  }
  throw new Error(`Could not parse function: ${name}`);
}

const fnCode = extractFunction('numpadConfirm');
const numpadConfirm = eval(`(${fnCode.replace('function numpadConfirm', 'function')})`);

function makeEnv() {
  const sent = [];
  global.numpadValue = '1500';
  global.numpadMode = 'multi';
  global.window = { _mpState: { gold: 2000 } };
  global.state = { gold: 2000 };
  global.mpUI = {
    sendAction(action) {
      sent.push(action);
      return Promise.resolve();
    },
    getClient() {
      return {
        sendAction(action) {
          sent.push(action);
          return Promise.resolve();
        }
      };
    }
  };
  global.closeNumpad = () => {};
  global.syncGold = () => {};
  global.walletRemove = () => {};
  global.t = (key, msg) => `${key}${msg ? ':' + msg : ''}`;
  global.alert = () => {};
  global.startRound = () => { throw new Error('should not call startRound in multi mode'); };
  return sent;
}

{
  const sent = makeEnv();
  numpadConfirm();
  assert.deepStrictEqual(sent[0], { type: 'bet', payload: { amount: 1500 } });
}

console.log('PASS numpad custom multiplayer bet payload');
