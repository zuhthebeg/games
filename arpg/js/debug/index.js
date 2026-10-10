import { debugActions, registerDebugAction, watchDebugActions, grantGear, grantSet, setLevel, mutateSave, previewDrops, summarizeLoot, RARITIES } from './actions.js';
import { createCombatController, queueVisibleKills, requestClear } from './combat.js';
import { SLOTS } from '../meta/economy.js';
import { MAX_LEVEL } from '../meta/progression.js';
import { MONSTERS } from '../content/combat.js';
export { registerDebugAction } from './actions.js';

export function mountDebug(context) {
  const { hub, store, renderer } = context;
  const combat = createCombatController();
  const style = document.createElement('style');
  style.textContent = `
    #arpg-debug-toggle{position:fixed;z-index:100;right:calc(8px + env(safe-area-inset-right));bottom:calc(8px + env(safe-area-inset-bottom));width:48px;height:44px;font-size:12px}
    #arpg-debug-panel{position:fixed;z-index:101;right:8px;bottom:calc(60px + env(safe-area-inset-bottom));width:min(360px,calc(100vw - 16px));max-height:calc(100dvh - 150px);overflow:auto;overscroll-behavior:contain;background:#14211ff5;color:#ecf6ed;border:1px solid #91bfa1;padding:12px;box-sizing:border-box;border-radius:12px;touch-action:pan-y;text-align:left}
    #arpg-debug-panel h2{font-size:16px;margin:8px 0} #arpg-debug-panel h3{font-size:14px;margin:14px 0 4px}
    #arpg-debug-panel button,#arpg-debug-panel select,#arpg-debug-panel input{min-height:44px;min-width:44px;max-width:100%;box-sizing:border-box;margin:3px;padding:6px;font-size:14px}
    #arpg-debug-panel label{display:inline-block;font-size:13px;margin:2px} #arpg-debug-panel textarea{width:100%;box-sizing:border-box;min-height:90px;color:#fff;background:#101a18;font-size:13px}
    #arpg-debug-panel pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px} #arpg-debug-status{display:block;font-size:12px;overflow-wrap:anywhere}
    #arpg-debug-info{position:fixed;z-index:99;right:8px;bottom:280px;max-width:250px;white-space:pre-wrap;font:11px monospace;background:#06100edb;color:#a5f9c2;pointer-events:none;padding:6px}
  `;
  document.head.append(style);
  const toggle = document.createElement('button');
  toggle.id = 'arpg-debug-toggle'; toggle.textContent = 'DBG'; toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', 'arpg-debug-panel');
  const panel = document.createElement('section'); panel.id = 'arpg-debug-panel'; panel.hidden = true;
  panel.setAttribute('aria-label', '개발자 디버그');
  const options = values => values.map(value => `<option value="${value}">${value}</option>`).join('');
  const btn = (action, label) => `<button type="button" data-debug="${action}">${label}</button>`;
  panel.innerHTML = `<h2>개발자 디버그 ${btn('close', '닫기')}</h2><output id="arpg-debug-status" aria-live="polite">로컬 테스트 전용 · 결정론 보장 안 함</output>
    <h3>여관 (전투 중 저장 금지)</h3>${btn('gold:1000', '골드 +1,000')}${btn('gold:10000', '골드 +10,000')}${btn('stones', '강화석 각 +10')}${btn('materials', '모든 재료 각 +20')}${btn('potions', '물약류 +5')}
    <label>부위<select id="dbg-slot">${options([...SLOTS, 'random'])}</select></label><label>등급<select id="dbg-rarity">${options(RARITIES)}</select></label><label>Tier<select id="dbg-tier">${options([1, 2, 3])}</select></label>
    <small>T3 템플릿 없음: 현재 T2로 지급. affix는 템플릿 Tier 기준.</small><div>${btn('gear', '장비 지급')}${btn('set', '등급별 전 부위 세트 (20개)')}</div>
    <label>레벨<input id="dbg-level" type="number" min="1" max="${MAX_LEVEL}" value="${MAX_LEVEL}"></label>${btn('level', '레벨·포인트 설정')}${btn('points', '포인트 회수 (스탯 초기화)')}
    ${btn('unlock', '모든 스테이지 해금')}${btn('progress-reset', '진행 초기화')}${btn('reroll', '무료 상점 리롤')}${btn('refresh-reset', '갱신 카운터 리셋')}${btn('pity', '천장 준비 (다음 보스)')}
    <h3>세이브</h3>${btn('reset', '세이브 즉시 리셋')}${btn('copy', 'JSON 복사')}<label>JSON 붙여넣기<textarea id="dbg-json" spellcheck="false" aria-label="세이브 JSON"></textarea></label>${btn('import', 'JSON 불러오기')}
    <h3>전투</h3>${btn('god', '무적')}${btn('oneHit', '원킬 ×100')}${btn('mana', 'MP 무한')}${btn('kill', '화면 몬스터 전멸')}${btn('clear', '즉시 클리어')}
    <label>속도<select id="dbg-speed">${options([0.5, 1, 2, 4])}</select></label>${btn('info', '전투 정보 오버레이')}
    <h3>드랍 미리보기 (저장 변경 없음)</h3><label>몬스터<select id="dbg-monster">${options(Object.keys(MONSTERS))}</select></label><label>유형<select id="dbg-kind">${options(['normal', 'elite', 'boss'])}</select></label><label>횟수<select id="dbg-count">${options([100, 1000])}</select></label><label>위협도<input id="dbg-threat" type="number" min="1" max="100" value="1"></label>${btn('preview', '드랍 시뮬')}<pre id="dbg-preview"></pre><div id="dbg-extensions"></div>`;
  const info = document.createElement('pre'); info.id = 'arpg-debug-info'; info.hidden = true;
  document.body.append(toggle, panel, info);
  const status = text => { panel.querySelector('#arpg-debug-status').textContent = text; };
  const value = id => panel.querySelector(`#dbg-${id}`).value;
  panel.querySelector('#dbg-speed').value = '1';
  const togglePanel = () => { panel.hidden = !panel.hidden; toggle.setAttribute('aria-expanded', String(!panel.hidden)); context.input.reset(); };
  toggle.addEventListener('click', togglePanel);
  // Only events originating inside this UI stop; canvas input stays enabled while open.
  for (const node of [panel, toggle]) for (const name of ['pointerdown', 'pointermove', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchmove', 'touchend', 'keydown', 'keyup', 'wheel']) node.addEventListener(name, event => {
    if (event.code === 'Backquote' && name === 'keydown' && !event.target.closest?.('input,textarea,select')) { event.preventDefault(); togglePanel(); }
    event.stopPropagation();
  });
  window.addEventListener('keydown', event => {
    if (event.code !== 'Backquote' || event.repeat || event.target.closest?.('input,textarea,select')) return;
    event.preventDefault(); togglePanel();
  });
  const requireInn = () => { if (context.running) throw new Error('전투 중 저장 수정 불가. 정산 후 여관에서 사용.'); };
  const save = next => {
    requireInn(); store.save(next); hub.save = next;
    if (typeof hub.showInn === 'function') hub.showInn(); else location.reload();
    status('저장 완료');
  };
  const requireSave = () => { requireInn(); if (!hub.save) throw new Error('먼저 캐릭터를 생성하세요.'); return hub.save; };
  const execute = async action => {
    if (action === 'close') { togglePanel(); return; }
    if (['god', 'oneHit', 'mana'].includes(action)) {
      combat.state[action] = !combat.state[action];
      panel.querySelector(`[data-debug="${action}"]`).setAttribute('aria-pressed', String(combat.state[action]));
      status(`${action}: ${combat.state[action] ? 'ON' : 'OFF'}`); return;
    }
    if (action === 'info') { info.hidden = !info.hidden; return; }
    if (action === 'kill' || action === 'clear') {
      if (!context.running) throw new Error('전투 중에 사용하세요.');
      combat.enqueue(action === 'kill' ? (world, view) => status(`정상 처치 경로: ${queueVisibleKills(world, view)}마리`) : requestClear); return;
    }
    if (action === 'preview') {
      const kind = value('kind'); const threat = Number(value('threat'));
      if (!Number.isFinite(threat) || threat < 1) throw new Error('위협도는 1 이상');
      panel.querySelector('#dbg-preview').textContent = JSON.stringify(previewDrops(value('monster'), Number(value('count')), { elite: kind === 'elite', boss: kind === 'boss', threat, huntTier: Number(value('tier')) }), null, 2); return;
    }
    if (action === 'reset') { requireInn(); if (confirm('현재 세이브를 삭제할까요?')) { store.reset(); location.reload(); } return; }
    if (action === 'copy') {
      const json = JSON.stringify(requireSave(), null, 2); panel.querySelector('#dbg-json').value = json;
      try { await navigator.clipboard.writeText(json); status('클립보드 복사 완료'); }
      catch { panel.querySelector('#dbg-json').select(); status('클립보드 불가: 아래 JSON을 직접 복사하세요.'); }
      return;
    }
    if (action === 'import') { requireInn(); save(JSON.parse(panel.querySelector('#dbg-json').value)); return; }
    const current = requireSave();
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    if (action === 'gear') save(grantGear(current, { slot: value('slot'), rarity: value('rarity'), huntTier: Number(value('tier')), seed }));
    else if (action === 'set') save(grantSet(current, Number(value('tier')), seed));
    else if (action === 'level') save(setLevel(current, Number(value('level'))));
    else if (action === 'points') { const next = structuredClone(current); for (const key of Object.keys(next.stats)) next.stats[key] = 5; save(setLevel(next, next.level)); }
    else save(mutateSave(current, action));
  };
  panel.addEventListener('click', event => {
    event.stopPropagation(); const action = event.target.closest('[data-debug]')?.dataset.debug;
    if (action) execute(action).catch(error => status(error.message));
  });
  panel.querySelector('#dbg-speed').addEventListener('change', () => { combat.state.speed = Number(value('speed')); });
  const extensions = panel.querySelector('#dbg-extensions');
  const renderExtensions = () => {
    extensions.replaceChildren();
    for (const action of debugActions) {
      const button = document.createElement('button'); button.textContent = `${action.group} · ${action.label}`;
      button.addEventListener('click', () => Promise.resolve().then(() => action.run(Object.assign(Object.create(context), { enqueue: combat.enqueue, persistSave: save }))).catch(error => status(error.message)));
      extensions.append(button);
    }
  };
  watchDebugActions(renderExtensions); renderExtensions();
  let last = 0, frames = 0, fps = 0, nextInfo = 0;
  return {
    get speed() { return combat.state.speed; },
    beforeTick() { combat.beforeTick(context.world, renderer); },
    frame(now) {
      frames++;
      if (now - last >= 1000) { fps = frames * 1000 / (now - last); frames = 0; last = now; }
      // Keep DBG clear of action buttons + movement hint without changing their CSS.
      const actions = document.querySelector('#actions').getBoundingClientRect();
      const actionHeight = actions.height > 0 ? innerHeight - actions.top : 0;
      toggle.style.bottom = `calc(${actionHeight + 8}px + env(safe-area-inset-bottom))`;
      const panelBottom = actionHeight + 60;
      panel.style.bottom = `${panelBottom}px`;
      panel.style.maxHeight = `${Math.max(44, innerHeight - panelBottom - 12)}px`;
      if (info.hidden || now < nextInfo) return;
      nextInfo = now + 250;
      const world = context.world, player = world?.entities[0], loot = context.tracker?.tempLoot;
      info.textContent = `FPS ${fps.toFixed(1)} | tick ${world?.tick || 0} | ×${combat.state.speed}\n생존 ${world?.entities.filter(e => e.kind === 'monster' && !e.dead).length || 0}\nHP ${player?.hp.toFixed(1) || '-'} / ${player?.maxHp || '-'} MP ${player?.mp.toFixed(1) || '-'} / ${player?.maxMp || '-'}\n${loot ? JSON.stringify(summarizeLoot(loot)) : '드랍 없음'}`;
    },
  };
}
