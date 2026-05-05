const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

const requiredKeys = [
  'maxPlayers', 'createRoom', 'turnSeconds', 'targetScore', 'roomCode', 'joinRoom',
  'relayReady', 'ready', 'unready', 'fillAI', 'leave', 'gameReady', 'waitingPlayers',
  'copyLink', 'share', 'hostReadyHint', 'mapLabel', 'defaultMap', 'shareCopied',
  'shareFailed', 'inviteCopied', 'copyFailed', 'resultCopied', 'roomCodeRequired'
];
for (const key of requiredKeys) {
  assert(html.includes(`${key}:`), `PINGTAN_I18N should include ${key}`);
}

const snippets = [
  '${pt("maxPlayers")}', '${pt("createRoom")}', '${pt("turnSeconds")}',
  '${pt("targetScore")}', 'placeholder="${pt("roomCode")}"', '${pt("joinRoom")}',
  'pt("relayReady")', 'pt("gameReady")', 'pt("waitingPlayers")',
  '${pt("copyLink")}', '${pt("share")}', '${pt("fillAI")}', '${pt("leave")}', '${pt("startGame")}', '${pt("mapLabel")}',
  '${mpState.ready ? pt("unready") : pt("ready")}', '${pt("hostReadyHint")}',
  'showToast(pt("shareCopied"))', 'showToast(pt("inviteCopied"))', 'showToast(pt("copyFailed"))', 'showToast(pt("shareFailed"))',
  'showToast(pt("resultCopied"))', 'const text = roomInviteText();', 'mpState.waitingMessage = pt("roomCodeRequired")'
];
for (const snippet of snippets) {
  assert(html.includes(snippet), `lobby/multiplayer UI should use i18n snippet: ${snippet}`);
}

console.log('PASS pingtan lobby i18n');

const shareStart = html.indexOf('async function shareRoomInvite()');
const shareChunk = html.slice(shareStart, shareStart + 500);
assert(shareChunk.includes('const text = roomInviteText();'), 'shareRoomInvite should use roomInviteText, not plain room code copy');
