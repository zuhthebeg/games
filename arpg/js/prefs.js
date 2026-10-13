// Device presentation preferences (not part of the character save).
const FX_KEY = 'arpg.fx';
const store = () => { try { return globalThis.localStorage || null; } catch { return null; } };

// URL ?fx=classic / ?fx=effekseer overrides the saved choice for testing.
export function fxPreference(search = globalThis.location?.search || '', storage = store()) {
  const forced = new URLSearchParams(search).get('fx');
  if (forced === 'classic') return 'classic';
  if (forced === 'effekseer') return 'new';
  try { return storage?.getItem(FX_KEY) === 'classic' ? 'classic' : 'new'; } catch { return 'new'; }
}

export function setFxPreference(mode, storage = store()) {
  try { storage?.setItem(FX_KEY, mode === 'classic' ? 'classic' : 'new'); } catch { /* Session-only fallback. */ }
}
