// Skill effects now follow mastery; only the classic debug override remains.
export function fxPreference(search = globalThis.location?.search || '') {
  return new URLSearchParams(search).get('fx') === 'classic' ? 'classic' : 'new';
}
