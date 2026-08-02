/* 보이스 노래방 — 분석 워커: ECAPA int8 ONNX (WASM) + 60팀 코사인 랭킹 */
importScripts('https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/ort.min.js');
ort.env.wasm.numThreads = 1; // GitHub Pages: COOP/COEP 불가 → 싱글스레드
ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/';

let session = null, singers = null, lang = 'ko';

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

  // hub 보정: 갤러리 중심에 있는 가수(모든 쿼리와 비슷하게 나오는 허브)의 쏠림 제거.
  // hub = 자기 제외 평균 코사인(센터링, 오프라인 계산). alpha=0.45는 보컬 20트랙 검증값
  // (self-top1 19/20 유지, 허브 top3 독식 4→0, 역쏠림 없음).
  const HUB_ALPHA = 0.45;
  const scored = singers.map(s => {
    let c = 0; for (let i = 0; i < d; i++) c += q[i] * s.emb[i];
    return { ...s, cos: c - HUB_ALPHA * (s.hub || 0) };
  });
  // 풀별 랭킹: 기본 K-pop·가요(intl 제외), 옵션 전체. pct 상대 스케일도 풀 안에서 계산
  // non-ko 로케일 K-pop 풀은 gk(해외에서도 알려진 아이돌/그룹)만 포함 — 국내 전용
  // 트로트·발라드·인디밴드·뮤지컬 등은 제외해야 "모르는 가수만 나온다"는 이탈을 막음
  function topRank(pool) {
    // 풀이 비면 reduce가 "Reduce of empty array"로 터진다.
    // gk 플래그가 날아갔을 때 실제로 비한국어 화면이 전부 죽었다(2026-08-03).
    if (!pool || !pool.length) return null;
    const cs = pool.map(s => s.cos);
    const mu = cs.reduce((a, b) => a + b) / cs.length;
    const sd = Math.sqrt(cs.reduce((a, b) => a + (b - mu) ** 2, 0) / cs.length) || 1;
    const arr = pool.map(s => ({ ...s, pct: Math.max(5, Math.min(99, Math.round(100 * (0.55 + 0.45 * Math.tanh((s.cos - mu) / (2 * sd)))))) }))
      .sort((a, b) => b.cos - a.cos);
    for (let i = 1; i < arr.length; i++)
      arr[i].pct = Math.max(5, Math.min(arr[i].pct, arr[i - 1].pct - 2));
    return arr.slice(0, 8).map(({ emb, ...r }) => r);
  }
  const rankAll = topRank(scored);
  // 로케일 필터로 풀이 비면 전체 풀로 폴백한다 — 화면이 죽는 것보다 낫다
  const rankKr = topRank(scored.filter(s => !s.intl && (lang === 'ko' || s.gk)))
    || topRank(scored.filter(s => !s.intl)) || rankAll;

  // 장르 축: 매크로 장르별 top-5 평균 cos → 상대 스케일. 순서 중요(록발라드→rock, R&B·발라드→rnb, 힙합R&B→hiphop)
  const AXES = [
    ['trot', /트로트|국악/], ['jazz', /재즈|스탠더드/], ['hiphop', /힙합/],
    ['rnb', /R&B|소울/], ['rock', /록|그런지|펑크|밴드/], ['dance', /댄스|케이팝/],
    ['indie', /인디|포크|컨트리|어쿠스틱/], ['ballad', /발라드|뮤지컬/],
  ];
  const groups = {};
  scored.sort((a, b) => b.cos - a.cos);
  scored.forEach(s => {
    const g = s.genre || '';
    let k = 'pop';
    for (const [key, re] of AXES) if (re.test(g)) { k = key; break; }
    (groups[k] = groups[k] || []).push(s.cos);
  });
  const gs = [];
  for (const k in groups) {
    const arr = groups[k].sort((a, b) => b - a);
    if (arr.length < 4) continue;
    const top = arr.slice(0, 5);
    gs.push({ key: k, raw: top.reduce((a, b) => a + b) / top.length });
  }
  let genres = [];
  if (gs.length >= 3) {
    const lo = Math.min(...gs.map(g => g.raw)), hi = Math.max(...gs.map(g => g.raw));
    gs.forEach(g => { g.pct = hi > lo ? Math.round(20 + 80 * (g.raw - lo) / (hi - lo)) : 60; });
    gs.sort((a, b) => b.raw - a.raw);
    genres = gs.map(({ raw, ...g }) => g);
  }
  return { rank: rankKr, rankAll, genres };
}

onmessage = async (ev) => {
  const m = ev.data;
  try {
    if (m.type === 'init') {
      singers = m.singers;
      lang = m.lang || 'ko';
      session = await ort.InferenceSession.create(m.model, { executionProviders: ['wasm'] });
      postMessage({ type: 'ready' });
    } else if (m.type === 'lang') {
      lang = m.lang || 'ko';
    } else if (m.type === 'analyze') {
      const r = await analyze(m.pcm);
      postMessage({ type: 'result', ...r });
    }
  } catch (e) {
    postMessage({ type: 'error', message: String(e && e.message || e) });
  }
};
