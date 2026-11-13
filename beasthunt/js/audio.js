// Synthesized defaults plus lazy greatsword samples. No network at module evaluation.
let ctx = null, master = null, muted = false;
let pitch = 1, gain = 1, capture = null;
export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') void ctx.resume().catch(()=>{}); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = muted ? 0 : masterVolume; master.connect(ctx.destination);
  } catch (_) { ctx = null; }
}
export function setMuted(m) { muted = !!m; if (master) master.gain.value = muted ? 0 : masterVolume; if (muted) stopAllGS(); }
export function isMuted() { return muted; }
function tone(type, f0, f1, dur, vol, delay = 0) {
  f0 *= pitch; f1 *= pitch; vol *= gain;
  const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  o.connect(g); g.connect(master); capture?.push(o); o.start(t); o.stop(t + dur + .02);
}
function noise(dur, vol, freq, q = 1, delay = 0, type = 'bandpass') {
  freq *= pitch; vol *= gain;
  const t = ctx.currentTime + delay, n = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = ctx.createBufferSource(); s.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); g.gain.value = vol;
  s.connect(f); f.connect(g); g.connect(master); capture?.push(s); s.start(t);
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
function synth(name, options = {}) {
  if (!ctx || muted || !S[name]) return;
  pitch = options.pitch ?? 1; gain = options.volume ?? 1;
  try { S[name](); } catch (_) { /* ignore */ } finally { pitch = gain = 1; }
}

const masterDefault = .5;
let masterVolume = masterDefault;
export function setVolume(v) { masterVolume = Math.max(0, Math.min(1, Number(v) || 0)); if (master) master.gain.value = muted ? 0 : masterVolume; }
export const GS_SAMPLES = Object.freeze(Object.fromEntries([
  'gs_swing_light','gs_swing_b','gs_swing_spin','gs_hit','gs_hit_part','gs_hit_weak',
  'gs_charge_1','gs_charge_2','gs_charge_3','gs_charge_loop','gs_charge_release',
  'gs_slam','gs_guard_block','gs_guard_break','gs_roll',
].map(name => [name, [1,2].map(i => new URL('../assets/audio/'+name+'-'+i+'.ogg', import.meta.url).href)])));
const fallback = {gs_swing_light:'swingH',gs_swing_b:'swingH',gs_swing_spin:'swingH',gs_hit:'hit',gs_hit_part:'break',gs_hit_weak:'weak',gs_charge_1:'charge',gs_charge_2:'charge',gs_charge_3:'charge',gs_charge_loop:'charge',gs_charge_release:'swingH',gs_slam:'hitBig',gs_guard_block:'forge',gs_guard_break:'break',gs_roll:'roll'};
const cache = new Map(), last = new Map(), voices = new Set(), loops = new Map();
export function loadSample(url) {
  if (!ctx) return Promise.resolve(null);
  if (!cache.has(url)) cache.set(url, (async () => {
    try { const r = await fetch(url, {priority:'low'}); if (!r.ok) throw Error('audio '+r.status); return await ctx.decodeAudioData(await r.arrayBuffer()); }
    catch { return null; } // Cache failure: no retry storm, no unhandled rejection.
  })());
  return cache.get(url);
}
const ready = new Map();
function request(url) { return loadSample(url).then(b => { if (b) ready.set(url,b); return b; }); }
// Explicit user GS selection/start only. Serial low-priority fetching avoids bursts.
export async function preloadGS() { if (!ctx) return; for (const pool of Object.values(GS_SAMPLES)) for (const url of pool) await request(url); }
function choose(name, options) {
  const pool=GS_SAMPLES[name]; let i=Number.isInteger(options.variant)?Math.max(0,Math.min(pool.length-1,options.variant)):Math.floor(Math.random()*pool.length);
  if (!Number.isInteger(options.variant) && i===last.get(name)) i=(i+1)%pool.length;
  last.set(name,i);return pool[i];
}
function admit() { // Shared four-voice cap includes unloaded/failed synthetic GS cues.
  for (const v of voices) if (v.until<=ctx.currentTime) { v.stop(); voices.delete(v); }
  if (voices.size>=4) { const v=[...voices].find(v=>!v.loop); if (!v) return false; v.stop(); voices.delete(v); }
  return true;
}
export function stopSfx(key) { const v=loops.get(key); if(v){v.stop();voices.delete(v);loops.delete(key);} }
export function stopAllGS() { for(const v of voices)v.stop();voices.clear();loops.clear(); }
function playSample(name,url,options) {
  const b=ready.get(url); if(!b)return false;
  const source=ctx.createBufferSource(), g=ctx.createGain();source.buffer=b;
  source.playbackRate.value=(options.pitch??1)*(1+(Math.random()*2-1)*.04);
  source.loop=!!options.loop;g.gain.value=(options.volume??1)*.71*(.96+Math.random()*.08)*(source.loop?.12:1);
  source.connect(g);g.connect(master);
  const v={g,loop:source.loop,until:source.loop?Infinity:ctx.currentTime+b.duration/source.playbackRate.value,
    stop(){try{source.stop();}catch{} source.disconnect();g.disconnect();}};
  voices.add(v);if(options.key)loops.set(options.key,v);
  source.onended=()=>{voices.delete(v);if(options.key&&loops.get(options.key)===v)loops.delete(options.key);source.disconnect();g.disconnect();};source.start();return true;
}
export function sfx(name, options = {}) {
  if (!GS_SAMPLES[name]) { synth(name,options); return 'synth'; }
  if (!ctx || muted || (options.volume??1)<=0) return 'inactive';
  if(options.loop && options.key && loops.has(options.key)){loops.get(options.key).g.gain.value=(options.volume??1)*.71*.12;return 'looping';}
  if (!admit())return 'limited';
  const url=choose(name,options);void request(url);
  if(playSample(name,url,options))return 'sample';
  const nodes=[];capture=nodes;
  synth(fallback[name],{...options,pitch:(options.pitch??1)*(1+(Math.random()*2-1)*.04),volume:(options.volume??1)*.71*(options.loop?.12:1)});
  capture=null;
  const v={loop:false,until:ctx.currentTime+(options.loop?.2:1.05),stop(){for(const n of nodes){try{n.stop();}catch{} n.disconnect();}}};voices.add(v);
  // A bounded synthesized pulse until loaded; caller refreshes only while charging.
  return 'fallback';
}
