import { validateSave } from './save.js';
import { SLOT_SAVE_KEYS } from './character-slots.js';
import { ITEMS } from './items.js';
import { STAGE_XP } from './progression.js';

const CORE = ['version','createdAt','name','lineage','permanentDeathKnight','level','xp','statPoints','stats','gold','equipped','items','stacks','cleared','stageThreat','threat','skillMastery','learned','skills','loadout','loadouts','weaponLoadouts','quiz','flags','seenMaterials','quests','retiredScrolls','craftCount'];
const encoder = new TextEncoder();
const AUTH_KEYS = ['relay_token', 'cocy_auth_token', 'accessToken'];
const ownerKey = slot => `${SLOT_SAVE_KEYS[slot]}.cloud-owner.v1`;
export function snapshot(save) {
  if (!validateSave(save)) throw new Error('Invalid local save');
  const data = { v: 1, charId: save.lineage || 'human' };
  for (const key of CORE) if (save[key] !== undefined) data[key] = structuredClone(save[key]);
  const worn = new Set(Object.values(save.equipped).filter(Boolean));
  data.items = save.items.filter(item => worn.has(item.uid));
  data.stacks = Object.fromEntries(Object.entries(save.stacks).filter(([id]) => ITEMS[id]?.kind === 'material'));
  data.stageThreat = Object.fromEntries(Object.entries(save.stageThreat || {}).filter(([, value]) => value > 0));
  data.cleared = Object.fromEntries(Object.entries(save.cleared).filter(([id, value]) => value === true || ['S1','S2','S3','S4'].includes(id)));
  // The first four flags are mandatory in existing SaveStore validation.
  for (const id of ['S1','S2','S3','S4']) data.cleared[id] = !!save.cleared[id];
  if (encoder.encode(JSON.stringify(data)).length > 8192) throw new Error('Cloud snapshot exceeds 8KB');
  return data;
}
export function restoreSnapshot(data) {
  if (!data || data.v !== 1 || !Object.hasOwn(SLOT_SAVE_KEYS, data.charId)) throw new Error('Invalid snapshot');
  const save = Object.fromEntries(CORE.filter(k => data[k] !== undefined).map(k => [k, structuredClone(data[k])]));
  Object.assign(save, { completedRounds: 0, shopRefresh: 0, paidRefreshes: 0, shopBought: [], rarelessRounds: 0,
    stash: { stacks: {} }, stacks: { ...save.stacks }, learned: save.learned || [], skills: save.skills || {},
    skillMastery: save.skillMastery || {}, flags: save.flags || { chiefPity: false, starterRestoreUsed: false } });
  if (!validateSave(save) || (save.lineage || 'human') !== data.charId) throw new Error('Snapshot failed save validation');
  return save;
}
export function progress(save) {
  return [save.level, Object.values(save.cleared || {}).filter(Boolean).length, save.xp];
}
export function compareProgress(a, b) {
  const aa = progress(a), bb = progress(b);
  for (let i = 0; i < aa.length; i++) if (aa[i] !== bb[i]) return Math.sign(aa[i] - bb[i]);
  return 0;
}
export function combatPower(data) {
  const gear = Object.values(data.equipped || {}).map(uid => data.items?.find(i => i.uid === uid)).filter(Boolean);
  const weapon = gear.find(i => i.uid === data.equipped.weapon);
  const attack = (data.stats?.str || 0) + (data.stats?.int || 0) + (weapon?.enhance || 0) * 5;
  const defense = (data.stats?.con || 0) + gear.filter(i => i !== weapon).reduce((n, i) => n + 2 + (i.enhance || 0) * 2, 0);
  return Math.round(attack * 2 + defense * 1.5 + (data.stats?.agi || 0));
}
export class CloudSave {
  constructor({ storage, fetcher = (...args) => fetch(...args), now = () => Date.now(), timer = (fn, delay) => setTimeout(fn, delay), cancelTimer = id => clearTimeout(id) } = {}) {
    this.storage = storage; this.fetcher = fetcher; this.now = now; this.timer = timer; this.cancelTimer = cancelTimer;
    this.pending = new Map(); this.lastSent = new Map(); this.lastHash = new Map(); this.remote = new Map(); this.uploading = new Set();
    this.wakeups = new Map(); this.retryAt = new Map();
    this.epoch = 0; this.authRevision = 0; this.changes = new Map(); this.blockedTokens = new Set();
    globalThis.window?.addEventListener?.('storage', event => {
      if (event.storageArea && event.storageArea !== this.storage) return;
      if (event.key === null || AUTH_KEYS.includes(event.key) || Object.values(SLOT_SAVE_KEYS).some(key => event.key === key || event.key === key + '.cloud-owner.v1')) {
        this.authRevision++; this.isolate();
      }
    });
  }
  // A token string (including decoded JWT claims) is not an owner proof.
  authState() {
    try {
      const values = AUTH_KEYS.map(key => this.storage.getItem(key));
      const key = JSON.stringify(values), token = values[1] || values[2] || values[0];
      if (key !== this.authKey) {
        this.authKey = key; this.authRevision++; this.verified = null;
        if (!token) this.isolate();
      }
      return { key, token, revision: this.authRevision };
    } catch { this.isolate(); return {}; }
  }
  isolate() {
    // Discard only in-memory cloud state, never the local save or its backups.
    this.epoch++; this.verified = null; this.owner = null;
    for (const slot of this.wakeups.keys()) this.clearWakeup(slot);
    for (const map of [this.pending, this.lastSent, this.lastHash, this.remote, this.retryAt, this.changes]) map.clear();
  }
  current() {
    const state = this.authState(), context = this.verified;
    return context && context.key === state.key && context.revision === state.revision && !this.blockedTokens.has(context.token) ? context : null;
  }
  matches(context) { return !!context && this.current() === context; }
  async token() {
    // Do not invoke ensureAuth: its fallback can create a different anonymous owner.
    const state = this.authState();
    if (!state.token || this.blockedTokens.has(state.token)) throw new Error('Cloud auth blocked');
    if (this.current()) return this.verified.token;
    if (this.authPromise?.key === state.key && this.authPromise.revision === state.revision) return this.authPromise.promise;
    const request = { key: state.key, revision: state.revision };
    request.promise = (async () => {
      const response = await this.fetcher('https://relay.cocy.io/api/auth/me', { headers: { Authorization: `Bearer ${state.token}` } });
      if (this.authState().revision !== state.revision) throw new Error('Stale cloud auth');
      if (response.status === 401) this.blockedTokens.add(state.token);
      if (!response.ok) throw new Error('Cloud identity unavailable');
      const user = await response.json();
      if (this.authState().revision !== state.revision || typeof user.id !== 'string' || !user.id) throw new Error('Stale cloud identity');
      if (this.owner && this.owner !== user.id) this.isolate();
      this.owner = user.id;
      this.verified = { ...state, owner: user.id, epoch: this.epoch };
      return state.token;
    })().finally(() => { if (this.authPromise === request) this.authPromise = null; });
    this.authPromise = request;
    return request.promise;
  }
  proof(slot, data, owner) {
    // Timestamp is not provenance: only the exact committed cloud snapshot is proven.
    try {
      const raw = this.storage.getItem(ownerKey(slot)), proof = JSON.parse(raw);
      const local = JSON.parse(this.storage.getItem(SLOT_SAVE_KEYS[slot]));
      return proof?.v === 1 && proof.committed === true && proof.owner === owner &&
        proof.content === JSON.stringify(data.charId ? data : snapshot(data)) &&
        validateSave(local) && (local.lineage || 'human') === slot &&
        JSON.stringify(snapshot(local)) === proof.content ? raw : null;
    } catch { return null; }
  }
  writable(slot, raw) {
    try {
      if (!raw || this.storage.getItem(ownerKey(slot)) !== raw) return false;
      // Rewriting the same nonsecret proof detects unavailable/quota-failed persistence.
      this.storage.setItem(ownerKey(slot), raw);
      return this.storage.getItem(ownerKey(slot)) === raw;
    } catch { return false; }
  }
  intentMatches(entry) {
    const context = this.current();
    try {
      return context && entry.owner === context.owner && entry.epoch === context.epoch &&
        this.storage.getItem(SLOT_SAVE_KEYS[entry.data.charId]) === entry.localBytes &&
        this.proof(entry.data.charId, entry.data, context.owner) === entry.proof;
    } catch { return false; }
  }
  async load() {
    const token = await this.token(), context = this.current();
    if (!this.matches(context) || context.token !== token) throw new Error('Stale cloud GET');
    const response = await this.fetcher('https://relay.cocy.io/api/arpg/character', { headers: { Authorization: `Bearer ${token}` } });
    if (!this.matches(context)) throw new Error('Stale cloud GET');
    if (response.status === 401) this.blockedTokens.add(token);
    if (!response.ok) throw new Error(`Cloud GET ${response.status}`);
    const body = await response.json();
    if (!this.matches(context)) throw new Error('Stale cloud GET');
    this.remote.clear();
    for (const row of body.characters || []) {
      try { const save = restoreSnapshot(row.data); if (row.charId !== (save.lineage || 'human')) continue; this.remote.set(row.charId, { ...row, save, context }); } catch { /* Ignore incompatible remote snapshots. */ }
    }
    for (const slot of ['human', 'skeleton_knight']) {
      let local = null;
      try { local = JSON.parse(this.storage.getItem(SLOT_SAVE_KEYS[slot])); } catch { /* Leave local recovery to SaveStore. */ }
      if (!validateSave(local) || !this.proof(slot, local, context.owner)) continue;
      const remote = this.remote.get(slot);
      if (remote && compareProgress(remote.save, local) > 0) continue;
      try {
        const data = snapshot(local), hash = JSON.stringify(data);
        if (remote && JSON.stringify(remote.data) === hash) this.lastHash.set(slot, hash);
        else this.changed(local);
      } catch { /* Oversize saves remain local. */ }
    }
    return this.remote;
  }
  offer(slot) {
    const remote = this.remote.get(slot);
    if (!remote || !this.matches(remote.context)) return null;
    let local = null;
    try {
      const bytes = this.storage.getItem(SLOT_SAVE_KEYS[slot]);
      local = JSON.parse(bytes);
      // Only an empty destination can be first-bound by an explicit verified restore.
      if (bytes === null ? this.storage.getItem(ownerKey(slot)) !== null : !this.proof(slot, local, remote.context.owner)) return null;
    } catch { return null; }
    return !local || !validateSave(local) || compareProgress(remote.save, local) > 0 ? remote : null;
  }
  restore(slot) {
    const remote = this.offer(slot); if (!remote) throw new Error('No newer cloud character');
    const key = SLOT_SAVE_KEYS[slot];
    const old = this.storage.getItem(key);
    if (!this.matches(remote.context)) throw new Error('Stale cloud restore');
    const record = { v: 1, owner: remote.context.owner, content: JSON.stringify(snapshot(remote.save)), committed: false };
    const staged = JSON.stringify(record), bytes = JSON.stringify(remote.save);
    this.storage.setItem(ownerKey(slot), staged);
    if (this.storage.getItem(ownerKey(slot)) !== staged || !this.matches(remote.context)) throw new Error('Cloud owner storage unavailable');
    if (old !== null) this.storage.setItem(`${key}.cloud-backup.${this.now()}`, old);
    this.storage.setItem(key, bytes);
    if (this.storage.getItem(key) !== bytes || !this.matches(remote.context)) throw new Error('Cloud restore incomplete');
    // Native setItem is atomic: a thrown final write leaves only unusable staged proof.
    this.storage.setItem(ownerKey(slot), JSON.stringify({ ...record, committed: true }));
    return remote.save;
  }
  changed(save) {
    let data; try { data = snapshot(save); } catch { return; }
    const slot = data.charId, change = {};
    this.changes.set(slot, change);
    const enqueue = () => {
      if (this.changes.get(slot) !== change) return;
      const context = this.current(), proof = context && this.proof(slot, data, context.owner);
      if (!proof) return;
      const remote = this.remote.get(slot);
      if (remote && this.matches(remote.context) && compareProgress(remote.save, data) > 0) return;
      const hash = JSON.stringify(data);
      if (hash === this.lastHash.get(slot) && !this.pending.has(slot)) return;
      let localBytes; try { localBytes = this.storage.getItem(SLOT_SAVE_KEYS[slot]); } catch { return; }
      this.pending.set(slot, { data, hash, owner: context.owner, epoch: context.epoch, proof, localBytes });
      if (!this.uploading.has(slot)) this.schedule(slot, this.now() + 300);
    };
    if (this.current()) enqueue();
    else this.token().then(enqueue).catch(() => {});
  }
  schedule(slot, at) {
    this.clearWakeup(slot);
    if (!this.pending.has(slot) || this.uploading.has(slot)) return;
    at = Math.max(at, this.retryAt.get(slot) ?? 0, this.lastSent.has(slot) ? this.lastSent.get(slot) + 60000 : 0);
    const wakeup = {};
    this.wakeups.set(slot, wakeup);
    wakeup.id = this.timer(() => {
      if (this.wakeups.get(slot) !== wakeup) return;
      this.wakeups.delete(slot);
      this.flush({ slot });
    }, Math.min(2147483647, Math.max(0, at - this.now())));
  }
  clearWakeup(slot) {
    const wakeup = this.wakeups.get(slot);
    if (wakeup) { this.cancelTimer(wakeup.id); this.wakeups.delete(slot); }
  }
  async flush({ hidden = false, slot: onlySlot } = {}) {
    for (const slot of [...this.pending.keys()]) {
      const entry = this.pending.get(slot);
      if (!entry) continue;
      if (onlySlot !== undefined && slot !== onlySlot) continue;
      if (this.uploading.has(slot)) continue;
      const allowedAt = Math.max(this.retryAt.get(slot) ?? 0,
        !hidden && this.lastSent.has(slot) ? this.lastSent.get(slot) + 60000 : 0);
      if (this.now() < allowedAt) { this.schedule(slot, allowedAt); continue; }
      this.clearWakeup(slot);
      this.uploading.add(slot);
      try {
        const token = await this.token(), context = this.current();
        if (!context || context.token !== token) continue;
        if (!this.intentMatches(entry) || !this.writable(slot, entry.proof) || !this.intentMatches(entry) || !this.matches(context)) {
          if (this.pending.get(slot) === entry) this.pending.delete(slot);
          continue;
        }
        const response = await this.fetcher('https://relay.cocy.io/api/arpg/character', { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(entry.data), keepalive: hidden });
        if (!this.matches(context)) continue;
        if (response.status === 401) { this.blockedTokens.add(token); this.verified = null; continue; }
        if (response.status === 429) {
          const value = response.headers?.get('Retry-After')?.trim();
          // HTTP-date accepts IMF-fixdate, RFC850 and asctime, all in UTC.
          const gmt = /^(?:[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4}|[A-Za-z]+, \d{2}-[A-Za-z]{3}-\d{2}) \d{2}:\d{2}:\d{2} GMT$/;
          const asctime = /^[A-Za-z]{3} [A-Za-z]{3} (?: \d|\d{2}) \d{2}:\d{2}:\d{2} \d{4}$/;
          const date = gmt.test(value) ? value : asctime.test(value) ? `${value} GMT` : undefined;
          const delay = value && /^\d+$/.test(value) ? Number(value) * 1000 : Date.parse(date) - this.now();
          this.retry(slot, Number.isFinite(delay) ? Math.max(31000, delay) : 31000);
          continue;
        }
        if (!response.ok) throw new Error(`Cloud PUT ${response.status}`);
        if (this.pending.get(slot) === entry) this.pending.delete(slot);
        this.lastHash.set(slot, entry.hash); this.lastSent.set(slot, this.now());
        this.retryAt.delete(slot);
      } catch {
        const latest = this.pending.get(slot);
        if (latest && latest.owner === entry.owner && latest.epoch === entry.epoch && this.intentMatches(latest)) this.retry(slot, 30000);
      }
      finally {
        this.uploading.delete(slot);
        if (this.pending.has(slot) && this.current() && this.intentMatches(this.pending.get(slot))) this.schedule(slot, this.now());
      }
    }
  }
  retry(slot, delay) { this.retryAt.set(slot, this.now() + delay); }
  async rankings() {
    const response = await this.fetcher('https://relay.cocy.io/api/rankings/arpg');
    if (!response.ok) throw new Error('Ranking unavailable');
    return (await response.json()).rankings;
  }
}
