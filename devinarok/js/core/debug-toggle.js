export const DEBUG_STORAGE_KEY = 'devinarok.debug';

export function initializeDebugMode(search, storage) {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  if (params.get('debug') === '0') {
    try { storage.removeItem(DEBUG_STORAGE_KEY); } catch {}
    return false;
  }
  if (params.get('debug') === '1' || params.get('dev') === '1') {
    try { storage.setItem(DEBUG_STORAGE_KEY, '1'); } catch {}
    return true;
  }
  try {
    return storage.getItem(DEBUG_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function persistDebugMode(enabled, storage) {
  try {
    if (enabled) storage.setItem(DEBUG_STORAGE_KEY, '1');
    else storage.removeItem(DEBUG_STORAGE_KEY);
  } catch {}
}

export function createTapToggle(onToggle, {
  threshold = 5,
  windowMs = 3000,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  let taps = 0;
  let timer = null;
  const handleTap = () => {
    taps += 1;
    clearTimer(timer);
    if (taps >= threshold) {
      taps = 0;
      onToggle();
    } else {
      timer = setTimer(() => { taps = 0; }, windowMs);
    }
  };
  handleTap.dispose = () => clearTimer(timer);
  return handleTap;
}
