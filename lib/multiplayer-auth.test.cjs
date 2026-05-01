const assert = require('assert');

function makeJwt(payload) {
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `x.${b64}.y`;
}

function makeStorage(seed = {}) {
  const data = { ...seed };
  return {
    getItem: (k) => Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null,
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    _data: data,
  };
}

(async () => {
  const mainToken = makeJwt({ sub: 'main-user', nickname: 'Main' });
  global.localStorage = makeStorage({ cocy_auth_token: mainToken, relay_token: mainToken, relay_userId: 'main-user' });
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith('/api/auth/me')) {
      assert.equal(options.headers.Authorization, `Bearer ${mainToken}`);
      return { ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) };
    }
    if (url.endsWith('/api/auth/anonymous')) {
      return { ok: true, status: 200, json: async () => ({ token: 'anon-token', user: { id: 'anon-user', nickname: null } }) };
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  const { MultiplayerClient } = require('./multiplayer.js');
  MultiplayerClient.resetInstance();
  const client = MultiplayerClient.getInstance();
  await client.ensureAuth();

  assert.equal(client.token, 'anon-token', 'invalid main JWT must not be reused as relay token');
  assert.equal(client.userId, 'anon-user', 'client should fall back to anonymous relay auth');
  assert.equal(localStorage.getItem('relay_token'), 'anon-token', 'stored relay token should be replaced with anonymous token');
  assert(calls.some(c => c.url.endsWith('/api/auth/me')), 'main token should be verified against relay');
  assert(calls.some(c => c.url.endsWith('/api/auth/anonymous')), 'anonymous fallback should run after relay rejects main token');

  console.log('PASS multiplayer auth rejects unverified main JWT fallback');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
