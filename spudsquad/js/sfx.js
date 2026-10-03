(function (root) {
  'use strict';
  const P = root.SPUD = root.SPUD || {};
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  let context = null, master = null, sfxBus = null, weaponBus = null, musicBus = null;
  let volume = read('spud_volume', .35);
  let muted = read('spud_mute', false);
  let musicOn = read('spud_music', true);
  let picks = 0, lastPick = 0;
  const history = new Map();
  const limits = { shot: 12, hit: 16 };
  const AUDIO_V = '20261001b';
  const shotGap = { pistol: .10, smg: .09, shotgun: .18, bow: .14 };
  const lastShot = new Map(), voices = [];
  const firearms = new Set(['pistol', 'smg', 'shotgun']);

  // 샘플 뱅크(MOSS-SoundEffect/ACE-Step; 총·석궁은 짧은 로컬 DSP 합성으로 교체). 없으면 합성음 폴백.
  const SAMPLE_FILES = {
    pistol: 'sfx_pistol', smg: 'sfx_smg', shotgun: 'sfx_shotgun', laser: 'sfx_laser', rocket: 'sfx_rocket',
    boom: 'sfx_explosion', swing: 'sfx_swing', slam: 'sfx_slam', punch: 'sfx_punch', kill: 'sfx_squish',
    hurt: 'sfx_hurt', zap: 'sfx_zap', flame: 'sfx_flame', bow: 'sfx_bow', sling: 'sfx_sling', crate: 'sfx_crate'
  };
  const MUSIC_FILES = { battle: 'bgm_battle', shop: 'bgm_shop', boss: 'bgm_boss' };
  // 무기 → 발사음
  const WEAPON_SOUND = {
    pistol: 'pistol', smg: 'smg', shotgun: 'shotgun', laser: 'laser', rocket: 'rocket', crossbow: 'bow',
    slingshot: 'sling', flamethrower: 'flame', staff: 'zap', fist: 'punch', dagger: 'swing', spear: 'swing',
    stick: 'swing', hammer: 'slam', shield: 'punch'
  };
  // 샘플별 음량 보정(생성물 레벨 편차)
  const GAIN = { smg: .32, flame: .55, pistol: .5, shotgun: .55, bow: .65, swing: .8, kill: .7, boom: .9, zap: .7 };
  const buffers = {};
  let loading = null;

  function load() {
    if (loading) return loading;
    const base = 'assets/audio/';
    const all = [...Object.entries(SAMPLE_FILES), ...Object.entries(MUSIC_FILES).map(([k, v]) => ['m:' + k, v])];
    loading = Promise.all(all.map(async ([key, file]) => {
      try {
        const res = await fetch(`${base}${file}.mp3?v=${AUDIO_V}`);
        if (!res.ok) return;
        buffers[key] = await context.decodeAudioData(await res.arrayBuffer());
      } catch { /* 폴백 합성음 사용 */ }
    })).then(() => { if (wantTrack) music(wantTrack); });
    return loading;
  }

  function unlock() {
    if (!context) {
      context = new (root.AudioContext || root.webkitAudioContext)();
      master = context.createGain();
      master.connect(context.destination);
      sfxBus = context.createGain(); sfxBus.connect(master);
      // Limit only the new gun/string mix; unrelated SFX and BGM retain their path/gain.
      weaponBus = context.createDynamicsCompressor();
      weaponBus.threshold.value = -6; weaponBus.knee.value = 6; weaponBus.ratio.value = 12;
      weaponBus.attack.value = .003; weaponBus.release.value = .08; weaponBus.connect(sfxBus);
      musicBus = context.createGain(); musicBus.connect(master);
      applyGains();
      load();
    }
    if (context.state === 'suspended') context.resume();
  }
  root.addEventListener('pointerdown', unlock, { once: true });
  root.addEventListener('keydown', unlock, { once: true });

  function applyGains() {
    if (!master) return;
    master.gain.value = muted ? 0 : 1;
    sfxBus.gain.value = volume;
    musicBus.gain.value = musicOn ? volume * .55 : 0;
  }

  function playSample(key, pitch, gain = 1) {
    const buf = buffers[key];
    if (!buf) return false;
    // Short firearm voices are bounded separately; never steal a BGM voice.
    const group = firearms.has(key) ? voices.filter(v => firearms.has(v.key)) : voices.filter(v => v.key === key);
    const cap = firearms.has(key) ? 3 : key === 'bow' ? 2 : 4;
    const retire = voice => {
      voices.splice(voices.indexOf(voice), 1); voice.src.stop();
    };
    if (group.length >= cap) retire(group[0]);
    if (voices.length >= 16) retire(voices[0]);
    const src = context.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = pitch;
    const g = context.createGain();
    g.gain.value = gain * (GAIN[key] || 1);
    src.connect(g); g.connect(firearms.has(key) || key === 'bow' ? weaponBus : sfxBus);
    const voice = { key, src }; voices.push(voice);
    src.onended = () => {
      const i = voices.indexOf(voice); if (i >= 0) voices.splice(i, 1);
      src.disconnect(); g.disconnect();
    };
    src.start();
    return true;
  }

  function synth(name, pitchMul) {
    const now = context.currentTime;
    const config = {
      shot: [440, .07, 'noise'], softshot: [1100, .065, 'noise'], bow: [420, .22, 'triangle'], laser: [960, .19, 'sine'], boom: [110, .28, 'noise'],
      swing: [380, .13, 'noise'], hit: [590, .055, 'square'], crit: [920, .11, 'triangle'],
      kill: [390, .12, 'sine'], pick: [660, .10, 'sine'], hurt: [170, .18, 'sawtooth'],
      lvl: [900, .30, 'triangle'], buy: [600, .16, 'sine'], wave: [520, .35, 'triangle']
    }[name];
    if (!config) return;
    const [hz, length, wave] = config;
    const amp = context.createGain();
    amp.gain.setValueAtTime(.0001, now);
    amp.gain.exponentialRampToValueAtTime(name === 'softshot' || name === 'bow' ? .10 : .18, now + .008);
    amp.gain.exponentialRampToValueAtTime(.0001, now + length);
    amp.connect(name === 'softshot' || name === 'bow' ? weaponBus : sfxBus);
    let source;
    if (wave === 'noise') {
      const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * length), context.sampleRate);
      const samples = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      source = context.createBufferSource();
      source.buffer = buffer;
      const filter = context.createBiquadFilter();
      filter.type = name === 'boom' || name === 'softshot' ? 'lowpass' : 'bandpass';
      filter.frequency.value = hz * pitchMul;
      source.connect(filter);
      filter.connect(amp);
    } else {
      source = context.createOscillator();
      source.type = wave;
      source.frequency.setValueAtTime(hz * pitchMul, now);
      source.frequency.exponentialRampToValueAtTime(Math.max(60, hz * pitchMul * .45), now + length);
      source.connect(amp);
    }
    source.start(now);
    source.stop(now + length);
  }

  // name: 'shot'|'hit'|... 또는 'w:<weaponId>'(무기 발사음)
  function sfx(name, options = {}) {
    if (!context || muted || volume <= 0) return;
    const now = context.currentTime;
    const weaponKey = name.startsWith('w:') ? WEAPON_SOUND[name.slice(2)] : null;
    if (weaponKey && now - (lastShot.get(weaponKey) ?? -Infinity) < (shotGap[weaponKey] || 0)) return;
    const limitKey = name.startsWith('w:') ? 'shot' : name;
    const times = (history.get(limitKey) || []).filter(t => now - t < 1);
    if (times.length >= (limits[limitKey] || 24)) return;
    if (weaponKey) lastShot.set(weaponKey, now);
    times.push(now);
    history.set(limitKey, times);
    if (name === 'pick') {
      picks = now - lastPick < .3 ? Math.min(12, picks + 1) : 0;
      lastPick = now;
    }
    const pitch = (options.pitch || 1) * (.92 + Math.random() * .16) * (name === 'pick' ? 2 ** (picks / 12) : 1);
    if (name.startsWith('w:')) {
      const key = WEAPON_SOUND[name.slice(2)];
      if (key && playSample(key, pitch, .8)) return;
      return synth(firearms.has(key) ? 'softshot' : key === 'bow' ? 'bow' : key === 'swing' || key === 'punch' || key === 'slam' ? 'swing' : key === 'laser' || key === 'zap' ? 'laser' : 'shot', pitch);
    }
    const sampleFor = { boom: 'boom', kill: 'kill', hurt: 'hurt', crate: 'crate' }[name];
    if (sampleFor && playSample(sampleFor, pitch, name === 'kill' ? .55 : .9)) return;
    synth(name === 'crate' ? 'buy' : name, pitch);
  }

  // 배경음: 트랙 전환 시 1.2s 크로스페이드, 무한 루프.
  let current = null, wantTrack = null;
  function music(track) {
    wantTrack = track;
    if (!context) return;
    if (current?.track === track) return;
    const buf = buffers['m:' + track];
    const t = context.currentTime;
    if (current) {
      const old = current;
      old.gain.gain.setTargetAtTime(0, t, .35);
      setTimeout(() => { try { old.src.stop(); } catch {} }, 1600);
      current = null;
    }
    if (!buf || !track) return;
    const src = context.createBufferSource();
    src.buffer = buf; src.loop = true;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.setTargetAtTime(1, t, .35);
    src.connect(gain); gain.connect(musicBus);
    src.start();
    current = { track, src, gain };
  }

  sfx.music = music;
  sfx.settings = () => ({ volume, muted, musicOn });
  sfx.mute = () => { muted = !muted; localStorage.setItem('spud_mute', JSON.stringify(muted)); applyGains(); return muted; };
  sfx.toggleMusic = () => { musicOn = !musicOn; localStorage.setItem('spud_music', JSON.stringify(musicOn)); applyGains(); return musicOn; };
  sfx.volume = value => {
    volume = Math.max(0, Math.min(1, Number(value)));
    localStorage.setItem('spud_volume', JSON.stringify(volume));
    applyGains();
  };
  P.sfx = sfx;
})(window);
