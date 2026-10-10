import { ATLAS_IDS } from './atlas-state.js';

// One promise per requested kit: no download of other weapons or future spawns.
// Inject loaders so the lifecycle (including failure) is testable without WebGL.
export class AtlasLibrary {
  constructor({ baseUrl, fetchManifest, loadSheet, unloadSheet }) {
    this.baseUrl = baseUrl;
    this.fetchManifest = fetchManifest;
    this.loadSheet = loadSheet;
    this.unloadSheet = unloadSheet;
    this.manifest = null;
    this.entries = new Map();
    this.active = new Set();
    this.failed = new Map();
    this.releasing = new Map();
  }

  beginRound(keys) {
    this.active = new Set(keys);
    for (const [key, record] of this.entries) {
      if (!this.active.has(key) && record.asset) {
        this.entries.delete(key);
        // Cache ownership is the library's; individual sprites never destroy
        // shared texture sources. Existing round views are destroyed first.
        this.releasing.set(key, this.release(record));
      }
    }
  }

  async release(record) {
    await Promise.allSettled(record.urls.map((url) => this.unloadSheet(url)));
  }

  load(key) {
    this.active.add(key);
    if (this.entries.has(key)) return this.entries.get(key).promise;
    if (this.failed.has(key)) return Promise.resolve(null);
    const id = ATLAS_IDS[key];
    if (!id) return Promise.resolve(null);
    const record = { urls: [], asset: null, promise: null };
    this.entries.set(key, record);
    record.promise = this.loadEntry(key, id, record).catch((error) => {
      // Expected offline/missing-art failures are recoverable, not boot errors.
      this.failed.set(key, error.message);
      this.entries.delete(key);
      this.releasing.set(key, this.release(record));
      return null;
    });
    return record.promise;
  }

  async loadEntry(key, id, record) {
    await this.releasing.get(key);
    this.releasing.delete(key);
    this.manifest ||= this.fetchManifest(new URL('manifest.json', this.baseUrl).href);
    const manifest = await this.manifest;
    const entry = manifest.find((candidate) => candidate.id === id);
    if (!entry || !entry.content_ids.includes(key)) throw new Error(`Atlas manifest missing ${key}`);
    const animations = {};
    for (const filename of entry.sheets) {
      const url = new URL(`${id}/${filename}`, this.baseUrl).href;
      record.urls.push(url);
      const sheet = await this.loadSheet(url, id);
      Object.assign(animations, sheet.animations);
    }
    for (const state of entry.animations) {
      for (const direction of ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE']) {
        if (!animations[`${state}_${direction}`]?.length) throw new Error(`Atlas ${id}: ${state}_${direction} missing`);
      }
    }
    const asset = { ...entry, animations };
    if (!this.active.has(key)) {
      this.entries.delete(key);
      await this.release(record);
      return null;
    }
    record.asset = asset;
    return asset;
  }

  status() {
    return {
      loaded: [...this.entries].filter(([, record]) => record.asset).map(([key]) => key),
      loading: [...this.entries].filter(([, record]) => !record.asset).map(([key]) => key),
      failed: Object.fromEntries(this.failed),
    };
  }
}
