/* 보이스 노래방 — 분석 워커: ECAPA int8 ONNX (WASM) + 60팀 코사인 랭킹 */
importScripts('https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/ort.min.js');
ort.env.wasm.numThreads = 1; // GitHub Pages: COOP/COEP 불가 → 싱글스레드
ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/';

let session = null, singers = null;

const WIN = 3 * 16000, RMS_TH = 0.008;

function rms(a, s, e) { let q = 0; for (let i = s; i < e; i++) q += a[i] * a[i]; return Math.sqrt(q / (e - s)); }
function l2norm(v) { let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n) || 1; return v.map(x => x / n); }

async function embedWindow(pcm) {
  const t = new ort.Tensor('float32', pcm, [1, pcm.length]);
  const out = await session.run({ wav: t });
  return l2norm(Array.from(out.emb.data));
}

async function analyze(pcm16k) {
  const embs = [];
  for (let i = 0; i + WIN <= pcm16k.length; i += WIN) {
    if (rms(pcm16k, i, i + WIN) < RMS_TH) continue;
    embs.push(await embedWindow(pcm16k.slice(i, i + WIN)));
    postMessage({ type: 'progress', done: embs.length });
  }
  if (!embs.length) {
    if (rms(pcm16k, 0, pcm16k.length) < 0.003) return { error: 'silent' };
    embs.push(await embedWindow(pcm16k.slice(0, Math.min(pcm16k.length, WIN * 2))));
  }
  const d = embs[0].length, mean = new Array(d).fill(0);
  for (const e of embs) for (let i = 0; i < d; i++) mean[i] += e[i] / embs.length;
  const q = l2norm(mean);

  const scored = singers.map(s => {
    let c = 0; for (let i = 0; i < d; i++) c += q[i] * s.emb[i];
    return { ...s, cos: c };
  });
  const cs = scored.map(s => s.cos);
  const mu = cs.reduce((a, b) => a + b) / cs.length;
  const sd = Math.sqrt(cs.reduce((a, b) => a + (b - mu) ** 2, 0) / cs.length) || 1;
  scored.forEach(s => { s.pct = Math.max(5, Math.min(99, Math.round(100 * (0.55 + 0.45 * Math.tanh((s.cos - mu) / (2 * sd)))))); });
  scored.sort((a, b) => b.cos - a.cos);
  for (let i = 1; i < scored.length; i++)
    scored[i].pct = Math.max(5, Math.min(scored[i].pct, scored[i - 1].pct - 2));
  return { rank: scored.slice(0, 8).map(({ emb, ...r }) => r) };
}

onmessage = async (ev) => {
  const m = ev.data;
  try {
    if (m.type === 'init') {
      singers = m.singers;
      session = await ort.InferenceSession.create(m.model, { executionProviders: ['wasm'] });
      postMessage({ type: 'ready' });
    } else if (m.type === 'analyze') {
      const r = await analyze(m.pcm);
      postMessage({ type: 'result', ...r });
    }
  } catch (e) {
    postMessage({ type: 'error', message: String(e && e.message || e) });
  }
};
