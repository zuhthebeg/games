import { STAGE_LIST } from '../content/stages.js';
import { escapeHtml } from './escape-html.js';

const DEFAULT_SERVER = 'wss://relay-do-poc.zuhejbeg.workers.dev';

export function partyHttpBase(search = globalThis.location?.search ?? '') {
  const override = new URLSearchParams(search).get('server');
  const server = new URL(override || DEFAULT_SERVER);
  server.protocol = server.protocol === 'ws:' ? 'http:' : 'https:';
  server.pathname = server.pathname
    .replace(/\/+$/, '')
    .replace(/\/devinarok(?:\/[A-Z0-9]{6})?$/i, '');
  return server.toString().replace(/\/+$/, '');
}

export function sortPartyRooms(rooms = []) {
  return [...rooms].sort((a, b) => (
    (Number(b.players) || 0) - (Number(a.players) || 0)
    || (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0)
  ));
}

export async function quickJoinParty({
  httpBase,
  fetchImpl = globalThis.fetch,
  joinRoom,
  createRoom,
  signal,
} = {}) {
  const assertNotAborted = () => {
    if (!signal?.aborted) return;
    const error = new Error('Quick join was cancelled');
    error.name = 'AbortError';
    throw error;
  };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    assertNotAborted();
    let match;
    try {
      const response = await fetchImpl(`${httpBase.replace(/\/+$/, '')}/coord/match?g=devinarok`, {
        cache: 'no-store',
        signal,
      });
      if (!response.ok) throw new Error(`match-http-${response.status}`);
      match = await response.json();
    } catch (cause) {
      assertNotAborted();
      const error = new Error('match-lookup-failed', { cause });
      error.code = 'match-lookup-failed';
      throw error;
    }
    if (!match?.roomId) break;
    const code = match.meta?.code ?? match.roomId.split(':').at(-1);
    try {
      assertNotAborted();
      await joinRoom(code);
      return { code, created: false };
    } catch (error) {
      assertNotAborted();
      if (!['room-full', 'room-started'].includes(error?.code ?? error?.message)) throw error;
    }
  }
  assertNotAborted();
  const code = await createRoom();
  return { code, created: true };
}

export function partyRoomsMarkup(rooms, playerLevel, { disabled = false } = {}) {
  return sortPartyRooms(rooms).map((room) => {
    const code = String(room.meta?.code ?? String(room.roomId ?? '').split(':').at(-1)).slice(0, 6);
    const hostName = escapeHtml(String(room.meta?.hostName ?? '이름 없는 기사').slice(0, 32));
    const hostLevel = Math.max(1, Math.min(99, Number(room.meta?.hostLevel) || 1));
    const stage = STAGE_LIST.find((entry) => entry.id === room.meta?.stageId) ?? STAGE_LIST[0];
    const count = Math.max(0, Math.min(4, Number(room.players) || 0));
    const dots = `${'●'.repeat(count)}${'○'.repeat(4 - count)}`;
    const levelNote = playerLevel < stage.recommendedLevel - 2
      ? `<small class="party-level-warning">권장 Lv.${stage.recommendedLevel}</small>`
      : '';
    return `<button class="party-room-row" data-party-join="${escapeHtml(code)}" ${disabled ? 'disabled' : ''}><span class="party-room-host">${hostName} · Lv.${hostLevel}</span><span class="party-room-count">${dots} <b>${count}/4</b></span><small>${escapeHtml(String(stage.name))} · 권장 Lv.${stage.recommendedLevel}</small>${levelNote}<b class="party-row-join">참가</b></button>`;
  }).join('');
}
