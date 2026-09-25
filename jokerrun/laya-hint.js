/* JokerRun opt-in, read-only strategy pilot. No game action is invoked here. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.JokerRunLayaHint = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const warning = '실험 — 틀릴 수 있음';
  const endpoint = 'https://llm.cocy.io/api/games/jokerrun/hint';
  const labels = { PLAY_BEST: '공격', DISCARD_ONE: '카드 버리기', SWAP_JOKERS: '조커 순서 조정', SWAP_CARDS: '카드 순서 조정' };
  const copyCard = c => ({ id: c.id, rank: c.rank, suit: c.suit, enh: c.enh ?? null });
  const copyJoker = j => ({
    id: j.id, edition: j.edition ?? null, counter: j.counter ?? 0, chipCounter: j.chipCounter ?? 0,
    ...(typeof j.desc === 'string' ? { desc: j.desc.replace(/<[^>]*>/g, '').replace(/[<>\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160) } : {})
  });

  function buildPilotRequest(s, comboIds) {
    const hand = (s.hand || []).map(copyCard);
    const jokers = (s.jokers || []).map(copyJoker);
    const bestComboIds = (comboIds || []).filter(id => hand.some(c => c.id === id));
    const boss = s.bossModifier?.id || null;
    const choices = [];
    const playable = s.handsLeft > 0 && bestComboIds.length && (boss !== 'min4cards' || bestComboIds.length >= 4) && (boss !== 'max3cards' || bestComboIds.length <= 3);
    if (playable) choices.push('PLAY_BEST');
    if (s.discardsLeft > 0 && hand.length && boss !== 'no_discard') choices.push('DISCARD_ONE');
    if (jokers.some((j, i) => j.id === 'blueprint' && jokers.some((target, n) => n !== i && n !== i + 1 && target.id !== 'blueprint' && target.id !== 'brainstorm'))) choices.push('SWAP_JOKERS');
    if (jokers.some(j => j.id === 'hangingChad') && bestComboIds.length >= 2 && playable) choices.push('SWAP_CARDS');
    if (choices.length < 2) return null;
    const deck = s.deck || [];
    const deckRanks = {};
    for (const c of deck) deckRanks[c.rank] = (deckRanks[c.rank] || 0) + 1;
    return { state: {
      hand, jokers, handLevels: { ...s.handLevels }, handsLeft: s.handsLeft, discardsLeft: s.discardsLeft,
      deckCount: deck.length, deckRanks, bossModifier: boss ? { id: boss } : null,
      score: s.score, target: s.target, bestComboIds
    }, choices };
  }

  function pilotFingerprint(s, comboIds) {
    return JSON.stringify([s.ante, s.roundIndex, s.gameEnded, buildPilotRequest(s, comboIds),
      (s.hand || []).map(c => [c.id, c.rank, c.suit, c.enh]), (s.jokers || []).map(j => [j.id, j.edition, j.counter, j.chipCounter])]);
  }

  function createPilotController({ output, button, getState, getComboIds, getToken, fetcher }) {
    let sequence = 0;
    return { async request() {
      const serial = ++sequence;
      const state = getState();
      const combo = getComboIds();
      const body = buildPilotRequest(state, combo);
      output.textContent = `${warning} · 후보 순서에 편향이 있을 수 있습니다.`;
      if (!body || state.gameEnded) { output.textContent = `${warning} · 지금은 비교할 선택지가 부족합니다.`; return; }
      const token = getToken();
      if (!token) { output.textContent = `${warning} · 로그인이 필요합니다.`; return; }
      const fingerprint = pilotFingerprint(state, combo);
      button.disabled = true;
      output.textContent = `${warning} · 분석 중…`;
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), 4500);
      try {
        const response = await fetcher(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body), signal: abort.signal });
        if (serial !== sequence || pilotFingerprint(getState(), getComboIds()) !== fingerprint) return;
        if (!response.ok) throw new Error('unavailable');
        const result = await response.json();
        if (serial !== sequence || pilotFingerprint(getState(), getComboIds()) !== fingerprint) return;
        if (!body.choices.includes(result.choiceId) || typeof result.reason !== 'string') throw new Error('invalid');
        output.textContent = `${warning} · ${labels[result.choiceId]}: ${result.reason.slice(0, 240)}`;
      } catch (_) {
        if (serial === sequence && pilotFingerprint(getState(), getComboIds()) === fingerprint) output.textContent = `${warning} · 지금은 조언을 받을 수 없습니다.`;
      } finally {
        clearTimeout(timer);
        if (serial === sequence) button.disabled = false;
      }
    } };
  }
  return { buildPilotRequest, pilotFingerprint, createPilotController };
});
