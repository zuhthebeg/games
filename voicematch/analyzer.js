/* 보이스 노래방 — 분석 워커: ECAPA int8 ONNX (WASM) + 60팀 코사인 랭킹 */
importScripts('https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/ort.min.js');
ort.env.wasm.numThreads = 1; // GitHub Pages: COOP/COEP 불가 → 싱글스레드
ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/';

let session = null, singers = null, lang = 'ko';

const WIN = 3 * 16000;
// 절대 하한. 에어컨·팬 소리가 이 위로 올라오는 경우가 있어 이것만으로는 부족하다(2026-08-03 제보).
const RMS_TH = 0.012;
// 소음 바닥 대비 배수. 목소리는 바닥보다 확실히 튀지만, 정상소음은 계속 같은 크기로 깔린다.
// 2.0 → 1.5 (2026-08-12): 마이크 입력이 작은 기기에서 쉼 없이 부르면 바닥≈목소리가 돼
// 게이트가 목소리 위로 올라가는 제보(레딧). 노래는 창 간 1.5배 정도는 자연히 출렁인다.
const NOISE_RATIO = 1.5;
// 바닥 자체가 이보다 크면 "계속 노래한 녹음"으로 보고 배수 조건을 걸지 않는다
// (쉼 없이 부르면 바닥=목소리라 배수 조건에 자기 목소리가 걸린다).
// 0.03 → 0.02 (2026-08-12): 같은 제보 대응. 에어컨류 소음 바닥은 실측 0.012~0.02 아래라 유지.
const LOUD_FLOOR = 0.02;

function rms(a, s, e) { let q = 0; for (let i = s; i < e; i++) q += a[i] * a[i]; return Math.sqrt(q / (e - s)); }
function percentile(arr, p) { const b = [...arr].sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(b.length * p))]; }
function l2norm(v) { let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n) || 1; return v.map(x => x / n); }

/* ---- 보이스 리포트 START (순수 JS DSP, 임베딩 루프와 완전 독립) ----
 * 결과 화면의 "장점 카드"용 실측 지표. 음성은 여기서도 저장·전송하지 않는다.
 * 이 블록은 /tmp 단위 검증 스크립트가 START~END 사이만 잘라 실행하므로 외부 의존을 두지 말 것
 * (percentile만 위에서 쓰는데, 아래에 rpPct로 따로 둔다).
 */
const RP_FRAME = 640;      // 40ms @16k
const RP_HOP = 160;        // 10ms @16k → 100fps
const RP_MINLAG = 32;      // 16000/500Hz — 탐색 상한 500Hz
const RP_MAXLAG = 320;     // 16000/50Hz  — 탐색 하한 50Hz
const RP_CLARITY = 0.6;    // ACF peak/r0. 이 아래는 무성음·잡음으로 본다
const RP_MIN_VOICED = 30;  // 유성 0.3초 미만이면 리포트 자체를 만들지 않는다
const RP_RUN_STAB = 30;    // 안정성 측정용 연속 유성 구간 최소 길이(300ms)
const RP_RUN_VIB = 60;     // 비브라토 측정용 최소 길이(600ms)
const RP_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function rpPct(arr, p) { const b = [...arr].sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(b.length * p))]; }
function rpMedian(arr) { return rpPct(arr, 0.5); }
function rpClamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
// 0~100 선형 정규화. lo/hi는 아래 지표별 주석에 근거를 남긴다.
function rpScale(v, lo, hi) { return Math.round(rpClamp(100 * (v - lo) / (hi - lo), 0, 100)); }
function rpNote(f) {
  const m = Math.round(69 + 12 * Math.log2(f / 440));
  return RP_NOTES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
}

// 반복 radix-2 FFT (in-place). 스펙트럴 센트로이드용이라 512점이면 충분.
function rpFft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { const tr = re[i]; re[i] = re[j]; re[j] = tr; const ti = im[i]; im[i] = im[j]; im[j] = ti; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

// 프레임 하나의 F0(Hz)와 명료도. 자기상관 + 포물선 보간(정수 lag만 쓰면 고음에서 오차가 크다).
function rpPitch(buf) {
  let r0 = 0;
  for (let i = 0; i < buf.length; i++) r0 += buf[i] * buf[i];
  if (r0 <= 0) return null;
  let best = -1, bestLag = -1;
  const prev = new Float64Array(RP_MAXLAG + 2);
  for (let lag = RP_MINLAG; lag <= RP_MAXLAG && lag < buf.length; lag++) {
    let s = 0;
    for (let i = 0; i + lag < buf.length; i++) s += buf[i] * buf[i + lag];
    prev[lag] = s;
    if (s > best) { best = s; bestLag = lag; }
  }
  if (bestLag < 0) return null;
  const clarity = best / r0;
  let lag = bestLag;
  if (bestLag > RP_MINLAG && bestLag < RP_MAXLAG) {
    const a = prev[bestLag - 1], b = prev[bestLag], c = prev[bestLag + 1];
    const den = a - 2 * b + c;
    if (den !== 0) lag = bestLag + rpClamp(0.5 * (a - c) / den, -0.5, 0.5);
  }
  return { f0: 16000 / lag, clarity };
}

// 지속 구간(연속 유성 프레임) 목록. [start, end) 인덱스 쌍.
function rpRuns(voiced, minLen) {
  const runs = []; let s = -1;
  for (let i = 0; i <= voiced.length; i++) {
    const v = i < voiced.length && voiced[i];
    if (v && s < 0) s = i;
    else if (!v && s >= 0) { if (i - s >= minLen) runs.push([s, i]); s = -1; }
  }
  return runs;
}

// 프레임 단위 유성 판정. 리포트와 무음 게이트가 같은 결과를 공유한다(두 번 계산하지 않는다).
function rpFrames(pcm16k) {
  const n = pcm16k.length;
  if (n < RP_FRAME * 2) return null;
  const nf = Math.floor((n - RP_FRAME) / RP_HOP) + 1;
  const rmsArr = new Float64Array(nf);
  for (let k = 0; k < nf; k++) {
    const s = k * RP_HOP; let q = 0;
    for (let i = s; i < s + RP_FRAME; i++) q += pcm16k[i] * pcm16k[i];
    rmsArr[k] = Math.sqrt(q / RP_FRAME);
  }
  // 유성 판정 기준선. 기본은 게이트와 같은 절대 하한(RMS_TH)이지만, 마이크가 작아 전체가
  // 조용한 녹음에서 리포트만 통째로 사라지는 걸 막으려고 상위 레벨의 30%까지는 내려준다.
  // (무음 게이트 자체는 건드리지 않는다 — 여기서 읽기만 함)
  const hot = rpPct(Array.from(rmsArr), 0.9);
  const vth = Math.min(RMS_TH, Math.max(hot * 0.3, 1e-4));

  const voiced = new Array(nf).fill(false);
  const f0 = new Float64Array(nf);
  const win = new Float64Array(RP_FRAME);
  for (let k = 0; k < nf; k++) {
    if (rmsArr[k] < vth) continue;
    const s = k * RP_HOP;
    let mean = 0;
    for (let i = 0; i < RP_FRAME; i++) mean += pcm16k[s + i];
    mean /= RP_FRAME;
    for (let i = 0; i < RP_FRAME; i++) win[i] = pcm16k[s + i] - mean;  // DC 제거
    const p = rpPitch(win);
    if (!p || p.clarity < RP_CLARITY || p.f0 < 50 || p.f0 > 500) continue;
    voiced[k] = true; f0[k] = p.f0;
  }
  const vIdx = [];
  for (let k = 0; k < nf; k++) if (voiced[k]) vIdx.push(k);
  return { nf, rmsArr, voiced, f0, vIdx };
}

// 사람 목소리가 실제로 들어왔는지 판정. 에너지만 보면 선풍기·에어컨이 통과한다(2026-08-16 제보 2건:
// 노래를 안 했는데 94%, 선풍기 바람소리만 녹음됐는데 96%가 나왔다).
// 판정 기준은 "지속되는 음정" — 목소리는 음높이가 잡히는 프레임이 이어지고, 정상소음은 안 이어진다.
// 실측(12초 샘플): 실제 목소리 ratio 0.50~0.57 / 150ms 연속구간 10~26개,
//                 선풍기 0.14 / 0개, 에어컨 0.01 / 0개, 룸톤·무음 0 / 0개.
// 한 음을 길게 끄는 허밍은 연속구간이 1개뿐이라 ratio 조건으로 따로 살린다.
const VG_RUN_MS = 15;        // 150ms 연속 유성
const VG_MIN_RUNS = 2;
const VG_MIN_RATIO = 0.30;   // 목소리 0.50+ vs 최악 소음 0.175 사이
const VG_MIN_VOICED = 60;    // 0.6초
function hasVoice(fr) {
  if (!fr || !fr.nf) return false;
  if (rpRuns(fr.voiced, VG_RUN_MS).length >= VG_MIN_RUNS) return true;
  return fr.vIdx.length >= VG_MIN_VOICED && fr.vIdx.length / fr.nf >= VG_MIN_RATIO;
}

function extractReport(pcm16k, fr) {
  const n = pcm16k.length;
  fr = fr || rpFrames(pcm16k);
  if (!fr) return null;
  const { nf, rmsArr, voiced, f0, vIdx } = fr;
  if (vIdx.length < RP_MIN_VOICED) return null;

  const vf0 = vIdx.map(k => f0[k]);
  const vrms = vIdx.map(k => rmsArr[k]);
  const metrics = {};

  // 1) 음역대 — F0 5~95퍼센타일의 세미톤 스팬. 아마추어 한 소절 기준 5세미톤=0, 24세미톤(2옥타브)=100.
  const lo = rpPct(vf0, 0.05), hi = rpPct(vf0, 0.95);
  const span = 12 * Math.log2(hi / lo);
  metrics.range = { score: rpScale(span, 5, 24), val: rpNote(lo) + '–' + rpNote(hi), semitones: Math.round(span * 10) / 10 };

  // 2) 피치 안정성 — cents 중앙절대편차(MAD).
  //    구간 전체로 재면 "멜로디 폭"을 재게 된다(음이 바뀌는 게 불안정으로 잡힘). 실제로 사인 스윕이
  //    MAD 600cents로 나왔다. 그래서 지속 구간 안에서 300ms 창을 100ms씩 밀며 창별 MAD를 구하고
  //    그 중앙값을 쓴다 — "한 음을 잡고 있을 때 얼마나 흔들리나"에 가깝다.
  //    MAD 60cents(반음 반쯤 흔들림)=0, 12cents(사람이 "정확하다"고 느끼는 수준)=100.
  const stabRuns = rpRuns(voiced, RP_RUN_STAB);
  const mads = [];
  for (const [a, b] of stabRuns) {
    for (let w = a; w + RP_RUN_STAB <= b; w += 10) {
      const seg = []; for (let k = w; k < w + RP_RUN_STAB; k++) seg.push(f0[k]);
      const med = rpMedian(seg);
      mads.push(rpMedian(seg.map(f => Math.abs(1200 * Math.log2(f / med)))));
    }
  }
  if (mads.length) {
    const mad = rpMedian(mads);
    metrics.stability = { score: rpScale(60 - mad, 0, 48), val: Math.round(mad) + ' cents' };
  }

  // 3) 음색 밝기 — 유성 프레임 스펙트럴 센트로이드 평균(FFT 512, Hann).
  //    400Hz(어둡고 두꺼움)=0, 2200Hz(밝고 트인 톤)=100. 성인 가창 실측 대역.
  {
    const N = 512, re = new Float64Array(N), im = new Float64Array(N);
    const hann = new Float64Array(N);
    for (let i = 0; i < N; i++) hann[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
    let csum = 0, ccnt = 0;
    for (const k of vIdx) {
      const s = k * RP_HOP;
      for (let i = 0; i < N; i++) { re[i] = pcm16k[s + i] * hann[i]; im[i] = 0; }
      rpFft(re, im);
      let num = 0, den = 0;
      for (let b = 1; b < N / 2; b++) {
        const m = Math.sqrt(re[b] * re[b] + im[b] * im[b]);
        num += m * (b * 16000 / N); den += m;
      }
      if (den > 0) { csum += num / den; ccnt++; }
    }
    if (ccnt) {
      const cen = csum / ccnt;
      metrics.brightness = { score: rpScale(cen, 400, 2200), val: Math.round(cen) + ' Hz' };
    }
  }

  // 4) 다이내믹스 — 유성 프레임 RMS의 10↔90퍼센타일 차이(dB). 4dB(평평)=0, 18dB(강약 뚜렷)=100.
  {
    const p10 = Math.max(rpPct(vrms, 0.1), 1e-6), p90 = Math.max(rpPct(vrms, 0.9), 1e-6);
    const db = 20 * Math.log10(p90 / p10);
    metrics.dynamics = { score: rpScale(db, 4, 18), val: Math.round(db) + ' dB' };
  }

  // 5) 비브라토 — 600ms 이상 구간에서 detrend한 F0에 4~8Hz 주기 변조가 있으면 감지.
  //    감지 안 되면 후보에서 빼기만 한다(부정 표현 금지).
  //    희소성 있는 매력이라 감지되면 점수를 높게 줘서 카드에 먼저 편입한다.
  {
    const vibRuns = rpRuns(voiced, RP_RUN_VIB);
    let bestVib = null;
    for (const [a, b] of vibRuns) {
      const seg = []; for (let k = a; k < b; k++) seg.push(f0[k]);
      const med = rpMedian(seg);
      const cents = seg.map(f => 1200 * Math.log2(f / med));
      // detrend: 210ms 이동평균 제거 (프레이즈 상승/하강을 비브라토로 오인하지 않게)
      const W = 21, half = 10, d = new Array(cents.length);
      for (let i = 0; i < cents.length; i++) {
        let s2 = 0, c2 = 0;
        for (let j = Math.max(0, i - half); j <= Math.min(cents.length - 1, i + half); j++) { s2 += cents[j]; c2++; }
        d[i] = cents[i] - s2 / c2;
      }
      let e0 = 0; for (const x of d) e0 += x * x;
      const amp = Math.sqrt(e0 / d.length);
      if (e0 <= 0 || amp < 15 || amp > 200) continue;  // 15cents 미만은 잡음, 200cents 초과는 멜로디 도약
      let best = 0, bestLag = 0;
      for (let lag = 12; lag <= 25; lag++) {          // 100fps 기준 8Hz~4Hz
        if (lag >= d.length) break;
        let s3 = 0; for (let i = 0; i + lag < d.length; i++) s3 += d[i] * d[i + lag];
        const c3 = s3 / e0;
        if (c3 > best) { best = c3; bestLag = lag; }
      }
      if (best >= 0.35 && bestLag) {
        const cand = { rate: 100 / bestLag, amp, corr: best };
        if (!bestVib || cand.corr > bestVib.corr) bestVib = cand;
      }
    }
    if (bestVib) {
      metrics.vibrato = {
        score: Math.round(rpClamp(78 + (bestVib.amp - 15) / 4, 78, 100)),
        val: (Math.round(bestVib.rate * 10) / 10) + ' Hz',
      };
    }
  }

  // 상위 3개만 카드로. 12점 미만은 "장점"이라 부르기 민망하니 후보에서 뺀다.
  const cards = Object.keys(metrics).map(k => ({ key: k, ...metrics[k] }))
    .filter(c => c.score >= 12).sort((a, b) => b.score - a.score).slice(0, 3);
  if (cards.length < 2) return null;
  return { cards, voiced: vIdx.length, dur: Math.round(n / 16000) };
}
/* ---- 보이스 리포트 END ---- */

async function embedWindow(pcm) {
  const t = new ort.Tensor('float32', pcm, [1, pcm.length]);
  const out = await session.run({ wav: t });
  return l2norm(Array.from(out.emb.data));
}

// 여러 번 부른 녹음을 누적한다. 10초 한 번은 3초 창 3개 평균이라 임베딩이 흔들린다.
// 실측(가수 5명 홀드아웃 곡, 본인이 1위로 나오는 비율):
//   10초 1회 51% / 20초 1회 61% / 30초 1회 65% / 10초 2회 평균 73% / 10초 3회 평균 82%.
// 같은 총 녹음량이면 **이어 부르는 것보다 나눠 부르는 쪽이 확실히 낫다**(20초: 61%→73%,
// 30초: 65%→82%). 떨어진 구간이 서로 다른 음역·발성을 담아 가수 특성을 넓게 덮기 때문이다.
let takes = [];

async function analyze(pcm16k, append) {
  // 0) 사람 목소리가 들어있는지부터 본다. 세기만으로는 선풍기·에어컨이 통과한다.
  //    ONNX 추론보다 훨씬 싸므로(12초에 ~120ms) 임베딩 전에 걸러서 헛계산도 같이 줄인다.
  const fr = rpFrames(pcm16k);
  if (!hasVoice(fr)) return { error: 'silent' };

  // 창별 세기를 먼저 다 재고, 그 분포에서 소음 바닥을 잡는다.
  // 에어컨처럼 일정한 소리는 모든 창이 비슷해서 바닥≈신호가 되고, 아래 조건에서 전부 걸러진다.
  const wins = [];
  for (let i = 0; i + WIN <= pcm16k.length; i += WIN) wins.push({ i, r: rms(pcm16k, i, i + WIN) });
  if (!wins.length) wins.push({ i: 0, r: rms(pcm16k, 0, pcm16k.length) });

  const floor = percentile(wins.map(w => w.r), 0.2);
  const gate = floor < LOUD_FLOOR ? Math.max(RMS_TH, floor * NOISE_RATIO) : RMS_TH;

  const embs = [];
  for (const w of wins) {
    if (w.r < gate) continue;
    embs.push(await embedWindow(pcm16k.slice(w.i, Math.min(w.i + WIN, pcm16k.length))));
    postMessage({ type: 'progress', done: embs.length });
  }
  // 구제 패스(2026-08-12): 적응 게이트가 전 구간을 걸렀어도, 절대 하한을 넘고
  // 바닥보다 확실히 튀는(×1.3) 창이 있으면 소리 큰 순으로 최대 3개는 살린다.
  // 에어컨류 정상소음은 모든 창이 바닥과 비슷해서(×1.05 이내) 여기서도 걸러진다.
  if (!embs.length) {
    const cands = wins.filter(w => w.r >= RMS_TH && w.r >= floor * 1.3)
      .sort((a, b) => b.r - a.r).slice(0, 3);
    for (const w of cands) {
      embs.push(await embedWindow(pcm16k.slice(w.i, Math.min(w.i + WIN, pcm16k.length))));
      postMessage({ type: 'progress', done: embs.length });
    }
  }
  // 여기까지 왔다면 위에서 목소리는 이미 확인됐다. 그런데도 세기 게이트가 전 구간을 걸렀다면
  // 마이크 입력이 작은 기기다(실측: 같은 목소리를 0.08배로 줄이면 통과 창 3/3 → 0/3).
  // 예전엔 이 경우 결과가 통째로 안 나왔다. 목소리가 확인된 이상 큰 창부터 살려 쓴다.
  if (!embs.length) {
    const cands = wins.slice().sort((a, b) => b.r - a.r).slice(0, 3);
    for (const w of cands) {
      embs.push(await embedWindow(pcm16k.slice(w.i, Math.min(w.i + WIN, pcm16k.length))));
      postMessage({ type: 'progress', done: embs.length });
    }
  }
  if (!embs.length) return { error: 'silent' };
  const d = embs[0].length, mean = new Array(d).fill(0);
  for (const e of embs) for (let i = 0; i < d; i++) mean[i] += e[i] / embs.length;

  // 이번 테이크의 쿼리 벡터. append면 이전 테이크들과 평균낸 걸로 랭킹한다.
  if (!append) takes = [];
  takes.push(l2norm(mean));
  const acc = new Array(d).fill(0);
  for (const tk of takes) for (let i = 0; i < d; i++) acc[i] += tk[i] / takes.length;
  const q = l2norm(acc);

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
  // J-POP 풀: singers.json의 jp 플래그(수동 관리, merge_final PRESERVE). 비면 null — UI가 토글에서 숨긴다
  const rankJp = topRank(scored.filter(s => s.jp));

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
  // 보이스 리포트는 부가 정보다. 여기서 터져도 매칭 결과는 그대로 나가야 한다.
  let report = null;
  try { report = extractReport(pcm16k, fr); } catch (e) { report = null; }

  // 듀엣 궁합용: 최종 쿼리 벡터(q)와 음역(F0 5~95퍼센타일, Hz).
  // 음역은 이번 테이크의 것만 쓴다(누적 평균은 임베딩만) — 초대장 한 장에 담기엔 충분하다.
  let pitch = null;
  try {
    if (fr && fr.vIdx.length >= RP_MIN_VOICED) {
      const vf0 = fr.vIdx.map(k => fr.f0[k]);
      pitch = { lo: Math.round(rpPct(vf0, 0.05)), hi: Math.round(rpPct(vf0, 0.95)) };
    }
  } catch (e) { pitch = null; }

  return { rank: rankKr, rankAll, rankJp, genres, report, takes: takes.length, q, pitch };
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
      const r = await analyze(m.pcm, !!m.append);
      postMessage({ type: 'result', ...r });
    } else if (m.type === 'resetTakes') {
      takes = [];
    }
  } catch (e) {
    postMessage({ type: 'error', message: String(e && e.message || e) });
  }
};
