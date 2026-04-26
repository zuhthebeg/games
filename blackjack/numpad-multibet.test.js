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

const clickHandlerMatch = html.match(/document\.querySelectorAll\("\[data-mp-bet\]"\)\.forEach\(btn => \{\s*btn\.addEventListener\("click", async \(\) => \{([\s\S]*?)\n\s*\}\);\s*\}\);/);
if (!clickHandlerMatch) throw new Error('mp bet click handler not found');
const mpBetClick = eval(`(async function(){${clickHandlerMatch[1]}})`);

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

function makeEnv() {
  const sent = [];
  const walletRemovals = [];
  const alerts = [];
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
        getMyUserId() { return 'me'; },
        sendAction(action) {
          sent.push(action);
          return Promise.resolve();
        }
      };
    }
  };
  global.closeNumpad = () => {};
  global.syncGold = () => {};
  global.walletRemove = (amount) => { walletRemovals.push(amount); };
  global.t = (key, msg) => `${key}${msg ? ':' + msg : ''}`;
  global.alert = (msg) => { alerts.push(msg); };
  global.confirm = () => true;
  global.startRound = () => { throw new Error('should not call startRound in multi mode'); };
  global.MULTI_BET_MAX = 10000;
  global.currentLang = 'ko';
  return { sent, walletRemovals, alerts };
}

(async () => {
  {
    const { sent, walletRemovals } = makeEnv();
    numpadConfirm();
    await flush();
    assert.deepStrictEqual(sent[0], { type: 'bet', payload: { amount: 1500 } });
    assert.deepStrictEqual(walletRemovals, [], 'multi bet should not remove wallet locally after server action');
  }

  {
    const { sent, walletRemovals } = makeEnv();
    global.numpadValue = '50000';
    global.window._mpState.gold = 100000;
    global.state.gold = 100000;
    numpadConfirm();
    await flush();
    assert.deepStrictEqual(sent[0], { type: 'bet', payload: { amount: 10000 } }, 'multi bet should be capped at MULTI_BET_MAX');
    assert.deepStrictEqual(walletRemovals, [], 'capped multi bet still must not deduct wallet locally');
  }

  {
    const { sent, walletRemovals } = makeEnv();
    global.btn = { dataset: { mpBet: '1000' } };
    await mpBetClick();
    await flush();
    assert.deepStrictEqual(sent[0], { type: 'bet', payload: { amount: 1000 } }, 'quick multiplayer bet should send bet action');
    assert.deepStrictEqual(walletRemovals, [], 'quick multiplayer bet should not deduct wallet locally after server action');
  }

  console.log('PASS multiplayer bet payload and wallet sync behavior');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
