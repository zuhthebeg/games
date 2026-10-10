import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { CombatAudio, eventSound, SFX } from '../js/audio.js';
import { FEEL } from '../js/render/feel.js';

class FakeContext {
  constructor() { this.state = 'suspended'; this.currentTime = 0; this.started = []; this.decoded = 0; }
  createGain() { return { gain: { value: 0 }, connect() {} }; }
  async resume() { this.state = 'running'; }
  async decodeAudioData(bytes) { this.decoded++; return { bytes }; }
  createBufferSource() {
    const source = { playbackRate: { value: 1 }, connect() {}, disconnect() {},
      start: () => this.started.push(source), stop: () => source.onended?.() };
    return source;
  }
}
function fixture(options = {}) {
  const saved = new Map();
  const storage = { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) };
  const audio = new CombatAudio({ storage, Context: FakeContext, random: () => 1,
    fetchAudio: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) }), ...options });
  return { audio, saved };
}

test('audio awaits a gesture, loads once, bounds pitch/voice count, and releases voices', async () => {
  const { audio } = fixture();
  assert.equal(audio.context, null);
  assert.equal(audio.play('hit'), false);
  await audio.unlock();
  await audio.unlock();
  assert.equal(audio.context.decoded, SFX.length);
  assert.equal(audio.context.state, 'running');
  for (let index = 0; index < 10; index++) {
    audio.context.currentTime += .04;
    audio.play('hit');
  }
  assert.equal(audio.voices.size, FEEL.audio.voices);
  assert.ok(audio.context.started.every(source => source.playbackRate.value === 1.05));
  audio.context.started[0].onended();
  assert.equal(audio.voices.size, FEEL.audio.voices - 1);
  audio.stop();
  assert.equal(audio.voices.size, 0);
});

test('mute persists, stops active playback, and suppresses downloads/decode failures safely', async () => {
  const { audio, saved } = fixture();
  await audio.unlock();
  audio.play('hurt');
  audio.setMuted(true);
  assert.equal(audio.voices.size, 0);
  assert.equal(audio.master.gain.value, 0);
  assert.equal(audio.play('hit'), false);
  assert.equal(saved.get('arpg.audio.muted'), '1');
  audio.setMuted(false);
  assert.equal(audio.master.gain.value, FEEL.audio.gain);
  assert.equal(audio.play('hit'), true);
  const { audio: offline } = fixture({ fetchAudio: async () => { throw new Error('offline'); } });
  await offline.unlock();
  assert.equal(offline.buffers.size, 0);
  assert.equal(offline.play('hit'), false);
});

test('event selection respects local actions and actual weak-point events; no simulated critical roll', () => {
  assert.equal(eventSound({ type: 'act', id: 1 }, 1), 'swing');
  assert.equal(eventSound({ type: 'act', id: 2 }, 1), null);
  assert.equal(eventSound({ type: 'hit', src: 1, dst: 2 }, 1), 'hit');
  assert.equal(eventSound({ type: 'hit', dst: 2, exposed: true }, 1), 'critical');
  assert.equal(eventSound({ type: 'hit', dst: 1, exposed: true }, 1), 'hurt');
  assert.equal(eventSound({ type: 'dodge', id: 1 }, 1), 'dodge');
  assert.equal(eventSound({ type: 'kill' }, 1), 'kill');
});

test('local SFX delivery is Ogg, mono 48kHz, documented, short and below 400KB total', async () => {
  let bytes = 0;
  const metadata = JSON.parse(await readFile(new URL('../assets/audio/generation.json', import.meta.url), 'utf8'));
  for (const name of SFX) {
    const url = new URL(`../assets/audio/${name}.ogg`, import.meta.url);
    bytes += (await stat(url)).size;
    assert.equal((await readFile(url)).subarray(0, 4).toString(), 'OggS');
    const info = metadata.find(entry => entry.name === `${name}.ogg`);
    assert.ok(info.prompt && info.sourceSha256 && info.duration <= 1.2 && info.sampleRate === 48000 && info.channels === 1);
  }
  assert.ok(bytes <= 400_000, bytes);
});
