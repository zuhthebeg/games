import assert from 'node:assert/strict';
import test from 'node:test';
import { AUDIO_NAMES, AudioManager, SHARED_SFX_NAMES } from '../js/render/audio.js';

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
    assert.equal(audio.buffers.size, AUDIO_NAMES.length - 1);
    assert.ok(!audio.buffers.has('impact'));
    assert.ok(audio.buffers.has('fire-crackle'));
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

test('scene audio loads shared effects and only the requested regional loop', async () => {
  const audio = new AudioManager();
  const requests = [];
  audio.context = {
    decodeAudioData: async () => ({}),
  };
  const fetchDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: async (url) => {
      requests.push(url.href);
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(0) };
    },
  });
  try {
    await audio.loadScene('forest-bgm');
    assert.ok(SHARED_SFX_NAMES.every((name) => audio.buffers.has(name)));
    assert.ok(audio.buffers.has('forest-bgm'));
    assert.ok(!audio.buffers.has('castle-bgm'));
    assert.ok(!audio.buffers.has('sanctuary-bgm'));
    assert.ok(!requests.some((url) => url.includes('castle-bgm.ogg')));
  } finally {
    if (fetchDescriptor) Object.defineProperty(globalThis, 'fetch', fetchDescriptor);
    else delete globalThis.fetch;
  }
});

test('muted music changes resume the desired track once on unmute', () => {
  const audio = new AudioManager();
  let starts = 0;
  let stops = 0;
  audio.context = {
    createBufferSource() {
      return {
        playbackRate: { value: 1 },
        connect(target) { return target; },
        start() { starts += 1; },
        stop() { stops += 1; },
      };
    },
    createGain() {
      return { gain: { value: 1 }, connect(target) { return target; } };
    },
  };
  audio.master = { gain: { value: 0.72 } };
  audio.buffers.set('hub-bgm', {});
  audio.buffers.set('combat-bgm', {});

  audio.setMusic('hub-bgm');
  audio.setMuted(true);
  audio.setMuted(false);
  assert.equal(starts, 1);

  audio.setMuted(true);
  audio.setMusic('combat-bgm');
  assert.equal(stops, 1);
  assert.equal(starts, 1);
  audio.setMuted(false);
  assert.equal(starts, 2);
  audio.setMuted(false);
  audio.setMusic('combat-bgm');
  assert.equal(starts, 2);
});

test('identical non-looping effects are throttled to four active sources', () => {
  const audio = new AudioManager();
  const sources = [];
  audio.context = {
    createBufferSource() {
      const source = {
        playbackRate: { value: 1 },
        connect(target) { return target; },
        start() { sources.push(this); },
        stop() {},
      };
      return source;
    },
    createGain() {
      return { gain: { value: 1 }, connect(target) { return target; } };
    },
  };
  audio.sfxBus = {};
  audio.buffers.set('impact', {});
  for (let index = 0; index < 5; index += 1) audio.play('impact');
  assert.equal(sources.length, 4);
  sources[0].onended();
  audio.play('impact');
  assert.equal(sources.length, 5);
});
