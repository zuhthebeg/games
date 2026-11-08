import assert from 'node:assert/strict';
import test from 'node:test';
import { MemoryBackend, SaveRepository } from '../js/save/repository.js';
import { RemoteSync } from '../js/save/remote-sync.js';

const encodeToken = (payload) => `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;
const response = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

class Storage {
  constructor(values = {}) { this.values = new Map(Object.entries(values)); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, value); }
  removeItem(key) { this.values.delete(key); }
}

async function makeRepository() {
  const repository = new SaveRepository(new MemoryBackend());
  await repository.initialize();
  return repository;
}

async function createCharacter(repository, { id, cloudUserId } = {}) {
  return repository.commit({
    characterId: id ?? 'character-1',
    baseRev: 0,
    ops: [{ type: 'createCharacter', name: '모험가', kind: 'knight' }],
    context: { kind: 'hub' },
    cloudUserId,
  });
}

test('cloud outbox preserves revision order and retries with exponential backoff', async () => {
  const repository = await makeRepository();
  const character = await createCharacter(repository, { cloudUserId: 'user-1' });
  await repository.commit({
    characterId: character.id,
    baseRev: 1,
    ops: [{ type: 'updateTutorial', state: { skipped: true } }],
    context: { kind: 'hub' },
    cloudUserId: 'user-1',
  });
  const sent = [];
  let fail = true;
  const storage = new Storage({ cocy_auth_token: encodeToken({ sub: 'user-1' }) });
  const sync = new RemoteSync({
    repository,
    storage,
    apiBase: 'https://relay.test/api/devinarok',
    fetcher: async (_url, options) => {
      if (fail) {
        fail = false;
        throw new TypeError('Failed to fetch');
      }
      sent.push(JSON.parse(options.body));
      return response({ ok: true });
    },
  });
  sync.userId = 'user-1';
  sync.localCommit();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(sync.status, 'offline');
  assert.equal(sync.retryCount, 1);
  assert.ok(sync.retryTimer);
  fail = true;
  sync.localCommit();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(sync.retryCount, 2);
  assert.equal(sync.retryTimer?._idleTimeout, 2000);
  sync.clearRetry();
  fail = false;
  await sync.flushOutbox();
  assert.deepEqual(sent.map((entry) => entry.baseRev), [0, 1]);
  assert.equal((await repository.listOutbox('user-1')).length, 0);
});

test('conflicts replace local state, preserve a backup, and discard queued writes', async () => {
  const repository = await makeRepository();
  const created = await createCharacter(repository, { cloudUserId: 'user-1' });
  await repository.commit({
    characterId: created.id,
    baseRev: 1,
    ops: [{ type: 'grantGold', amount: 100 }],
    context: { kind: 'debug' },
    cloudUserId: 'user-1',
  });
  const remote = { character: { ...created, rev: 1, gold: 0, cloudUserId: 'user-1' }, items: [] };
  let reverted = false;
  const sync = new RemoteSync({
    repository,
    storage: new Storage({ cocy_auth_token: encodeToken({ sub: 'user-1' }) }),
    apiBase: 'https://relay.test/api/devinarok',
    onRevert: () => { reverted = true; },
    fetcher: async (url) => url.endsWith('/commit')
      ? response({ error: 'settlement-cap-exceeded' }, 422)
      : response({ characters: [remote] }),
  });
  sync.userId = 'user-1';
  await sync.flushOutbox();
  assert.equal((await repository.loadCharacter(created.id)).gold, 0);
  assert.equal((await repository.listOutbox('user-1')).length, 0);
  assert.equal((await repository.backend.readData()).backups.at(-1).data.character.gold, 100);
  assert.equal(reverted, true);
});

test('guest saves remain local and do not mint or send cloud credentials', async () => {
  const repository = await makeRepository();
  await createCharacter(repository);
  let requests = 0;
  const storage = new Storage({ cocy_guest_token: 'existing-guest-token' });
  const sync = new RemoteSync({ repository, storage, fetcher: async () => { requests += 1; } });
  await sync.initialize();
  assert.equal(sync.userId, null);
  assert.equal(requests, 0);
  assert.equal(storage.getItem('cocy_auth_token'), null);
  assert.equal((await repository.listOutbox()).length, 0);
  assert.equal(sync.visibleCharacters(await repository.listCharacters()).length, 1);
});

test('logout hides cloud characters without deleting their local cache', async () => {
  const repository = await makeRepository();
  await createCharacter(repository, { cloudUserId: 'user-1' });
  const storage = new Storage({
    cocy_auth_token: encodeToken({ sub: 'user-1' }),
    cocy_refresh_token: 'refresh',
  });
  const sync = new RemoteSync({ repository, storage, fetcher: async () => response({}) });
  sync.userId = 'user-1';
  sync.logout();
  assert.equal((await repository.listCharacters()).length, 1);
  assert.equal(sync.visibleCharacters(await repository.listCharacters()).length, 0);
  assert.equal(storage.getItem('cocy_auth_token'), null);
  assert.equal(storage.getItem('cocy_refresh_token'), null);
});

test('existing server characters trigger the server-versus-device chooser', async () => {
  const repository = await makeRepository();
  await createCharacter(repository, { id: 'device-character' });
  const serverCharacter = {
    character: { id: 'server-character', name: '서버 기사', kind: 'knight', level: 1, xp: 0, gold: 0, potions: 0, rev: 1, debugUsed: false, equipment: {}, clearedStages: [], records: {} },
    items: [],
  };
  const sync = new RemoteSync({
    repository,
    storage: new Storage({ cocy_auth_token: encodeToken({ sub: 'user-1' }) }),
    apiBase: 'https://relay.test/api/devinarok',
    fetcher: async () => response({ characters: [serverCharacter] }),
  });
  sync.userId = 'user-1';
  await sync.syncAccount();
  assert.equal(sync.needsChooser, true);
  assert.equal(sync.deviceCharacters[0].id, 'device-character');
  assert.equal(sync.serverCharacters[0].character.id, 'server-character');
  await sync.useServerCharacter('server-character');
  assert.equal((await repository.loadCharacter('server-character')).cloudUserId, 'user-1');
});

test('first login imports local characters when the server has no characters', async () => {
  const repository = await makeRepository();
  const local = await createCharacter(repository, { id: 'first-device-character' });
  const imported = [];
  const serverState = [];
  const sync = new RemoteSync({
    repository,
    storage: new Storage({ cocy_auth_token: encodeToken({ sub: 'user-1' }) }),
    apiBase: 'https://relay.test/api/devinarok',
    fetcher: async (url, options) => {
      if (url.endsWith('/import')) {
        const body = JSON.parse(options.body);
        imported.push(body.character.id);
        const entry = { character: { ...body.character }, items: body.items };
        serverState.push(entry);
        return response(entry);
      }
      return response({ characters: serverState });
    },
  });
  sync.userId = 'user-1';
  await sync.syncAccount();
  assert.deepEqual(imported, [local.id]);
  assert.equal((await repository.loadCharacter(local.id)).cloudUserId, 'user-1');
  assert.equal(sync.needsChooser, false);
});

test('401 refreshes a login token once before retrying the cloud request', async () => {
  const repository = await makeRepository();
  const fresh = encodeToken({ sub: 'user-1' });
  const storage = new Storage({
    cocy_auth_token: encodeToken({ sub: 'user-1', exp: 1 }),
    cocy_refresh_token: 'refresh',
  });
  let protectedRequests = 0;
  let refreshRequests = 0;
  const sync = new RemoteSync({
    repository,
    storage,
    apiBase: 'https://relay.test/api/devinarok',
    fetcher: async (url) => {
      if (url.endsWith('/api/auth/refresh')) {
        refreshRequests += 1;
        return response({ accessToken: fresh });
      }
      protectedRequests += 1;
      return protectedRequests === 1 ? response({ error: 'unauthorized' }, 401) : response({ characters: [] });
    },
  });
  sync.userId = 'user-1';
  const result = await sync.request('/characters');
  assert.equal(result.status, 200);
  assert.equal(protectedRequests, 2);
  assert.equal(refreshRequests, 1);
});
