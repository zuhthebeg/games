import { FEEL } from './render/feel.js';

export const SFX = Object.freeze(['swing', 'hit', 'critical', 'dodge', 'hurt', 'kill', 'level-up']);
const MUTED_KEY = 'arpg.audio.muted';

export function eventSound(event, localId) {
  if (event.type === 'act' && event.id === localId) return 'swing';
  if (event.type === 'dodge' && event.id === localId) return 'dodge';
  if (event.type === 'hit') return event.dst === localId ? 'hurt'
    : event.exposed || event.critical ? 'critical' : 'hit';
  if (event.type === 'kill') return 'kill';
  if (event.type === 'death' && event.id === localId) return 'hurt';
  return null;
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
    this.download = Promise.all(SFX.map(async (name) => {
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
        this.master.connect(this.context.destination);
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

  play(name) {
    const context = this.context, buffer = this.buffers.get(name);
    if (this.muted || !buffer || context?.state !== 'running' || this.voices.size >= FEEL.audio.voices) return false;
    const now = context.currentTime;
    if (now - (this.lastPlayed.get(name) ?? -Infinity) < FEEL.audio.cooldown) return false;
    const voice = context.createBufferSource();
    voice.buffer = buffer;
    voice.playbackRate.value = 1 + (this.random() * 2 - 1) * FEEL.audio.pitch;
    voice.connect(this.master);
    voice.onended = () => { this.voices.delete(voice); voice.disconnect(); };
    this.voices.add(voice);
    this.lastPlayed.set(name, now);
    voice.start();
    return true;
  }

  events(events, localId) {
    for (const event of events) {
      const sound = eventSound(event, localId);
      if (sound) this.play(sound);
    }
  }
}

// The icon sits next to existing settings; a second copy stays available during battle.
export function bindAudioControls(audio, document) {
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
  const observer = new MutationObserver(refresh);
  observer.observe(document.querySelector('#meta-screen'), { childList: true });
  refresh();
}
