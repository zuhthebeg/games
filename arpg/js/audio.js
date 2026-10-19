import { FEEL } from './render/feel.js';
import { PROFILE_FILES, eventCues } from './audio-profile.js';

export const SFX = Object.freeze(['swing', 'hit', 'critical', 'dodge', 'hurt', 'kill', 'level-up']);
export const AUDIO_FILES = Object.freeze([...SFX, ...PROFILE_FILES]);
const MUTED_KEY = 'arpg.audio.muted';

// First/primary cue API; events() also plays the bounded impact accent.
export function eventSound(event, localId, entities = []) {
  return eventCues(event, localId, entities)[0]?.name ?? null;
}

export class CombatAudio {
  constructor({ storage = globalThis.localStorage, Context = globalThis.AudioContext || globalThis.webkitAudioContext,
    fetchAudio = globalThis.fetch, random = Math.random } = {}) {
    this.storage = storage;
    this.Context = Context;
    this.random = random;
    this.context = null;
    this.buffers = new Map();
    this.voices = new Set();
    this.lastPlayed = new Map();
    this.muted = false;
    try { this.muted = storage?.getItem(MUTED_KEY) === '1'; } catch { /* Private mode: session preference only. */ }
    // Download early; do not create/resume an AudioContext until a real user gesture.
    this.download = Promise.all(AUDIO_FILES.map(async (name) => {
      try {
        const response = await fetchAudio(new URL(`../assets/audio/${name}.ogg`, import.meta.url));
        return response.ok ? [name, await response.arrayBuffer()] : null;
      } catch { return null; } // Offline audio must never interrupt combat.
    }));
  }

  async unlock() {
    if (!this.Context) return;
    try {
      if (!this.context) {
        this.context = new this.Context();
        this.master = this.context.createGain();
        this.master.gain.value = this.muted ? 0 : FEEL.audio.gain;
        // Dense impacts retain the existing master gain/cap, with bus headroom.
        if (this.context.createDynamicsCompressor) {
          this.limiter = this.context.createDynamicsCompressor();
          this.limiter.threshold.value = -6;
          this.limiter.knee.value = 0;
          this.limiter.ratio.value = 20;
          this.limiter.attack.value = .001;
          this.limiter.release.value = .09;
          this.master.connect(this.limiter); this.limiter.connect(this.context.destination);
        } else this.master.connect(this.context.destination);
        this.loading = this.download.then(async (files) => {
          for (const file of files) {
            if (!file) continue;
            try { this.buffers.set(file[0], await this.context.decodeAudioData(file[1])); } catch { /* Unsupported codec. */ }
          }
        });
      }
      if (this.context.state === 'suspended') await this.context.resume();
      await this.loading;
    } catch { /* Device audio can be unavailable without blocking inputs. */ }
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    if (this.master) this.master.gain.value = this.muted ? 0 : FEEL.audio.gain;
    if (this.muted) this.stop();
    try { this.storage?.setItem(MUTED_KEY, this.muted ? '1' : '0'); } catch { /* Session-only fallback. */ }
  }

  stop() {
    for (const voice of this.voices) voice.stop();
    this.voices.clear();
    this.lastPlayed.clear();
  }

  play(name, { fallback = null, pitch = 1, gain = 1, key = name, cooldown = FEEL.audio.cooldown } = {}) {
    if (name === 'enchant-down') return this.playDowngrade({gain, key, cooldown});
    const context = this.context, buffer = this.buffers.get(name) ?? this.buffers.get(fallback);
    if (this.muted || !buffer || context?.state !== 'running') return false;
    const now = context.currentTime;
    if (now - (this.lastPlayed.get(key) ?? -Infinity) < Math.max(FEEL.audio.cooldown, cooldown)) return false;
    if (this.voices.size >= FEEL.audio.voices) {
      if (name !== 'counter-hit') return false;
      const oldest = this.voices.values().next().value;
      oldest.stop(); this.voices.delete(oldest);
    }
    const voice = context.createBufferSource();
    voice.buffer = buffer;
    voice.playbackRate.value = pitch * (1 + (this.random() * 2 - 1) * (pitch === 1 ? FEEL.audio.pitch : .015));
    const level = context.createGain();
    level.gain.value = Math.max(0, Math.min(1, gain));
    voice.connect(level); level.connect(this.master);
    voice.onended = () => { this.voices.delete(voice); voice.disconnect(); level.disconnect?.(); };
    this.voices.add(voice);
    this.lastPlayed.set(key, now);
    voice.start();
    return true;
  }

  // A low descending triangle, never the rising level-up clip; same master/mute/voice lifecycle.
  playDowngrade({gain = 1, key = 'enchant-down', cooldown = FEEL.audio.cooldown} = {}) {
    const context = this.context;
    if (this.muted || context?.state !== 'running' || !context.createOscillator) return false;
    const now = context.currentTime;
    if (now - (this.lastPlayed.get(key) ?? -Infinity) < Math.max(FEEL.audio.cooldown, cooldown) || this.voices.size >= FEEL.audio.voices) return false;
    const voice = context.createOscillator(), level = context.createGain();
    voice.type = 'triangle';
    voice.frequency.setValueAtTime(220, now);
    voice.frequency.exponentialRampToValueAtTime(55, now + .42);
    level.gain.setValueAtTime(Math.max(0, Math.min(1, gain)) * .35, now);
    level.gain.exponentialRampToValueAtTime(.001, now + .45);
    voice.connect(level); level.connect(this.master);
    voice.onended = () => { this.voices.delete(voice); voice.disconnect(); level.disconnect(); };
    this.voices.add(voice); this.lastPlayed.set(key, now);
    voice.start(now); voice.stop(now + .46);
    return true;
  }

  events(events, localId, entities = []) {
    for (const event of events) {
      for (const cue of eventCues(event, localId, entities)) this.play(cue.name, cue);
    }
  }
}

// The icon sits next to existing settings; a second copy stays available during battle.
export function bindAudioControls(audio, document) {
  document.addEventListener('arpg:presentation-sound', event => {
    if (['level-up', 'kill', 'dodge', 'critical', 'hurt', 'enchant-down'].includes(event.detail)) audio.play(event.detail);
  });
  const refresh = () => {
    for (const button of document.querySelectorAll('[data-sound-toggle]')) {
      button.textContent = audio.muted ? '🔇' : '🔊';
      button.setAttribute('aria-label', audio.muted ? '소리 켜기' : '음소거');
      button.setAttribute('aria-pressed', String(audio.muted));
    }
  };
  document.addEventListener('pointerdown', () => { void audio.unlock(); }, { passive: true });
  document.addEventListener('keydown', () => { void audio.unlock(); }, { passive: true });
  document.addEventListener('click', (event) => {
    if (!event.target.closest('[data-sound-toggle]')) return;
    audio.setMuted(!audio.muted);
    refresh();
  });
  // Inn settings panel: detail.muted is set to read, or applied when a boolean.
  document.addEventListener('arpg:sound', (event) => {
    if (typeof event.detail?.set === 'boolean') { audio.setMuted(event.detail.set); refresh(); }
    if (event.detail) event.detail.muted = audio.muted;
  });
  const observer = new MutationObserver(refresh);
  observer.observe(document.querySelector('#meta-screen'), { childList: true });
  refresh();
}
