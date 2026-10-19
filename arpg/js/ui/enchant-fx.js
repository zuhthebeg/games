import { ITEMS } from '../meta/items.js';
import { itemIcon } from './icons.js';
import { WEAPON_GLOW_COLORS } from '../render/weapon-glow.js';

// Shared, static geometry: the forge and fullscreen result occupy the same ritual stage.
export function ritualCircleHtml() {
  // Draw the runes as strokes: mobile/system fonts frequently lack Runic glyphs.
  const runes = ['M7 3v26m0-22 15 8M7 14l15 8', 'M6 29V4l16 6v19', 'M8 3v26m0-21 13 7-13 7', 'M8 29V3l13 10M8 15l13 10', 'M7 29V3l15 7-15 8 15 11', 'M5 5l20 24M25 5 5 29', 'M16 29V4m0 12L5 5m11 11L27 5', 'M16 3 5 14l11 11 11-11zM5 29l11-9 11 9'];
  return `<span class="ritual-circle" aria-hidden="true"><span class="ritual-runes">${Array.from({length: 16}, (_, i) => `<i style="--r:${i * 22.5}deg"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="${runes[i % 8]}"/></svg></i>`).join('')}</span><span class="ritual-seal"></span></span>`;
}

// Presentation only: a committed result is the sole input; no save/world reference.
export function enchantPresentation(result, reduced = false) {
  const crack = Number.isInteger(result.count), destroyed = result.outcome === 'destroyed';
  return {
    kind: crack ? 'crack' : destroyed ? 'destroyed' : 'success',
    chargeMs: reduced ? 80 : crack ? 850 : result.risky ? 1250 : 180,
    holdMs: reduced ? 700 : crack ? 700 : destroyed ? 1050 : result.risky ? 900 : 420,
    title: crack ? `강화석 ${result.count}개` : destroyed ? '장비가 산산조각 났다' : result.to < result.from ? `+${result.to} 약화` : result.to === result.from ? `+${result.to} 변화 없음` : `+${result.to}${result.risky ? ' 강화 성공!' : ''}`,
    detail: crack ? ITEMS[result.id].name : destroyed ? `남은 강화석 ${result.refund?.enhance_stone_1 || 0}개` : ITEMS[result.id].name,
    sound: destroyed ? 'kill' : !crack && result.to < result.from ? 'enchant-down' : !crack && result.to === result.from ? 'hurt' : 'level-up',
  };
}

export const ENCHANT_PARTICLE_LIMIT = 160;
const tierColor = level => `#${(WEAPON_GLOW_COLORS[Math.max(0, Math.min(4, (level || 6) - 6))]).toString(16).padStart(6, '0')}`;
const sound = clip => document.dispatchEvent(new CustomEvent('arpg:presentation-sound', {detail: clip}));

export function playEnchantFx(root, result, stoneId) {
  const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
  const view = enchantPresentation(result, reduced), blessed = !!ITEMS[stoneId]?.blessed, cursed = !!ITEMS[stoneId]?.cursed;
  let origin = document.activeElement;
  let dialog = document.createElement('dialog');
  dialog.className = `enchant-fx ${view.kind} ${result.risky ? 'risky' : ''} ${blessed ? 'blessed' : ''} ${reduced ? 'reduced' : ''}`;
  dialog.dataset.enchantFx = view.kind;
  dialog.dataset.phase = 'charge';
  dialog.setAttribute('aria-label', view.kind === 'crack' ? '상급 강화석 개봉' : '강화 결과');
  dialog.style.setProperty('--charge', `${view.chargeMs}ms`);
  dialog.style.setProperty('--fx-color', blessed ? '#ffd36f' : '#70cfff');
  dialog.style.setProperty('--tier-color', tierColor(result.to));
  const stone = stoneId || result.id;
  dialog.innerHTML = `<button type="button" class="enchant-stage" aria-label="연출 건너뛰기">
    <span class="enchant-veil" aria-hidden="true"></span><span class="enchant-rays" aria-hidden="true"></span>${reduced ? '' : '<canvas class="enchant-particles" aria-hidden="true"></canvas>'}
    <span class="enchant-ritual" aria-hidden="true">${ritualCircleHtml()}</span>
    <span class="enchant-beam" aria-hidden="true"></span>
    <span class="enchant-scroll" aria-hidden="true">${itemIcon(stone, ITEMS[stone])}</span>
    <span class="enchant-gear" aria-hidden="true">${itemIcon(view.kind === 'crack' ? 'enhance_stone_3' : result.id, ITEMS[view.kind === 'crack' ? 'enhance_stone_3' : result.id])}<i class="enchant-fracture"></i></span>
    <span class="enchant-burst" aria-hidden="true"></span><span class="enchant-shards" aria-hidden="true"></span>
    ${view.kind === 'crack' ? `<span class="enchant-cards" aria-hidden="true">${Array.from({length: result.count / 5}, (_, i) => `<i style="--card:${i};--fan:${(i - (result.count / 5 - 1) / 2) * 7}deg">${itemIcon(result.id, ITEMS[result.id])}</i>`).join('')}</span>` : ''}
    <span class="enchant-copy"><small class="enchant-caption">${view.kind === 'crack' ? '상급 강화석 · 강화석 개봉' : blessed ? '축복의 인챈트' : cursed ? '저주의 인챈트' : result.risky ? '한계를 넘는 의식' : '안전 강화'}${view.kind === 'crack' ? '' : ` · +${result.from}`}</small>
      <strong class="enchant-result" role="status" aria-live="off"></strong><span class="enchant-detail"></span><small class="enchant-skip">탭 또는 Esc · 건너뛰기</small></span></button>`;
  root.append(dialog); dialog.showModal();
  let stage = dialog.querySelector('button'), title = dialog.querySelector('.enchant-result'), detail = dialog.querySelector('.enchant-detail');
  stage.focus({preventScroll: true});
  let canvas = dialog.querySelector('canvas'), context = canvas?.getContext('2d', {alpha: true});
  let width = 0, height = 0, timer, fractureTimer, frame, finished = false, revealed = false;
  let revealAt = 0, lastFrame = 0, lastCount = -1;
  const start = performance.now();
  const stats = {reduced, particleLimit: ENCHANT_PARTICLE_LIMIT, shards: view.kind === 'destroyed' && !reduced ? 48 : 0, drawMs: [], frameMs: [], frames: 0, cleaned: false};
  const particles = reduced ? [] : Array.from({length: ENCHANT_PARTICLE_LIMIT}, (_, i) => {
    const angle = i * 2.399963, speed = 100 + i % 13 * 24;
    return {angle, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 150, size: 2 + i % 4, spin: (i % 9 - 4) * 3};
  });
  function resize() {
    if (!canvas) return;
    // Fixed density and a capped raster budget; CSS stretches to the viewport. No DPR multiplier.
    const scale = Math.min(1, 960 / innerWidth, 720 / innerHeight);
    width = canvas.width = Math.round(innerWidth * scale); height = canvas.height = Math.round(innerHeight * scale);
  }
  resize();
  if (canvas) window.addEventListener('resize', resize);
  function close() {
    if (finished) return;
    finished = true; clearTimeout(timer); clearTimeout(fractureTimer); cancelAnimationFrame(frame);
    window.removeEventListener('resize', resize);
    dialog.close(); dialog.remove();
    if (canvas) canvas.width = canvas.height = 0;
    particles.length = 0;
    stats.cleaned = true;
    // Release detached images/canvas as well as removing them from the document.
    dialog = stage = title = detail = canvas = context = null;
    const focus = root.querySelector('[data-action="enhance"]:not(:disabled)') || (origin?.isConnected ? origin : null);
    focus?.focus({preventScroll: true}); origin = null;
  }
  function reveal() {
    if (finished || revealed) return;
    revealed = true; clearTimeout(timer); clearTimeout(fractureTimer);
    revealAt = performance.now(); dialog.dataset.phase = 'result'; delete dialog.dataset.beat;
    dialog.style.setProperty('--fx-color', view.kind === 'destroyed' ? '#ff6654' : blessed ? '#ffd36f' : tierColor(result.to));
    title.setAttribute('aria-live', 'polite'); title.textContent = view.title; detail.textContent = view.detail;
    stage.setAttribute('aria-label', '강화 결과 닫기');
    dialog.querySelector('.enchant-skip').textContent = '탭 또는 Esc · 닫기';
    sound(view.sound);
    if (result.risky && !reduced && navigator.userActivation?.hasBeenActive) navigator.vibrate?.(view.kind === 'destroyed' ? [45, 25, 70] : 25);
    timer = setTimeout(close, view.holdMs);
  }
  function skip() { if (revealed) close(); else reveal(); }
  dialog.addEventListener('click', skip);
  dialog.addEventListener('cancel', event => {event.preventDefault(); skip();});
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Tab' || event.key === 'Enter' || event.key === ' ') {event.preventDefault(); skip();}
  });
  if (!reduced) {
    sound(result.risky ? 'dodge' : 'critical');
    if (result.risky && navigator.userActivation?.hasBeenActive) navigator.vibrate?.(12);
    if (view.kind === 'destroyed') fractureTimer = setTimeout(() => {
      if (finished || revealed) return;
      dialog.dataset.beat = 'fracture'; sound('hurt');
    }, view.chargeMs - 150);
    // Fixed allocations: no particle nodes, timers, gradients, or canvas resizing per frame.
    function draw(now) {
      if (finished) return;
      const begun = performance.now();
      if (lastFrame) stats.frameMs.push(now - lastFrame);
      lastFrame = now; stats.frames++;
      const elapsed = now - start, progress = Math.min(1, elapsed / view.chargeMs), age = revealed ? (now - revealAt) / 1000 : 0;
      if (view.kind === 'crack' && !revealed) {
        const count = Math.min(result.count, Math.floor(Math.max(0, elapsed - 280) / (view.chargeMs - 280) * result.count));
        if (count !== lastCount) { title.textContent = `강화석 ${count}개`; lastCount = count; }
      }
      if (context && dialog.dataset.beat !== 'fracture') {
        const cx = width / 2, cy = height * .42, scale = Math.min(width / 390, height / 700, 1.3);
        context.clearRect(0, 0, width, height); context.save(); context.translate(cx, cy); context.scale(scale, scale);
        context.fillStyle = revealed && view.kind === 'destroyed' ? '#ff6654' : blessed ? '#ffdd87' : '#9bddff';
        if (!revealed) {
          // Spiral converges on the art; velocity ramps with the ritual heartbeat.
          for (let i = 0; i < 96; i++) {
            const p = particles[i], a = p.angle + elapsed * (.002 + progress * .004), r = 40 + (1 - ((progress + i / 96) % 1)) * 200;
            context.globalAlpha = .2 + progress * .55;
            context.fillRect(Math.cos(a) * r, Math.sin(a) * r * .65, p.size * .6, p.size * .6);
          }
          if (view.kind === 'crack' && elapsed > 320) {
            const chipAge = (elapsed - 320) / 1000;
            for (let i = 0; i < 24; i++) {
              const p = particles[i]; context.globalAlpha = Math.max(0, 1 - chipAge); context.fillStyle = '#d9b778';
              context.fillRect(p.vx * chipAge, p.vy * chipAge + 380 * chipAge * chipAge, p.size * 2, p.size * 2);
            }
          }
        } else if (view.kind !== 'destroyed') {
          for (let i = 0; i < ENCHANT_PARTICLE_LIMIT; i++) {
            const p = particles[i]; context.fillStyle = i % 3 ? (blessed ? '#ffdd87' : '#9bddff') : '#fff4cf';
            context.globalAlpha = Math.max(0, 1 - age / .95);
            const travel = (1 - Math.exp(-age * 4)) * 1.1;
            context.fillRect(p.vx * travel, p.vy * travel + age * age * 70, p.size * .8, p.size * .8);
          }
        } else {
          // 48 independently rotating fragments with ballistic velocity and gravity.
          for (let i = 0; i < 48; i++) {
            const p = particles[i]; context.save(); context.translate(p.vx * age, p.vy * age + 450 * age * age); context.rotate(p.angle + p.spin * age);
            context.globalAlpha = Math.max(0, 1 - age / 1.05); context.fillStyle = i % 3 ? '#e67f62' : '#ffe1b2';
            context.beginPath(); context.moveTo(-p.size, -p.size * 2); context.lineTo(p.size * 2, 0); context.lineTo(0, p.size * 2); context.fill(); context.restore();
          }
        }
        context.restore();
      }
      stats.drawMs.push(performance.now() - begun);
      frame = requestAnimationFrame(draw);
    }
    frame = requestAnimationFrame(draw);
  }
  timer = setTimeout(reveal, view.chargeMs);
  return { get active() { return !finished; }, close, stats };
}
