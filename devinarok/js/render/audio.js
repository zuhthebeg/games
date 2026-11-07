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
  'hub-bgm': 'hub-bgm.ogg',
  'combat-bgm': 'combat-bgm.ogg',
  'fire-crackle': 'fire-crackle.ogg',
};

export class AudioManager {
  constructor() {
    this.context = typeof AudioContext === 'undefined' ? null : new AudioContext();
    this.master = this.context?.createGain() ?? null;
    if (this.master) {
      this.master.gain.value = 0.72;
      this.master.connect(this.context.destination);
    }
    this.buffers = new Map();
    this.music = null;
    this.musicName = null;
    this.desiredMusic = null;
    this.muted = false;
  }

  async loadAll() {
    if (!this.context) return;
    await Promise.all(Object.entries(SOUND_FILES).map(async ([name, file]) => {
      try {
        const response = await fetch(new URL(`../../assets/audio/${file}`, import.meta.url));
        if (!response.ok) throw new Error(`Audio fetch failed: ${file}`);
        this.buffers.set(name, await this.context.decodeAudioData(await response.arrayBuffer()));
      } catch (error) {
        console.warn(`Audio load skipped (${name})`, error);
      }
    }));
  }

  async unlock() {
    if (this.context?.state === 'suspended') await this.context.resume();
  }

  play(name, { rate = 1, loop = false, gain = 1 } = {}) {
    if (!this.context || this.muted || !this.buffers.has(name)) return;
    const source = this.context.createBufferSource();
    const volume = this.context.createGain();
    source.buffer = this.buffers.get(name);
    source.playbackRate.value = rate;
    source.loop = loop;
    volume.gain.value = gain;
    source.connect(volume).connect(this.master);
    source.start();
    return source;
  }

  setMusic(name) {
    if (!this.buffers.has(name)) return;
    this.desiredMusic = name;
    if (this.music && this.musicName === name) return;
    this.music?.stop();
    this.music = null;
    this.musicName = null;
    this.startDesiredMusic();
  }

  startDesiredMusic() {
    if (!this.desiredMusic || this.muted || !this.buffers.has(this.desiredMusic)) return;
    if (this.music && this.musicName === this.desiredMusic) return;
    this.music = this.play(this.desiredMusic, { loop: true, gain: 0.28 });
    if (this.music) this.musicName = this.desiredMusic;
  }

  setMuted(value) {
    this.muted = Boolean(value);
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.72;
    if (!this.muted) this.startDesiredMusic();
  }

  destroy() {
    this.music?.stop();
    this.music = null;
    this.musicName = null;
    this.desiredMusic = null;
    this.context?.close();
    this.buffers.clear();
  }
}
