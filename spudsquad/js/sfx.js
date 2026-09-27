(function (root) {
  'use strict';
  const P = root.SPUD = root.SPUD || {};
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  let context = null;
  let volume = read('spud_volume', .35);
  let muted = read('spud_mute', false);
  let picks = 0, lastPick = 0;
  const history = new Map();
  const limits = { shot: 12, hit: 16 };
  function unlock() {
    if (!context) context = new (root.AudioContext || root.webkitAudioContext)();
    if (context.state === 'suspended') context.resume();
  }
  root.addEventListener('pointerdown', unlock, { once: true });
  root.addEventListener('keydown', unlock, { once: true });
  function sfx(name, options = {}) {
    if (!context || muted || volume <= 0) return;
    const now = context.currentTime;
    const times = (history.get(name) || []).filter(t => now - t < 1);
    if (times.length >= (limits[name] || 24)) return;
    times.push(now);
    history.set(name, times);
    const config = {
      shot: [440, .07, 'noise'], laser: [960, .19, 'sine'], boom: [110, .28, 'noise'],
      swing: [380, .13, 'noise'], hit: [590, .055, 'square'], crit: [920, .11, 'triangle'],
      kill: [390, .12, 'sine'], pick: [660, .10, 'sine'], hurt: [170, .18, 'sawtooth'],
      lvl: [900, .30, 'triangle'], buy: [600, .16, 'sine'], wave: [520, .35, 'triangle']
    }[name];
    if (!config) return;
    if (name === 'pick') {
      picks = now - lastPick < .3 ? Math.min(12, picks + 1) : 0;
      lastPick = now;
    }
    const [hz, length, wave] = config;
    const amp = context.createGain();
    amp.gain.setValueAtTime(.0001, now);
    amp.gain.exponentialRampToValueAtTime(Math.max(.001, volume * .18), now + .008);
    amp.gain.exponentialRampToValueAtTime(.0001, now + length);
    amp.connect(context.destination);
    const pitch = (options.pitch || 1) * (.92 + Math.random() * .16) * (name === 'pick' ? 2 ** (picks / 12) : 1);
    let source;
    if (wave === 'noise') {
      const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * length), context.sampleRate);
      const samples = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      source = context.createBufferSource();
      source.buffer = buffer;
      const filter = context.createBiquadFilter();
      filter.type = name === 'boom' ? 'lowpass' : 'bandpass';
      filter.frequency.value = hz * pitch;
      source.connect(filter);
      filter.connect(amp);
    } else {
      source = context.createOscillator();
      source.type = wave;
      source.frequency.setValueAtTime(hz * pitch, now);
      source.frequency.exponentialRampToValueAtTime(Math.max(60, hz * pitch * .45), now + length);
      source.connect(amp);
    }
    source.start(now);
    source.stop(now + length);
  }
  sfx.settings = () => ({ volume, muted });
  sfx.mute = () => { muted = !muted; localStorage.setItem('spud_mute', JSON.stringify(muted)); return muted; };
  sfx.volume = value => {
    volume = Math.max(0, Math.min(1, Number(value)));
    localStorage.setItem('spud_volume', JSON.stringify(volume));
  };
  P.sfx = sfx;
})(window);
