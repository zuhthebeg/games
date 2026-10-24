import { validateSave } from './save.js';
import { SLOT_SAVE_KEYS } from './character-slots.js';
import { ITEMS } from './items.js';
import { STAGE_XP } from './progression.js';

const CORE = ['version','createdAt','name','lineage','permanentDeathKnight','level','xp','statPoints','stats','gold','equipped','items','stacks','cleared','stageThreat','threat','skillMastery','learned','skills','loadout','loadouts','weaponLoadouts','quiz','flags','seenMaterials','quests','retiredScrolls','craftCount'];
const encoder = new TextEncoder();
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
  }
  async token() {
    const client = window.MultiplayerClient?.getInstance();
    if (!client) throw new Error('Relay auth unavailable');
    if (!this.authPromise) this.authPromise = client.ensureAuth().then(() => client.token).finally(() => { this.authPromise = null; });
    return this.authPromise;
  }
  async load() {
    const token = await this.token();
    const response = await this.fetcher('https://relay.cocy.io/api/arpg/character', { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Cloud GET ${response.status}`);
    const body = await response.json();
    this.remote.clear();
    for (const row of body.characters || []) {
      try { const save = restoreSnapshot(row.data); this.remote.set(row.charId, { ...row, save }); } catch { /* Ignore incompatible remote snapshots. */ }
    }
    for (const slot of ['human', 'skeleton_knight']) {
      let local = null;
      try { local = JSON.parse(this.storage.getItem(SLOT_SAVE_KEYS[slot])); } catch { /* Leave local recovery to SaveStore. */ }
      if (!validateSave(local)) continue;
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
    if (!remote) return null;
    let local = null;
    try { local = JSON.parse(this.storage.getItem(SLOT_SAVE_KEYS[slot])); } catch { /* local reader owns corruption */ }
    return !local || !validateSave(local) || compareProgress(remote.save, local) > 0 ? remote : null;
  }
  restore(slot) {
    const remote = this.offer(slot); if (!remote) throw new Error('No newer cloud character');
    const key = SLOT_SAVE_KEYS[slot];
    const old = this.storage.getItem(key);
    if (old !== null) this.storage.setItem(`${key}.cloud-backup.${this.now()}`, old);
    this.storage.setItem(key, JSON.stringify(remote.save));
    return remote.save;
  }
  changed(save) {
    const remote = this.remote.get(save.lineage || 'human');
    if (remote && compareProgress(remote.save, save) > 0) return;
    let data; try { data = snapshot(save); } catch { return; }
    const hash = JSON.stringify(data), slot = data.charId;
    if (hash === this.lastHash.get(slot)) return;
    this.pending.set(slot, { data, hash });
    const delay = Math.max(0, (this.lastSent.get(slot) || 0) + 60000 - this.now());
    if (this.scheduled) this.cancelTimer(this.scheduled);
    this.scheduled = this.timer(() => { this.scheduled = null; this.flush(); }, Math.max(delay, 300));
  }
  async flush({ hidden = false } = {}) {
    for (const [slot, entry] of [...this.pending]) {
      if (this.uploading.has(slot)) continue;
      if (this.now() - (this.lastSent.get(slot) || 0) < 60000 && !hidden) { this.retry(slot, 60000 - (this.now() - this.lastSent.get(slot))); continue; }
      this.uploading.add(slot);
      try {
        const token = await this.token();
        const response = await this.fetcher('https://relay.cocy.io/api/arpg/character', { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(entry.data), keepalive: hidden });
        if (response.status === 429) { this.retry(slot, 31000); continue; }
        if (!response.ok) throw new Error(`Cloud PUT ${response.status}`);
        if (this.pending.get(slot) === entry) this.pending.delete(slot);
        this.lastHash.set(slot, entry.hash); this.lastSent.set(slot, this.now());
      } catch { this.retry(slot, 30000); }
      finally { this.uploading.delete(slot); }
    }
  }
  retry(slot, delay) { this.timer(() => { if (this.pending.has(slot)) this.flush(); }, delay); }
  async rankings() {
    const response = await this.fetcher('https://relay.cocy.io/api/rankings/arpg');
    if (!response.ok) throw new Error('Ranking unavailable');
    return (await response.json()).rankings;
  }
}
