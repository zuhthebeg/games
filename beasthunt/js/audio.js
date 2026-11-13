// Tiny synthesized SFX (no asset files).
let ctx = null, master = null, muted = false;
let pitch = 1, gain = 1;
export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = .5; master.connect(ctx.destination);
  } catch (_) { ctx = null; }
}
export function setMuted(m) { muted = m; }
export function isMuted() { return muted; }
function tone(type, f0, f1, dur, vol, delay = 0) {
  f0 *= pitch; f1 *= pitch; vol *= gain;
  const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + .02);
}
function noise(dur, vol, freq, q = 1, delay = 0, type = 'bandpass') {
  freq *= pitch; vol *= gain;
  const t = ctx.currentTime + delay, n = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = ctx.createBufferSource(); s.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); g.gain.value = vol;
  s.connect(f); f.connect(g); g.connect(master); s.start(t);
}
const S = {
  swing() { noise(.16, .25, 1400, .8); },
  swingH() { noise(.3, .35, 700, .7); },
  hit() { noise(.1, .5, 2400, 1.5); tone('square', 220, 80, .09, .18); },
  hitBig() { noise(.22, .7, 1200, 1); tone('sawtooth', 160, 40, .25, .3); },
  weak() { tone('triangle', 880, 1320, .08, .18, .02); },
  shot() { noise(.08, .25, 3200, 2); tone('triangle', 700, 300, .1, .12); },
  roll() { noise(.2, .18, 500, .6); },
  hurt() { tone('sawtooth', 300, 90, .25, .3); noise(.15, .4, 600, .8); },
  roar() { tone('sawtooth', 110, 55, 1.2, .5); tone('sawtooth', 163, 70, 1.1, .3, .04); noise(1.2, .4, 320, .5); },
  stomp() { tone('sine', 90, 30, .4, .7); noise(.3, .4, 200, .5); },
  fire() { noise(.4, .35, 500, .4, 0, 'lowpass'); },
  ice() { tone('triangle', 1600, 500, .2, .2); noise(.1, .2, 4000, 2); },
  break() { noise(.3, .6, 900, .6); tone('square', 520, 780, .12, .2, .05); tone('square', 780, 1040, .18, .2, .16); },
  potion() { tone('sine', 500, 900, .25, .2); tone('sine', 700, 1200, .25, .15, .15); },
  charge() { tone('triangle', 500, 1000, .1, .14); },
  faint() { tone('sawtooth', 300, 60, .9, .3); },
  win() { [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, .32, .25, i * .14)); },
  fail() { [392, 330, 262].forEach((f, i) => tone('triangle', f, f * .97, .4, .25, i * .22)); },
  ui() { tone('triangle', 660, 880, .06, .12); },
  forge() { tone('square', 900, 400, .07, .25); noise(.12, .4, 3000, 3); tone('triangle', 1320, 1320, .35, .15, .1); },
};
export function sfx(name, options = {}) {
  if (!ctx || muted || !S[name]) return;
  pitch = options.pitch ?? 1; gain = options.volume ?? 1;
  try { S[name](); } catch (_) { /* ignore */ } finally { pitch = gain = 1; }
}
