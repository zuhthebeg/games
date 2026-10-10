import { makeAssets, makeScene, updateScene, VERSION, SEED, WORLD } from './scene.js';
const $ = id => document.getElementById(id);
const quick = new URLSearchParams(location.search).get('quick') === '1';
const durationMs = quick ? 5000 : 30000, warmupMs = 3000;
const results = [], failures = [];
let busy = false, controller = null, importedA = false, sequenceId = 0;
const round = n => Math.round(n * 100) / 100;
export function stats(samples) {
  if (!samples.length) throw new Error('측정 프레임이 없음');
  const sorted = samples.slice().sort((a, b) => a - b), sum = samples.reduce((a, b) => a + b, 0);
  const percentile = p => sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
  return { averageFps: round(samples.length * 1000 / sum), frames: samples.length,
    measuredElapsedMs: round(sum), frameMs: { p50: round(percentile(.5)), p95: round(percentile(.95)), p99: round(percentile(.99)) },
    over16_7Pct: round(samples.filter(x => x > 16.7).length / samples.length * 100),
    over33_3Pct: round(samples.filter(x => x > 33.3).length / samples.length * 100) };
}
function heap() {
  const m = performance.memory;
  return m ? { usedJSHeapSize: m.usedJSHeapSize, totalJSHeapSize: m.totalJSHeapSize, jsHeapSizeLimit: m.jsHeapSizeLimit } : null;
}
function device() {
  return { ua: navigator.userAgent, platform: navigator.platform, language: navigator.language,
    dpr: devicePixelRatio, screen: { width: screen.width, height: screen.height, availWidth: screen.availWidth, availHeight: screen.availHeight },
    viewport: { width: innerWidth, height: innerHeight }, cores: navigator.hardwareConcurrency ?? null,
    deviceMemoryGiB: navigator.deviceMemory ?? null, webviewHint: /; wv\)|\bwv\b|KAKAOTALK|Instagram|FBAN|FBAV/i.test(navigator.userAgent),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
}
function summary(r) {
  return `${r.variant} · ×${r.multiplier} · ${r.renderer} · ${r.averageFps}fps\np50/p95/p99 ${r.frameMs.p50}/${r.frameMs.p95}/${r.frameMs.p99}ms · >16.7ms ${r.over16_7Pct}% / >33.3ms ${r.over33_3Pct}%\n초기화 ${r.loadInitMs}ms (${r.moduleCache}) · 팔레트 추가 ${(r.memory.extraPaletteRgbaBytes / 1048576).toFixed(2)}MiB · JS heap ${r.heapEnd ? (r.heapEnd.usedJSHeapSize / 1048576).toFixed(1) + 'MiB (탭 전체)' : '미지원'}`;
}
function exportText() {
  const human = results.map(summary).join('\n\n') || '완료 결과 없음';
  const drift = [];
  for (const id of new Set(results.map(r => r.sequenceId))) {
    const group = results.filter(r => r.sequenceId === id);
    if (group.length === 3 && group.map(r => r.variant).join('') === 'BAB') drift.push({ sequenceId: id,
      bP95ChangePct: round((group[2].frameMs.p95 / group[0].frameMs.p95 - 1) * 100),
      bFpsChangePct: round((group[2].averageFps / group[0].averageFps - 1) * 100) });
  }
  const driftText = drift.map(d => `발열 드리프트 참고: B p95 ${d.bP95ChangePct}% / fps ${d.bFpsChangePct}% 변화`).join('\n');
  return `${human}${driftText ? '\n\n' + driftText : ''}\n\n${JSON.stringify({ version: VERSION, seed: SEED, note: $('note').value, quick, durations: { durationMs, warmupMs }, results, failures, drift })}`;
}
function refresh() {
  $('results').textContent = results.map(summary).join('\n\n') || '결과 없음';
  $('export').value = exportText();
}
function checkView(view) {
  if (document.hidden) throw new Error('탭이 숨겨져 측정 무효');
  if (innerWidth !== view.width || innerHeight !== view.height || Math.min(devicePixelRatio, 2) !== view.dpr) throw new Error('화면 크기/DPR 변경: 측정 무효. 회전·주소창·키보드 상태를 고정하고 재실행');
}
function frames(renderer, scene, view, phase, signal) {
  return new Promise((resolve, reject) => {
    const limit = phase === 'warmup' ? warmupMs : durationMs, samples = [];
    let start = null, last = null, raf = 0, liveAt = 0, liveSum = 0, liveCount = 0;
    const cleanup = () => { cancelAnimationFrame(raf); signal.removeEventListener('abort', abort); document.removeEventListener('visibilitychange', visibility); };
    const fail = error => { cleanup(); reject(error); };
    const abort = () => fail(new Error('사용자 중지: 불완전 측정 제외'));
    const visibility = () => { if (document.hidden) fail(new Error('탭 숨김: 불완전 측정 제외')); };
    signal.addEventListener('abort', abort, { once: true }); document.addEventListener('visibilitychange', visibility);
    const tick = timestamp => {
      try {
        if (signal.aborted) return abort();
        checkView(view);
        if (start === null) { start = timestamp; liveAt = timestamp; }
        const elapsed = timestamp - start;
        if (last !== null) {
          const delta = timestamp - last;
          if (phase === 'measure') samples.push(delta);
          liveSum += delta; liveCount++;
        }
        // Last sample closes the interval following the previous render.
        if (elapsed >= limit) { cleanup(); resolve(samples); return; }
        updateScene(scene, elapsed / 1000, view.width, view.height); renderer.render();
        if (timestamp - liveAt >= 500) {
          $('status').textContent = `${renderer.variant} · ${phase === 'warmup' ? '예열' : '측정'} ${Math.ceil((limit - elapsed) / 1000)}초 · ${(liveCount * 1000 / liveSum).toFixed(1)} fps`;
          liveAt = timestamp; liveSum = liveCount = 0;
        }
        last = timestamp; raf = requestAnimationFrame(tick);
      } catch (error) { fail(error); }
    };
    raf = requestAnimationFrame(tick);
  });
}
async function runOne(variant, multiplier, sequence, order, signal) {
  const view = { width: innerWidth, height: innerHeight, dpr: Math.min(devicePixelRatio, 2) };
  checkView(view);
  const capturedDevice = device(), heapBefore = heap(), start = performance.now();
  let assets, renderer;
  const moduleCache = variant === 'A' ? (importedA ? 'A module cached' : 'first A import (HTTP cache may apply)') : 'B import (HTTP/module cache may apply)';
  try {
    $('status').textContent = `${variant} · 로딩 / 초기화`;
    const moduleStart = performance.now();
    const module = await import(variant === 'A' ? './a-pixi.js' : './b-canvas.js');
    const moduleLoadMs = performance.now() - moduleStart;
    if (variant === 'A') importedA = true;
    assets = makeAssets(); const scene = makeScene(multiplier);
    renderer = await module.createRenderer($('stage'), assets, scene, view); renderer.variant = variant;
    checkView(view); updateScene(scene, 0, view.width, view.height); renderer.render();
    const loadInitMs = performance.now() - start, heapAfterInit = heap();
    await frames(renderer, scene, view, 'warmup', signal);
    const samples = await frames(renderer, scene, view, 'measure', signal);
    const result = { variant, sequenceId: sequence, sequenceOrder: order, multiplier, date: new Date().toISOString(),
      seed: SEED, world: WORLD, view, device: capturedDevice, durationMs, warmupMs,
      counts: { players: 4 * multiplier, monsters: 20 * multiplier, particles: 200 * multiplier, damageNumbers: 30 * multiplier, telegraphs: 3 * multiplier },
      loadInitMs: round(loadInitMs), moduleLoadMs: round(moduleLoadMs), moduleCache,
      heapBefore, heapAfterInit, heapEnd: heap(), ...renderer.info, ...stats(samples) };
    results.push(result); refresh(); return result;
  } finally { try { renderer?.destroy(); } finally { assets?.destroy(); $('stage').replaceChildren(); } }
}
async function runSequence(variants) {
  if (busy) throw new Error('이미 측정 중');
  if (!variants.length || variants.some(v => !['A', 'B'].includes(v))) throw new Error('Invalid variants');
  busy = true; controller = new AbortController(); document.body.classList.add('running');
  document.querySelectorAll('[data-run], #stress, #clear, #copy, #note').forEach(el => { el.disabled = true; }); $('stop').disabled = false;
  const sequence = ++sequenceId, multiplier = $('stress').checked ? 2 : 1, completed = [];
  let failed = false;
  try {
    for (const [order, variant] of variants.entries()) {
      if (controller.signal.aborted) break;
      try { completed.push(await runOne(variant, multiplier, sequence, order, controller.signal)); }
      catch (error) {
        failed = true; failures.push({ variant, sequenceId: sequence, error: String(error.stack || error), date: new Date().toISOString() }); refresh();
        $('status').textContent = `${variant} 실패: ${error.message}`;
        // B still runs if Pixi cannot initialize; invalid hidden/resized runs are never scored.
        if (controller.signal.aborted || document.hidden || /화면 크기/.test(error.message)) break;
      }
    }
    $('status').textContent = failed ? '일부 실패/무효 · 상세 JSON 확인. 정상 완료 결과만 보관.' : `측정 완료 · ${completed.length}회 · 결과를 복사해 줘`;
    return completed;
  } finally {
    busy = false; controller = null; document.body.classList.remove('running'); $('stop').disabled = true;
    document.querySelectorAll('[data-run], #stress, #clear, #copy, #note').forEach(el => { el.disabled = false; }); refresh();
  }
}
document.querySelectorAll('[data-run]').forEach(el => el.addEventListener('click', () => { runSequence(el.dataset.run.split(',')).catch(error => { $('status').textContent = error.message; }); }));
$('stop').onclick = () => controller?.abort();
$('clear').onclick = () => { results.length = failures.length = 0; refresh(); };
$('note').oninput = refresh;
$('copy').onclick = async () => {
  refresh();
  try { await navigator.clipboard.writeText(exportText()); $('status').textContent = '요약 + JSON 복사 완료'; }
  catch { $('export').closest('details').open = true; $('export').focus(); $('export').select(); $('status').textContent = '클립보드 미지원: 아래 선택된 내용을 길게 눌러 복사'; }
};
$('status').textContent = `준비 · 예열 ${warmupMs / 1000}초 + 측정 ${durationMs / 1000}초${quick ? ' (빠른 검증 모드)' : ''}`;
// Small public harness surface; no renderer loaded until a run is requested.
window.spike = { results, failures, runSequence, stop: () => controller?.abort(), get busy() { return busy; }, stats };
refresh();
