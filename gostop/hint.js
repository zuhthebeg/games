(function (root) {
  'use strict';
  function canHint(g, multiplayer) {
    return !multiplayer && !!g && g.turn === 0 && !g.over && !g.acting && !g._dealing &&
      Array.isArray(g.players) && Array.isArray(g.players[0]?.hand) && g.players[0].hand.length > 0 &&
      Array.isArray(g.table) && Array.isArray(g.deck);
  }
  function publicCard(c) {
    return {id:c.id, m:c.m, role:c.role, gwang:!!c.gwang, ssangpi:!!c.ssangpi,
      godori:!!c.godori, tti:c.tti || null};
  }
  function getHintRequest(g, score, multiplayer) {
    if (!canHint(g, multiplayer)) return null;
    const table = g.table.map(publicCard);
    return {state:{table, captured:g.players[0].cap.map(publicCard),
      opponentCaptured:g.players[1].cap.map(publicCard), score:score(g.players[0].cap).total,
      opponentScore:score(g.players[1].cap).total, go:g.go, deckCount:g.deck.length},
    candidates:g.players[0].hand.map(c=>({...publicCard(c), matches:table.filter(t=>t.m===c.m).map(t=>t.id)}))};
  }
  function hintFingerprint(g, score, epoch) {
    const request = getHintRequest(g, score, false);
    return request ? JSON.stringify([epoch, request]) : null;
  }
  function isCurrentHint(stamp, g, score, epoch, multiplayer) {
    return !!stamp && !multiplayer && stamp === hintFingerprint(g, score, epoch);
  }
  function validHintCard(response, request, g) {
    if (!response || typeof response.cardId !== 'string' || typeof response.reason !== 'string' ||
      !request || !g?.players?.[0]?.hand) return null;
    return request.candidates.some(c=>c.id===response.cardId) &&
      g.players[0].hand.some(c=>c.id===response.cardId) ? response.cardId : null;
  }
  const api = {canHint, getHintRequest, hintFingerprint, isCurrentHint, validHintCard};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GostopHint = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
