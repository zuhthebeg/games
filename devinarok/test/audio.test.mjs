import assert from 'node:assert/strict';
import test from 'node:test';
import { AudioManager } from '../js/render/audio.js';

test('audio files fail independently and missing buffers do not affect music playback', async () => {
  const audioContextDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext');
  const fetchDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
  const warn = console.warn;
  const warnings = [];
  class TestAudioContext {
    constructor() {
      this.destination = {};
    }

    createGain() {
      return { gain: { value: 1 }, connect(target) { return target; } };
    }

    decodeAudioData() {
      return Promise.resolve({});
    }
  }
  Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: TestAudioContext });
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: async (url) => ({
      ok: !url.href.endsWith('/impact.ogg'),
      arrayBuffer: async () => new ArrayBuffer(0),
    }),
  });
  console.warn = (...args) => warnings.push(args);
  try {
    const audio = new AudioManager();
    await assert.doesNotReject(audio.loadAll());
    assert.equal(audio.buffers.size, 11);
    assert.ok(!audio.buffers.has('impact'));
    assert.equal(warnings.length, 1);

    const currentTrack = { stopped: false, stop() { this.stopped = true; } };
    audio.music = currentTrack;
    audio.setMusic('impact');
    assert.equal(audio.music, currentTrack);
    assert.equal(currentTrack.stopped, false);
    assert.equal(audio.play('impact'), undefined);
  } finally {
    console.warn = warn;
    if (audioContextDescriptor) Object.defineProperty(globalThis, 'AudioContext', audioContextDescriptor);
    else delete globalThis.AudioContext;
    if (fetchDescriptor) Object.defineProperty(globalThis, 'fetch', fetchDescriptor);
  }
});
