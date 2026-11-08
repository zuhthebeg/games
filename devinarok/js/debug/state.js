export const RECENT_ACTIONS_KEY = 'devinarok.debug.recent';

export function partyActionReason(inParty, action) {
  return inParty && action !== 'disable-debug' && action !== 'info'
    ? '파티 중에는 정보만 확인할 수 있어요'
    : null;
}

export function loadRecentActions(storage = globalThis.localStorage) {
  try {
    const value = JSON.parse(storage.getItem(RECENT_ACTIONS_KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((entry) => typeof entry === 'string').slice(0, 4) : [];
  } catch {
    return [];
  }
}

export function recordRecentAction(actions, action, storage = globalThis.localStorage) {
  const next = [action, ...actions.filter((entry) => entry !== action)].slice(0, 4);
  try { storage.setItem(RECENT_ACTIONS_KEY, JSON.stringify(next)); } catch {}
  return next;
}

export class TwoTapGate {
  constructor({ windowMs = 3000 } = {}) {
    this.windowMs = windowMs;
    this.pending = new Map();
  }

  request(action, now = Date.now()) {
    const expiresAt = this.pending.get(action);
    if (expiresAt !== undefined && now <= expiresAt) {
      this.pending.delete(action);
      return true;
    }
    this.pending.set(action, now + this.windowMs);
    return false;
  }

  clear(action) {
    this.pending.delete(action);
  }
}
