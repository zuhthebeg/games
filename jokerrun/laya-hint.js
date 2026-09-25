/* JokerRun AI hint mode: builds legal attack/discard candidates from the visible hand and asks the
   server-side model to pick one. Advice only — no game action is invoked here. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.JokerRunLayaHint = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const endpoint = 'https://llm.cocy.io/api/games/jokerrun/hint';
  const MAX_DISCARDS = 15;   // server accepts D0..D14
  const TIMEOUT_MS = 12000;  // first call may load the model on GPU
  const SUIT_SYM = { spade: '♠', heart: '♥', club: '♣', diamond: '♦' };
  const rankName = n => n === 14 ? 'A' : n === 13 ? 'K' : n === 12 ? 'Q' : n === 11 ? 'J' : String(n);
  const cardLabel = c => `${SUIT_SYM[c.suit] || ''}${rankName(c.rank)}`;
  const copyCard = c => ({ id: c.id, rank: c.rank, suit: c.suit, enh: c.enh ?? null });
  const copyJoker = j => ({
    id: j.id, edition: j.edition ?? null, counter: j.counter ?? 0, chipCounter: j.chipCounter ?? 0,
    ...(typeof j.desc === 'string' ? { desc: j.desc.replace(/<[^>]*>/g, '').replace(/[<>\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160) } : {})
  });
  const lowFirst = (a, b) => a.rank - b.rank || String(a.id).localeCompare(String(b.id));
  const inWindow = (rank, lo) => (rank >= lo && rank <= lo + 4) || (lo === 1 && rank === 14);

  // Deterministic, diverse discard subsets from the visible hand only (never deck order).
  function discardCandidates(hand, comboIds, boss) {
    const max = Math.min(boss === 'max3cards' ? 3 : 5, hand.length - 1);
    const out = [], seen = new Set();
    const add = cards => {
      const ids = cards.slice(0, max).map(c => c.id);
      if (!ids.length) return;
      const key = ids.map(String).sort().join(',');
      if (seen.has(key) || out.length >= MAX_DISCARDS) return;
      seen.add(key); out.push(ids);
    };
    if (max < 1) return out;
    const keep = new Set(comboIds);
    const rest = hand.filter(c => !keep.has(c.id)).sort(lowFirst);
    const rankCount = {}, suitCount = {};
    for (const c of hand) { rankCount[c.rank] = (rankCount[c.rank] || 0) + 1; suitCount[c.suit] = (suitCount[c.suit] || 0) + 1; }
    // 1) everything outside the best combo, then its lowest 1–2
    add(rest); add(rest.slice(0, 2)); add(rest.slice(0, 1));
    // 2) unpaired cards (keep pairs/trips)
    add(hand.filter(c => rankCount[c.rank] === 1).sort(lowFirst));
    // 3) flush draw: keep the most common suit
    const flushSuit = Object.keys(suitCount).sort((a, b) => suitCount[b] - suitCount[a])[0];
    if (suitCount[flushSuit] >= 3) add(hand.filter(c => c.suit !== flushSuit).sort(lowFirst));
    // 4) straight draw: keep one card per rank inside the 5-rank window with most distinct ranks
    let bestLo = 0, bestN = 0;
    for (let lo = 1; lo <= 10; lo++) {
      const n = new Set(hand.filter(c => inWindow(c.rank, lo)).map(c => (c.rank === 14 && lo === 1 ? 1 : c.rank))).size;
      if (n > bestN) { bestN = n; bestLo = lo; }
    }
    if (bestN >= 3) {
      const used = new Set();
      const run = hand.filter(c => {
        const r = c.rank === 14 && bestLo === 1 ? 1 : c.rank;
        if (!inWindow(c.rank, bestLo) || used.has(r)) return false;
        used.add(r); return true;
      });
      add(hand.filter(c => !run.includes(c)).sort(lowFirst));
    }
    // 5) cards the boss disables for attacks
    if (boss === 'no_hearts') add(hand.filter(c => c.suit === 'heart').sort(lowFirst));
    // 6) plain low-card dumps
    const low = [...hand].sort(lowFirst);
    for (let k = max; k >= 1; k--) add(low.slice(0, k));
    return out;
  }

  function buildHintRequest(s, comboIds) {
    const hand = (s.hand || []).map(copyCard);
    const jokers = (s.jokers || []).map(copyJoker);
    const boss = s.bossModifier?.id || null;
    let bestComboIds = (comboIds || []).filter(id => hand.some(c => c.id === id));
    const playable = s.handsLeft > 0 && bestComboIds.length > 0 &&
      (boss !== 'min4cards' || bestComboIds.length >= 4) && (boss !== 'max3cards' || bestComboIds.length <= 3) &&
      !(boss === 'no_hearts' && bestComboIds.some(id => hand.find(c => c.id === id).suit === 'heart'));
    if (!playable) bestComboIds = [];
    const choices = [];
    if (playable) choices.push({ id: 'A0', kind: 'PLAY_BEST', cardIds: [...bestComboIds] });
    if (s.discardsLeft > 0 && boss !== 'no_discard') {
      discardCandidates(hand, bestComboIds, boss).forEach((ids, i) => choices.push({ id: `D${i}`, kind: 'DISCARD', cardIds: ids }));
    }
    if (choices.length < 2) return null;
    const deckRanks = {};
    for (const c of s.deck || []) deckRanks[c.rank] = (deckRanks[c.rank] || 0) + 1;
    return { state: {
      hand, jokers, handLevels: { ...s.handLevels }, handsLeft: s.handsLeft, discardsLeft: s.discardsLeft,
      deckCount: (s.deck || []).length, deckRanks, bossModifier: boss ? { id: boss } : null,
      score: s.score, target: s.target, bestComboIds
    }, choices };
  }

  const handFingerprint = s => JSON.stringify([s.ante, s.roundIndex, s.handsLeft, s.discardsLeft, s.gameEnded,
    (s.hand || []).map(c => [c.id, c.rank, c.suit, c.enh ?? null])]);
  const isSignedToken = t => typeof t === 'string' && t.split('.').length === 3 && !!t.split('.')[2];

  // request() resolves to {status:'ok',kind,cardIds} | {status:'none'|'guest'|'failed'|'stale'}. Never throws.
  function createHintController({ getState, getComboIds, getToken, fetcher, timeoutMs = TIMEOUT_MS }) {
    let sequence = 0;
    return { async request() {
      const serial = ++sequence;
      const state = getState();
      if (state.gameEnded) return { status: 'none' };
      const body = buildHintRequest(state, getComboIds());
      if (!body) return { status: 'none' };
      const token = getToken();
      if (!isSignedToken(token)) return { status: 'guest' };
      const fingerprint = handFingerprint(state);
      const stale = () => serial !== sequence || handFingerprint(getState()) !== fingerprint;
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), timeoutMs);
      try {
        const response = await fetcher(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body), signal: abort.signal });
        if (stale()) return { status: 'stale' };
        if (!response.ok) return { status: response.status === 401 ? 'guest' : 'failed' };
        const result = await response.json();
        if (stale()) return { status: 'stale' };
        // Only trust a candidate we sent; returned card IDs must match it exactly.
        const choice = body.choices.find(c => c.id === result?.choiceId);
        if (!choice || !Array.isArray(result.cardIds) || result.cardIds.length !== choice.cardIds.length ||
            !choice.cardIds.every(id => result.cardIds.includes(id))) return { status: 'failed' };
        return { status: 'ok', kind: choice.kind, cardIds: [...choice.cardIds] };
      } catch (_) {
        return stale() ? { status: 'stale' } : { status: 'failed' };
      } finally {
        clearTimeout(timer);
      }
    } };
  }

  // Hint mode preference: algorithm unless the player explicitly opted into AI.
  const MODE_KEY = 'jokerrun_hintmode';
  function getHintMode(storage) {
    try { return (storage || globalThis.localStorage)?.getItem(MODE_KEY) === 'ai' ? 'ai' : 'algorithm'; } catch (_) { return 'algorithm'; }
  }
  function setHintMode(mode, storage) {
    try { (storage || globalThis.localStorage)?.setItem(MODE_KEY, mode === 'ai' ? 'ai' : 'algorithm'); } catch (_) {}
  }

  return { buildHintRequest, discardCandidates, handFingerprint, createHintController, cardLabel, getHintMode, setHintMode };
});
