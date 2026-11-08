const SOUND_FILES = {
  'sword-swing': 'sword-swing.ogg',
  impact: 'impact.ogg',
  'enemy-death': 'enemy-death.ogg',
  'door-open': 'door-open.ogg',
  coins: 'coins.ogg',
  potion: 'potion.ogg',
  confirm: 'confirm.ogg',
  click: 'ui-click.ogg',
  roar: 'boss-roar-substitute.ogg',
  footstep: 'footstep.ogg',
  'fire-crackle': 'fire-crackle.ogg',
  'crossbow-shot': 'crossbow-shot.ogg',
  'staff-cast': 'spell-cast.ogg',
  flame: 'spell-fire.ogg',
  frost: 'spell-frost.ogg',
  blink: 'spell-blink.ogg',
  'shield-clang': 'shield-clang.ogg',
  'boss-telegraph': 'boss-telegraph.ogg',
  summon: 'spell-summon.ogg',
  'reward-chime': 'level-up.ogg',
  'hub-bgm': 'hub-bgm.ogg',
  'combat-bgm': 'combat-bgm.ogg',
  'forest-bgm': 'forest-bgm.ogg',
  'castle-bgm': 'castle-bgm.ogg',
  'sanctuary-bgm': 'sanctuary-bgm.ogg',
};

const MUSIC_NAMES = new Set(['hub-bgm', 'combat-bgm', 'forest-bgm', 'castle-bgm', 'sanctuary-bgm']);
export const SHARED_SFX_NAMES = Object.keys(SOUND_FILES).filter((name) => !MUSIC_NAMES.has(name));
export const AUDIO_NAMES = Object.freeze(Object.keys(SOUND_FILES));

function scheduleGain(param, value, now, seconds) {
  if (!param) return;
  if (!seconds || typeof param.linearRampToValueAtTime !== 'function') {
    param.value = value;
    return;
  }
  param.cancelScheduledValues?.(now);
  param.setValueAtTime?.(param.value, now);
  param.linearRampToValueAtTime(value, now + seconds);
}

export class AudioManager {
  constructor() {
    this.context = typeof AudioContext === 'undefined' ? null : new AudioContext();
    this.master = this.context?.createGain() ?? null;
    this.bgmBus = this.context?.createGain() ?? null;
    this.sfxBus = this.context?.createGain() ?? null;
    if (this.master) {
      this.master.gain.value = 1;
      this.master.connect(this.context.destination);
      this.bgmBus.connect(this.master);
      this.sfxBus.connect(this.master);
    }
    this.bgmVolume = 0.7;
    this.sfxVolume = 0.7;
    this.buffers = new Map();
    this.pendingLoads = new Map();
    this.activeSfx = new Map();
    this.music = null;
    this.musicName = null;
    this.desiredMusic = null;
    this.muted = false;
    this.setBgmVolume(this.bgmVolume);
    this.setSfxVolume(this.sfxVolume);
  }

  async load(names) {
    if (!this.context) return;
    await Promise.all([...new Set(names)].map(async (name) => {
      const file = SOUND_FILES[name];
      if (!file || this.buffers.has(name)) return;
      if (!this.pendingLoads.has(name)) {
        const load = (async () => {
          try {
            const response = await fetch(new URL(`../../assets/audio/${file}`, import.meta.url));
            if (!response.ok) throw new Error(`Audio fetch failed: ${file}`);
            this.buffers.set(name, await this.context.decodeAudioData(await response.arrayBuffer()));
          } catch (error) {
            console.warn(`Audio load skipped (${name})`, error);
          } finally {
            this.pendingLoads.delete(name);
          }
        })();
        this.pendingLoads.set(name, load);
      }
      await this.pendingLoads.get(name);
    }));
  }

  async loadAll() {
    await this.load(AUDIO_NAMES);
  }

  async loadScene(musicName) {
    await this.load([...SHARED_SFX_NAMES, musicName]);
  }

  async unlock() {
    if (this.context?.state === 'suspended') await this.context.resume();
  }

  play(name, { rate = 1, loop = false, gain = 1, bus = 'sfx' } = {}) {
    if (!this.context || this.muted || !this.buffers.has(name)) return;
    let active;
    if (bus === 'sfx' && !loop) {
      active = this.activeSfx.get(name);
      if (active?.size >= 4) return;
      if (!active) this.activeSfx.set(name, active = new Set());
    }
    const source = this.context.createBufferSource();
    const volume = this.context.createGain();
    source.buffer = this.buffers.get(name);
    source.playbackRate.value = rate;
    source.loop = loop;
    volume.gain.value = gain;
    source.connect(volume).connect(bus === 'bgm' ? this.bgmBus : this.sfxBus);
    source.volumeNode = volume;
    let released = false;
    const release = () => {
      if (released || !active) return;
      released = true;
      active.delete(source);
      if (!active.size) this.activeSfx.delete(name);
    };
    if (active) {
      active.add(source);
      source.onended = release;
    }
    source.start();
    return source;
  }

  setBgmVolume(value) {
    this.bgmVolume = Math.max(0, Math.min(1, Number(value) || 0));
    if (this.bgmBus) this.bgmBus.gain.value = this.bgmVolume;
  }

  setSfxVolume(value) {
    this.sfxVolume = Math.max(0, Math.min(1, Number(value) || 0));
    if (this.sfxBus) this.sfxBus.gain.value = this.sfxVolume;
  }

  setMusic(name, { crossfadeMs = 1000 } = {}) {
    this.desiredMusic = name;
    if (!this.buffers.has(name)) return;
    if (this.muted) {
      this.music?.stop();
      this.music = null;
      this.musicName = null;
      return;
    }
    if (this.music && this.musicName === name) return;
    const previous = this.music;
    const duration = Math.max(0, crossfadeMs) / 1000;
    const now = this.context.currentTime ?? 0;
    const next = this.play(name, { loop: true, gain: duration ? 0 : 0.28, bus: 'bgm' });
    if (!next) return;
    if (previous) {
      scheduleGain(previous.volumeNode?.gain, 0, now, duration);
      try { previous.stop(now + duration); } catch {}
    }
    scheduleGain(next.volumeNode?.gain, 0.28, now, duration);
    this.music = next;
    this.musicName = name;
  }

  setMuted(value) {
    this.muted = Boolean(value);
    if (this.master) this.master.gain.value = this.muted ? 0 : 1;
    if (!this.muted && !this.music) this.setMusic(this.desiredMusic);
  }

  destroy() {
    for (const source of this.activeSfx.values()) {
      for (const active of source) active.stop();
    }
    this.music?.stop();
    this.music = null;
    this.musicName = null;
    this.desiredMusic = null;
    this.context?.close();
    this.buffers.clear();
  }
}
