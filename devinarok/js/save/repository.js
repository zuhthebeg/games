import { applyOperations } from './ops.js';

export const SCHEMA_VERSION = 2;
const STORE_NAMES = ['meta', 'characters', 'items', 'ledger', 'backups'];

export class ConflictError extends Error {
  constructor(message = 'Character revision changed') {
    super(message);
    this.name = 'ConflictError';
  }
}

function uuid(cryptoProvider = globalThis.crypto) {
  if (cryptoProvider?.randomUUID) return cryptoProvider.randomUUID();
  if (!cryptoProvider?.getRandomValues) throw new Error('Secure UUID generation is unavailable');
  const bytes = cryptoProvider.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  return [...bytes].map((value, index) => `${index === 4 || index === 6 || index === 8 || index === 10 ? '-' : ''}${value.toString(16).padStart(2, '0')}`).join('');
}

function blankData(localAccountId = uuid()) {
  return {
    meta: { schemaVersion: SCHEMA_VERSION, localAccountId },
    characters: {},
    items: {},
    ledger: [],
    backups: [],
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function commitToData(data, { characterId, baseRev, ops }, now) {
  const current = data.characters[characterId] ?? null;
  if ((current?.rev ?? 0) !== baseRev) throw new ConflictError();
  const result = applyOperations(current, data.items, ops, characterId);
  result.character.rev = baseRev + 1;
  result.character.updatedAt = now;
  data.characters[characterId] = result.character;
  data.items = result.items;
  data.ledger.push({
    id: `${characterId}:${result.character.rev}`,
    characterId,
    rev: result.character.rev,
    ops: clone(ops),
    source: 'local',
  });
  return clone(result.character);
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('Save transaction aborted'));
  });
}

function dataFromStores([metaRows, characters, items, ledger, backups]) {
  return {
    meta: metaRows.find((entry) => entry.key === 'profile')?.value ?? null,
    characters: Object.fromEntries(characters.map((entry) => [entry.id, entry])),
    items: Object.fromEntries(items.map((entry) => [entry.uid, entry])),
    ledger,
    backups,
  };
}

function storeRows(data) {
  return {
    meta: [{ key: 'profile', value: data.meta }],
    characters: Object.values(data.characters),
    items: Object.values(data.items),
    ledger: data.ledger,
    backups: data.backups,
  };
}

export class MemoryBackend {
  constructor(seed = null) {
    this.persistent = false;
    this.data = seed ? clone(seed) : blankData();
  }

  async readData() {
    return clone(this.data);
  }

  async replaceData(data) {
    this.data = clone(data);
  }

  async backup(data) {
    this.data.backups.push({ id: uuid(), createdAt: Date.now(), data: clone(data) });
  }

  async commit(change) {
    const next = clone(this.data);
    const result = commitToData(next, change, Date.now());
    this.data = next;
    return result;
  }
}

export class IndexedDbBackend {
  constructor(database) {
    this.database = database;
    this.persistent = true;
  }

  static open(indexedDb = globalThis.indexedDB) {
    return new Promise((resolve, reject) => {
      if (!indexedDb) return reject(new Error('IndexedDB is unavailable'));
      const request = indexedDb.open('devinarok', SCHEMA_VERSION);
      request.onupgradeneeded = () => {
        for (const store of STORE_NAMES) {
          if (!request.result.objectStoreNames.contains(store)) {
            const keyPath = store === 'meta' ? 'key' : store === 'items' ? 'uid' : 'id';
            request.result.createObjectStore(store, { keyPath });
          }
        }
      };
      request.onsuccess = () => resolve(new IndexedDbBackend(request.result));
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('IndexedDB upgrade is blocked'));
    });
  }

  async readData() {
    const transaction = this.database.transaction(STORE_NAMES, 'readonly');
    const requests = STORE_NAMES.map((name) => requestResult(transaction.objectStore(name).getAll()));
    const data = dataFromStores(await Promise.all(requests));
    await transactionDone(transaction);
    return data;
  }

  async replaceData(data) {
    const transaction = this.database.transaction(STORE_NAMES, 'readwrite');
    const rows = storeRows(data);
    for (const name of STORE_NAMES) {
      const store = transaction.objectStore(name);
      store.clear();
      for (const row of rows[name]) store.put(row);
    }
    await transactionDone(transaction);
  }

  async backup(data) {
    const transaction = this.database.transaction('backups', 'readwrite');
    transaction.objectStore('backups').put({ id: uuid(), createdAt: Date.now(), data: clone(data) });
    await transactionDone(transaction);
  }

  async commit(change) {
    const transaction = this.database.transaction(STORE_NAMES, 'readwrite');
    const requests = STORE_NAMES.map((name) => requestResult(transaction.objectStore(name).getAll()));
    const current = dataFromStores(await Promise.all(requests));
    const result = commitToData(current, change, Date.now());
    const rows = storeRows(current);
    for (const name of STORE_NAMES) {
      const store = transaction.objectStore(name);
      store.clear();
      for (const row of rows[name]) store.put(row);
    }
    await transactionDone(transaction);
    return result;
  }
}

const migrations = [
  (data) => ({
    meta: { ...data.meta, schemaVersion: 1, localAccountId: data.meta?.localAccountId ?? uuid() },
    characters: data.characters ?? {},
    items: data.items ?? {},
    ledger: data.ledger ?? [],
    backups: data.backups ?? [],
  }),
  (data) => ({
    meta: { ...data.meta, schemaVersion: 2 },
    characters: Object.fromEntries(Object.entries(data.characters ?? {}).map(([id, character]) => [id, { ...character, potions: character.potions ?? 0 }])),
    items: Object.fromEntries(Object.entries(data.items ?? {}).map(([uid, item]) => [uid, { ...item, ilvl: item.ilvl ?? 1, requiredLevel: item.requiredLevel ?? 1 }])),
    ledger: data.ledger ?? [],
    backups: data.backups ?? [],
  }),
];

export class SaveRepository {
  constructor(backend, { cryptoProvider = globalThis.crypto } = {}) {
    this.backend = backend;
    this.cryptoProvider = cryptoProvider;
    this.persistent = backend.persistent;
  }

  async initialize() {
    let data = await this.backend.readData();
    if (!data.meta) {
      data.meta = { schemaVersion: SCHEMA_VERSION, localAccountId: uuid(this.cryptoProvider) };
      await this.backend.replaceData(data);
    }
    while (data.meta.schemaVersion < SCHEMA_VERSION) {
      const before = clone(data);
      const migration = migrations[data.meta.schemaVersion];
      if (!migration) throw new Error(`No migration from schema ${data.meta.schemaVersion}`);
      const migrated = migration(clone(data));
      migrated.backups.push({ id: uuid(this.cryptoProvider), createdAt: Date.now(), data: before });
      await this.backend.replaceData(migrated);
      data = migrated;
    }
    if (data.meta.schemaVersion !== SCHEMA_VERSION) throw new Error('Save schema is newer than this client');
    return this.loadProfile();
  }

  async loadProfile() {
    return (await this.backend.readData()).meta;
  }

  async listCharacters() {
    return Object.values((await this.backend.readData()).characters).map(clone);
  }

  async loadCharacter(id) {
    const character = (await this.backend.readData()).characters[id];
    return character ? clone(character) : null;
  }

  async listItems(characterId) {
    return Object.values((await this.backend.readData()).items)
      .filter((item) => item.characterId === characterId)
      .map(clone);
  }

  async commit(change) {
    return this.backend.commit(change);
  }

  async export() {
    const data = await this.backend.readData();
    const exportedData = {
      meta: data.meta,
      characters: Object.values(data.characters),
      items: Object.values(data.items),
      ledger: data.ledger,
      backups: data.backups,
    };
    const payload = {
      format: 'devinarok-save',
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      data: exportedData,
    };
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    const digest = await this.cryptoProvider.subtle.digest('SHA-256', bytes);
    payload.sha256 = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
    return payload;
  }

  async import(payload) {
    if (!payload || payload.format !== 'devinarok-save' || payload.schemaVersion !== SCHEMA_VERSION || !payload.data) {
      throw new TypeError('Invalid save format');
    }
    const { sha256, ...unsigned } = payload;
    const digest = await this.cryptoProvider.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(unsigned)));
    const actual = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
    if (actual !== sha256) throw new Error('Save checksum mismatch');
    if (!payload.data.meta || !Array.isArray(payload.data.characters) || !Array.isArray(payload.data.items) ||
        !Array.isArray(payload.data.ledger) || !Array.isArray(payload.data.backups)) {
      throw new TypeError('Invalid save data');
    }
    const current = await this.backend.readData();
    const imported = {
      meta: clone(payload.data.meta),
      characters: Object.fromEntries(payload.data.characters.map((character) => [character.id, character])),
      items: Object.fromEntries(payload.data.items.map((item) => [item.uid, item])),
      ledger: clone(payload.data.ledger),
      backups: [...clone(payload.data.backups), { id: uuid(this.cryptoProvider), createdAt: Date.now(), data: current }],
    };
    for (const character of Object.values(imported.characters)) {
      if (!character.id || !Number.isInteger(character.rev) || character.rev < 1 || !character.name) {
        throw new TypeError('Invalid character in save data');
      }
    }
    await this.backend.replaceData(imported);
  }
}

export async function createSaveRepository({ indexedDb = globalThis.indexedDB, cryptoProvider = globalThis.crypto } = {}) {
  let backend;
  try {
    backend = await IndexedDbBackend.open(indexedDb);
  } catch {
    backend = new MemoryBackend();
  }
  const repository = new SaveRepository(backend, { cryptoProvider });
  await repository.initialize();
  return repository;
}
