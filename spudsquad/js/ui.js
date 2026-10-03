(function (root) {
  'use strict';
  const P = root.SPUD = root.SPUD || {};
  const D = P.data;
  const I = P.i18n;
  const panel = document.getElementById('panel');
  const overlay = document.getElementById('overlay');
  const hudEl = document.getElementById('hud');
  let activeRefresh = null;
  const esc = value => String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
  const shown = value => Math.round(Number(value) || 0);
  const label = (key, n) => `<span class="stat-change ${n < 0 ? 'negative' : 'positive'}">${esc(I.stat(key))} ${n > 0 ? '+' : ''}${shown(n)}</span>`;
  const itemMarkup = id => I.itemParts(id).map(part => {
    const words = { ko: ['이점', '불이익', '조건'], en: ['Benefit', 'Penalty', 'Condition'], 'zh-TW': ['增益', '懲罰', '條件'] }[I.language];
    const tag = words[part.tone === 'positive' ? 0 : part.tone === 'negative' ? 1 : 2];
    return `<span class="stat-change ${part.tone}" aria-label="${esc(tag + ': ' + part.text)}">${part.tone === 'positive' ? '＋' : part.tone === 'negative' ? '−' : '·'} ${esc(part.text)}</span>`;
  }).join(' · ');
  function ultDescription(char) {
    const u = D.ults[char], lang = I.language;
    if (!u) return '';
    const name = lang === 'ko' ? u.name : lang === 'zh-TW' ? u.zh : u.en;
    const modifiers = { ko: '즉시 1회 피해 · 보호막 피해½ · 냉각피해 아이템 적용', en: 'Instant damage once · shield damage ½ · chilled-damage items apply', 'zh-TW': '瞬間一次傷害 · 護盾傷害½ · 冷卻增傷道具生效' }[lang];
    return `${name}: ${u.text?.[lang] || u.effect} · R ${u.radius}px · ${u.duration}s · ${I.t?.('ultRule') || '1 / WAVE'}${char === 'vampire' ? '' : ' · ' + modifiers}`;
  }
  const icon = (id, kind = '') =>
    `<img class="${kind}" src="assets/${esc(id)}.webp?v=20261003artshield1" alt="" onerror="this.hidden=true">`;
  // T2–T4 dedicated art; T5/T6 reuse T4 art with separate tier badge/color.
  const weaponIcon = (id, tier = 1, kind = '') => tier >= 2
    ? `<img class="${kind}" src="assets/weapon_${esc(id)}_t${Math.min(4, Number(tier)) | 0}.webp?v=20261003artshield1" alt="" onerror="this.onerror=null;this.src='assets/weapon_${esc(id)}.webp?v=20261003artshield1'">`
    : icon('weapon_' + id, kind);
  const button = (text, act, extra = '') =>
    `<button type="button" class="btn ${extra}" data-act="${act}">${esc(text)}</button>`;
  const GLYPH = { maxHp: '❤️', dmg: '⚔️', atkSpd: '⚡', melee: '🥊',
    ranged: '🎯', armor: '🛡️', speed: '👟', crit: '💥', range: '🔭',
    regen: '🩹', dodge: '🪶', luck: '🍀', harvest: '🌱', elemental: '🔥',
    explosion: '💣', thorns: '🌵', knockback: '💫', lifesteal: '🧛', pickup: '🧲', projectiles: '🔫' };
  // 스탯 시트 구역(20개 스탯 전부)
  const SECTIONS = [
    ['secAttack', '⚔️', ['dmg', 'melee', 'ranged', 'elemental', 'atkSpd', 'crit', 'range', 'projectiles', 'knockback', 'explosion']],
    ['secSurvival', '❤️', ['maxHp', 'regen', 'lifesteal', 'armor', 'dodge', 'thorns']],
    ['secUtility', '🧰', ['speed', 'luck', 'harvest', 'pickup']]
  ];
  const fill = (text, n) => String(text).replace('{n}', n);
  const num = n => n < 10 ? String(Math.round(n * 10) / 10) : String(Math.round(n));
  const enemyArt = id => id.startsWith('boss_') ? id : 'enemy_' + id;
  // ---- 시트 레이어(#sheet): 패널(상점 등) 위에 겹쳐 뜨는 전체 창. 솔로에선 main이 열려 있는 동안 일시정지 ----
  const sheetEl = document.getElementById('sheet');
  let sheetDraw = null, sheetAct = null, sheetReturnFocus = null;
  function openSheet(draw, act) {
    sheetReturnFocus = document.activeElement;
    P.main?.clearInput?.();
    sheetDraw = draw; sheetAct = act;
    draw();
    sheetEl.hidden = false;
    sheetEl.querySelector?.('.sheet-close')?.focus();
  }
  function closeSheet() {
    if (!sheetEl || sheetEl.hidden) return;
    sheetEl.hidden = true;
    sheetEl.innerHTML = '';
    sheetDraw = sheetAct = null;
    sheetReturnFocus?.focus?.(); sheetReturnFocus = null;
  }
  function sheetFrame(title, body, extra = '') {
    sheetEl.innerHTML = `<section class="sheet ${extra}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <header class="sheet-head"><h2>${esc(title)}</h2>
      <button type="button" class="sheet-close" data-act="close" aria-label="${esc(I.t('close'))}">×</button></header>
      <div class="sheet-body">${body}</div></section>`;
  }
  if (sheetEl) sheetEl.onclick = event => {
    if (event.target === sheetEl) { closeSheet(); return; } // 바깥 어두운 영역
    const act = event.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'close') closeSheet();
    else sheetAct?.(act, event);
  };
  root.addEventListener?.('keydown', event => {
    if (event.key === 'Escape' && sheetEl && !sheetEl.hidden) closeSheet();
    if (event.key === 'Tab' && sheetEl && !sheetEl.hidden) {
      const nodes = [...sheetEl.querySelectorAll('button:not(:disabled),select,input,[tabindex="0"]')];
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  });
  function setLines(p) {
    const list = Object.entries(P.sim.sets(p)).sort((a, b) => b[1].count - a[1].count);
    return list.map(([key, v]) => {
      const steps = [2, 3, 4, 6], next = steps.find(t => t > v.count);
      const sample = Object.keys(D.weapons).find(id => D.weapons[id].classes.includes(key));
      const nextStats = next && P.sim.sets({ weapons: Array.from({ length: next }, () => [sample, 1]) })[key]?.stats;
      const now = v.stage ? `${fill(I.t('setActive'), steps.indexOf(v.stage) + 1)}: ${I.effect(v.stats).join(' · ')}` : '';
      const later = next ? `${fill(I.t('setNext'), next)}: ${I.effect(nextStats || {}).join(' · ')}` : I.t('setMax');
      return `<li class="set-row${v.stage ? ' on' : ''}"><b>${esc(I.setName(key))} ×${v.count}</b>
        ${now ? `<span>✔ ${esc(now)}</span>` : ''}<span class="muted">${esc(later)}</span></li>`;
    }).join('') || `<li class="set-row muted">${esc(I.t('noSets'))}</li>`;
  }
  // 내 스탯 시트. getPlayer는 열 때마다(언어 전환 포함) 최신 플레이어를 돌려준다.
  function stats(getPlayer, initialPick = null) {
    let pick = initialPick;
    openSheet(function draw() {
      const p = getPlayer();
      if (!p) { closeSheet(); return; }
      const s = P.sim.effectiveStats(p);
      const row = key => {
        const n = Math.round(s[key] || 0);
        let value = `${n > 0 ? '+' : ''}${n}${I.percent(key) ? '%' : ''}`;
        if (key === 'maxHp') value = `${shown(p.hp)}/${shown(p.maxHp)}`;
        const taken = key === 'armor' && n ? Math.round(P.sim.damageTaken(100, s.armor)) - 100 : 0;
        return `<li class="stat-row" data-stat="${key}"><span class="g" aria-hidden="true">${GLYPH[key]}</span>
          <span class="n"><b>${esc(I.stat(key))}</b><small>${esc(I.statDesc(key))}</small></span>
          <span class="v ${n > 0 ? 'pos' : n < 0 ? 'neg' : 'zero'}">${esc(value)}${taken
            ? `<small>${taken > 0 ? '+' : ''}${taken}%</small>` : ''}</span></li>`;
      };
      const sections = SECTIONS.map(([title, glyph, keys]) => `<section class="sheet-sec">
        <h3>${glyph} ${esc(I.t(title))}</h3><ul class="stat-rows">${keys.map(row).join('')}</ul></section>`).join('');
      const weapons = p.weapons.map(([id, tier]) => {
        const w = P.sim.weaponSummary(p, id, tier);
        if (!w) return '';
        return `<li class="weapon-row tier${tier}">${weaponIcon(id, tier)}<div>
          <b>${esc(I.name('weapons', id))} · T${tier}</b><small>${esc(I.feature(id))}</small>
          <div class="weapon-nums"><span>${esc(I.t('perHit'))} <b>${num(w.damage)}${w.shots > 1 ? ` ×${w.shots}` : ''}</b></span>
          <span>${esc(I.t('cool'))} <b>${Math.round(w.cooldownMs)}ms</b></span>
          <span>${esc(I.t('reach'))} <b>${Math.round(w.range)}</b></span>${w.armor ? `<span>${esc(I.stat('armor'))} <b>+${w.armor}</b></span>` : ''}</div></div></li>`;
      }).join('') || `<li class="muted">${esc(I.t('empty'))}</li>`;
      const counts = {};
      for (const id of p.items) counts[id] = (counts[id] || 0) + 1;
      const tiles = Object.entries(counts).map(([id, n]) => `<button type="button"
        class="item-tile${pick === id ? ' on' : ''}" data-act="item:${esc(id)}">${icon('item_' + id)}
        <span>${esc(I.name('items', id))}</span>${n > 1 ? `<b>×${n}</b>` : ''}</button>`).join('');
      const detail = pick && counts[pick]
        ? `<p class="item-detail"><b>${esc(I.name('items', pick))}</b> — ${itemMarkup(pick)} · ×${counts[pick]}</p>`
        : `<p class="item-detail muted">${esc(tiles ? I.t('tapItem') : I.t('empty'))}</p>`;
      // 캐릭터 특성 헤더: 초상화·이름·특성·기본 보정 + 현재 걸린 조건/다음 웨이브 효과
      const c = D.chars[p.char] || {};
      const states = [];
      if (c.still || c.moving || p.items.some(id => D.items[id]?.still)) states.push(I.t(p.still ? 'stateStill' : 'stateMoving'));
      for (const [k, n] of Object.entries(p.pending || {})) if (n) states.push(`${I.t('nextWave')}: ${I.t('once_' + k)}${n > 1 ? ' ×' + n : ''}`);
      for (const [k, n] of Object.entries(p.active || {})) if (n) states.push(`${I.t('thisWave')}: ${I.t('once_' + k)}`);
      const charHead = `<section class="sheet-char">${icon('char_' + p.char, 'sheet-char-art')}<div>
        <b>${esc(I.name('chars', p.char))}</b><p>${esc(I.trait(p.char))}</p><p class="ult-description">⚡ ${esc(ultDescription(p.char))}</p>
        ${Object.keys(c.stats || {}).length ? `<span class="char-bonus">${I.effect(c.stats).map(esc).join(' · ')}</span>` : ''}
        ${states.length ? `<span class="char-state">${states.map(esc).join(' · ')}</span>` : ''}</div></section>`;
      sheetFrame(`📊 ${I.t('stats')}`, `${charHead}<div class="stat-grid">${sections}</div>
        <div class="sheet-lower">
          <section class="sheet-sec"><h3>🗡️ ${esc(I.t('weapons'))} · ${p.weapons.length}/${P.sim.capacity(p)}</h3>
            <ul class="weapon-rows">${weapons}</ul></section>
          <section class="sheet-sec"><h3>🧩 ${esc(I.t('sets'))}</h3><ul class="set-rows">${setLines(p)}</ul></section>
        </div>
        <section class="sheet-sec"><h3>🎒 ${esc(I.t('items'))} · ${p.items.length}</h3>
          <div class="item-tiles">${tiles}</div>${detail}</section>`, 'stats-sheet');
    }, act => {
      if (act.startsWith('item:')) { const id = act.slice(5); pick = pick === id ? null : id; sheetDraw?.(); sheetEl.querySelector?.(`[data-act="item:${id}"]`)?.focus(); }
    });
  }
  // ---- 디버그 패널(솔로 전용). 실제 조작은 P.main.debugAct가 한다 ----
  const dbgForm = { weapon: 'pistol', tier: '1', mats: '500', wave: '10', enemy: 'blob', n: '5' };
  let dbgNote = '';
  function debugPanel() {
    const M = P.main;
    if (!M?.debug || !M.solo) return; // 멀티에선 열지 않는다
    dbgNote = '';
    const opt = (list, cur, label) => list.map(id =>
      `<option value="${esc(id)}"${String(id) === String(cur) ? ' selected' : ''}>${esc(label(id))}</option>`).join('');
    openSheet(function draw() {
      const view = M.debugView || {};
      sheetFrame(`🐞 ${I.t('debug')}`, `<p class="dbg-note" role="status">${esc(dbgNote)}</p>
        <section class="sheet-sec"><h3>🗡️ ${esc(I.t('weapons'))}</h3><div class="dbg-row">
          <select data-dbg="weapon" aria-label="weapon">${opt(Object.keys(D.weapons), dbgForm.weapon, id => I.name('weapons', id))}</select>
          <select data-dbg="tier" aria-label="tier">${opt([1, 2, 3, 4, 5, 6], dbgForm.tier, t => 'T' + t)}</select>
          ${button(I.t('grant'), 'dbg:weapon', 'primary')}</div></section>
        <section class="sheet-sec"><h3>🎒 ${esc(I.t('tabItems'))}</h3><div class="item-tiles dbg-items">
          ${Object.keys(D.items).map(id => `<button type="button" class="item-tile tier${D.items[id].tier || 1}"
            data-act="dbg:item:${esc(id)}" title="${esc(I.itemEffect(id))}">${icon('item_' + id)}
            <span>${esc(I.name('items', id))}</span></button>`).join('')}</div></section>
        <section class="sheet-sec"><h3>🛠️ ${esc(I.t('debug'))}</h3>
          <div class="dbg-row"><label>💎 <input type="number" min="0" max="99999" data-dbg="mats" value="${esc(dbgForm.mats)}"></label>
            ${button(I.t('setMats'), 'dbg:mats')}
            <label>🌊 <input type="number" min="1" max="20" data-dbg="wave" value="${esc(dbgForm.wave)}"></label>
            ${button(I.t('jumpWave'), 'dbg:wave')}</div>
          <div class="dbg-row"><select data-dbg="enemy" aria-label="enemy">${opt(Object.keys(D.enemies), dbgForm.enemy, id => I.enemy(id))}</select>
            <label>× <input type="number" min="1" max="50" data-dbg="n" value="${esc(dbgForm.n)}"></label>
            ${button(I.t('spawn'), 'dbg:spawn')}${button(I.t('killAll'), 'dbg:kill')}</div>
          <div class="dbg-row">${button(`🛡️ ${I.t('god')}: ${I.t(view.god ? 'on' : 'off')}`, 'dbg:god', view.god ? 'primary' : '')}
            ${button(`🔭 ${I.t('ranges')}: ${I.t(view.ranges ? 'on' : 'off')}`, 'dbg:ranges', view.ranges ? 'primary' : '')}</div>
        </section>`, 'debug-sheet');
    }, act => {
      if (!act.startsWith('dbg:')) return;
      for (const el of sheetEl.querySelectorAll('[data-dbg]')) dbgForm[el.dataset.dbg] = el.value;
      const [, name, id] = act.split(':');
      dbgNote = M.debugAct(name, { ...dbgForm, item: id }) || '';
      if (sheetDraw) sheetDraw();
    });
  }
  // ---- 콜렉션(도감) ----
  let colTab = 'chars', activeView = '';
  function collection(back) {
    const C = P.collection;
    const debugOn = !!P.main?.debug;
    const col = debugOn ? C.all() : C.get(); // 게스트는 null → 전부 잠김
    const prog = C.progress(col);
    const pct = x => x.total ? Math.floor(x.n / x.total * 100) : 0;
    const tabs = [['chars', 'tabChars'], ['weapons', 'tabWeapons'], ['items', 'tabItems'], ['enemies', 'tabEnemies']];
    const card = id => {
      const art = colTab === 'chars' ? 'char_' + id : colTab === 'weapons' ? 'weapon_' + id
        : colTab === 'items' ? 'item_' + id : enemyArt(id);
      if (!C.unlocked(col, colTab, id)) {
        return `<article class="col-card locked">${icon(art, 'col-art sil')}<strong>???</strong></article>`;
      }
      let name = '', desc = '', meta = '', tier = '';
      if (colTab === 'chars') {
        const row = col.c[id];
        name = I.name('chars', id); desc = I.trait(id);
        meta = `${I.t('best')} W${row.b}${row.w ? ` · 👑×${row.w}` : ''}`;
      } else if (colTab === 'weapons') {
        const v = D.weapons[id];
        name = I.name('weapons', id); desc = I.feature(id);
        meta = `${I.t('damage')} ${shown(v.damage)} · ${I.t('cool')} ${Math.round(v.cool * 1000)}ms · ${I.t('reach')} ${shown(v.range)}`;
      } else if (colTab === 'items') {
        name = I.name('items', id); desc = I.itemEffect(id); tier = ' tier' + (D.items[id].tier || 1);
      } else {
        const e = D.enemies[id];
        name = I.enemy(id); desc = I.enemyDesc(id);
        meta = `HP ${e.hp} · ${I.t('speed')} ${e.speed} · ${I.t('firstWave')} W${e.first}`;
      }
      const crown = colTab === 'chars' && col.c[id].w ? '<span class="col-crown" aria-hidden="true">👑</span>' : '';
      return `<article class="col-card${tier}">${crown}${icon(art, 'col-art')}<strong>${esc(name)}</strong>
        ${desc ? `<small>${colTab === 'items' ? itemMarkup(id) : esc(desc)}</small>` : ''}${meta ? `<span class="meta">${esc(meta)}</span>` : ''}</article>`;
    };
    show(`<section class="collection-screen"><header class="col-head">
        ${button('←', 'back', 'col-back')}
        <div><span class="eyebrow">COLLECTION</span><h2>📖 ${esc(I.t('collection'))}</h2></div>
        <div class="col-total"><b>${prog.all.n} / ${prog.all.total}</b> <span>(${pct(prog.all)}%)</span>
          <i class="col-bar"><i style="width:${pct(prog.all)}%"></i></i></div></header>
      ${debugOn ? `<div class="col-banner debug">🐞 ${esc(I.t('debugAll'))}</div>`
        : !col ? `<div class="col-banner">🔒 ${esc(I.t('loginBanner'))}</div>`
        : `<div class="col-hint">${esc(I.t('collectionHint'))}</div>`}
      <nav class="col-tabs" role="tablist">${tabs.map(([tab, key]) => `<button type="button" role="tab"
        aria-selected="${tab === colTab}" class="col-tab${tab === colTab ? ' on' : ''}" data-act="tab:${tab}">
        ${esc(I.t(key))} <small>${prog[tab].n}/${prog[tab].total} (${pct(prog[tab])}%)</small></button>`).join('')}</nav>
      <div class="col-grid">${Object.keys(D[colTab]).map(card).join('')}</div></section>`, true);
    activeRefresh = () => collection(back);
    activeView = 'collection';
    panel.onclick = event => {
      const act = event.target.closest('[data-act]')?.dataset.act;
      if (act === 'back') back();
      else if (act?.startsWith('tab:')) { colTab = act.slice(4); collection(back); panel.scrollTop = 0; }
    };
  }
  P.collection?.onChange?.(() => { if (activeView === 'collection') activeRefresh?.(); });

  function show(html, menu = false) {
    ultimate(null, 'shop'); // synchronous noncombat hide; never wait for next RAF
    activeView = '';
    panel.innerHTML = html;
    overlay.style.display = 'flex';
    document.body.classList.toggle('menu-mode', menu);
    hudEl.setAttribute('aria-hidden', 'false'); // Settings remains accessible in zero-height menu HUD.
    requestAnimationFrame(() => P.main?.resize?.());
  }
  function hide() {
    overlay.style.display = 'none';
    document.body.classList.remove('menu-mode');
    hudEl.setAttribute('aria-hidden', 'false');
    activeRefresh = null;
    activeView = '';
    requestAnimationFrame(() => P.main?.resize?.());
  }
  function landscape() {
    // Fullscreen first: browsers require it before a landscape orientation lock.
    (async () => {
      try { await document.documentElement.requestFullscreen?.(); } catch {}
      try {
        if (!screen.orientation?.lock) throw new Error('orientation lock unavailable');
        await screen.orientation.lock('landscape');
      } catch {
        // Already sideways (e.g. iOS, which has no orientation lock): nothing to ask for.
        if (innerWidth > innerHeight) return;
        const hint = document.createElement('div');
        hint.className = 'landscape-hint';
        hint.setAttribute('role', 'status');
        hint.textContent = I.t('rotateHint');
        document.querySelector('.landscape-hint')?.remove();
        document.body.appendChild(hint);
        setTimeout(() => hint.remove(), 3000);
      }
    })();
  }
  function title(cb) {
    activeRefresh = () => title(cb);
    show(`<section class="title-screen">
      ${icon('key_art', 'key-art')}
      <div class="title-copy"><span class="eyebrow">1–4 PLAYER · CO-OP SURVIVAL</span>
      <h1>${esc(I.t('title'))}</h1><p>${esc(I.t('subtitle'))}</p>
      <div class="title-actions">${button(I.t('solo'), 'solo', 'primary large')}
      ${button(I.t('multi'), 'multi', 'large')}
      ${button('📖 ' + I.t('collection'), 'collection', 'large col-open')}</div>
      <div class="mode-row"><div class="mode-pick" role="radiogroup" aria-label="${esc(I.t('modeLabel'))}">
        ${button(I.t('modeNormal'), 'mode-normal', endlessMode() ? '' : 'on')}
        ${button(I.t('modeEndless'), 'mode-endless', endlessMode() ? 'on' : '')}</div>
      ${button(I.t('landscape'), 'landscape', 'landscape-btn')}</div>
      <small class="mode-hint">${esc(I.t(endlessMode() ? 'modeEndlessHint' : 'modeNormalHint'))}</small></div>
    </section>`, true);
    panel.onclick = event => {
      const act = event.target.closest('[data-act]')?.dataset.act;
      if (act === 'landscape') {
        landscape();
        return;
      }
      if (act === 'mode-normal' || act === 'mode-endless') {
        try { localStorage.setItem('spud_mode', act === 'mode-endless' ? 'endless' : 'normal'); } catch {}
        title(cb); return;
      }
      if (act) cb(act);
    };
  }
  function choose(cb) {
    activeRefresh = () => choose(cb);
    const cards = Object.entries(D.chars).map(([id, char]) => {
      const changes = Object.entries(char.stats);
      return `<button type="button" class="character-card" data-act="${id}">
        ${icon('char_' + id, 'character-art')}
        <strong>${esc(I.name('chars', id))}</strong>
        <span class="starting-weapon">${icon('weapon_' + char.weapon)}
          ${esc(I.t('weapon'))}: ${esc(I.name('weapons', char.weapon))}${char.weapons ? ' ×2' : ''}</span>
        <span class="trait">${esc(I.trait(id))}</span>
        <span class="bonuses">${changes.length ? changes.map(([key, n]) => label(key, n)).join('')
          : `<span class="stat-change">${esc(I.t('balanced'))}</span>`}</span>
      </button>`;
    }).join('');
    show(`<section class="selection-screen"><span class="eyebrow">CHOOSE YOUR HERO</span>
      <h2>${esc(I.t('choose'))}</h2><div class="character-grid">${cards}</div></section>`, true);
    panel.onclick = event => {
      const act = event.target.closest('[data-act]')?.dataset.act;
      if (act) cb(act);
    };
  }
  // 동료 표시명: 로그인 닉 우선. 게스트는 로비 닉이 uid(u-xxxx)로 오므로 좌석순 '감자 N'으로 대체.
function displayName(member, id) {
  const nick = member?.nick;
  if (nick && nick !== id && !/^u-[a-z0-9]{6,}$/i.test(nick)) return nick;
  const order = Object.keys(P.main?.session?.players || {});
  const seat = Math.max(0, order.indexOf(id)) + 1;
  return ({ ko: '감자', en: 'Spud', 'zh-TW': '馬鈴薯' }[P.i18n?.language] || '감자') + ' ' + seat;
}
  // Write only changed values; rebuilding #team every frame forces DOM/style
  // work and image churn even when the team HUD is unchanged.
  function hudValue(id, key, value) {
    const el = document.getElementById(id);
    if (String(el[key]) !== String(value)) el[key] = value;
  }
  function hudWidth(id, value) {
    const style = document.getElementById(id).style;
    if (style.width !== value) style.width = value;
  }
function hud(scene, uid) {
    if (!scene) return;
    const p = scene.pl?.find(row => row[0] === uid) || scene.players?.[uid];
    if (!p) return;
    const hp = Array.isArray(p) ? p[3] : p.hp;
    const max = Array.isArray(p) ? p[4] : p.maxHp;
    const mats = Array.isArray(p) ? p[6] : p.mats;
    const xp = Array.isArray(p) ? p[7] : p.xp;
    const lvl = Array.isArray(p) ? p[8] : p.lvl;
    hudValue('hpText', 'textContent', `${shown(hp)}/${shown(max)}`);
    hudWidth('hpBar', Math.max(0, hp / max * 100) + '%');
    hudWidth('xpBar', xp / P.sim.needXp(lvl, P.main?.session?.lastPlayers?.[uid]?.char) * 100 + '%'); // 돌연변이 XP 배율
    hudValue('level', 'textContent', shown(lvl));
    hudValue('mats', 'textContent', shown(mats));
    hudValue('wave', 'textContent', P.main?.session?.wave || 1);
    const remaining = scene.tm ?? P.main?.session?.world?.tm ?? 0;
    hudValue('timer', 'textContent', P.main?.session?.wave === 20 && remaining <= 0 ? 'BOSS' : shown(remaining));
    hudValue('waveMax', 'textContent', P.main?.session?.endless ? '∞' : 20);
    const members = scene.pl || Object.values(scene.players || {}).map(v =>
      [v.uid, v.x, v.y, v.hp, v.maxHp, v.alive]
    );
    const team = members.filter(v => v[0] !== uid)
      .map(v => {
        const member = P.main?.session?.players?.[v[0]];
        const char = P.main?.session?.lastPlayers?.[v[0]]?.char || 'basic';
        return `<div>${icon('char_' + char)} ${esc(displayName(member, v[0])).slice(0, 12)}
          ${v[5] ? `❤️${shown(v[3])}/${shown(v[4])}` : '👻'}</div>`;
      })
      .join('');
    // Cache the source string: browsers normalize innerHTML on read.
    const teamNode = document.getElementById('team');
    if (teamNode._spudHud !== team) { teamNode.innerHTML = team; teamNode._spudHud = team; }
  }
  function crates(session, player, count, cb, currentId = null) {
    if (!count) { cb(); return; }
    const world = session.world || { wave: session.wave, rng: Math.random };
    player.pendingCrates ||= [];
    let reward = player.pendingCrates[0];
    if (!reward || typeof reward !== 'object') reward = player.pendingCrates[0] = { id: reward || 0, minTier: 1 };
    const id = currentId || reward.itemId || P.sim.rollCrateItem(world, player, reward.bossReward ? 2 : 1);
    reward.itemId = id; // stable on refresh and SOLO checkpoint restore
    if (!id) { player.pendingCrates.shift(); crates(session, player, count - 1, cb); return; }
    const item = D.items[id];
    activeRefresh = () => crates(session, player, count, cb, id);
    show(`<section class="upgrade-screen"><h2>📦 ${esc(I.t('crate'))}</h2>
      <article class="shop-card tier${item.tier || 1}">${icon('item_' + id, 'shop-art')}
      <strong>${esc(I.name('items', id))}</strong><small>${itemMarkup(id)}</small></article>
      ${button(I.t('take'), 'take', 'primary')}
      ${button(`${I.t('recycle')} · 💎${Math.floor(item.price / 2)}`, 'recycle')}</section>`);
    panel.onclick = event => {
      const act = event.target.closest('[data-act]')?.dataset.act;
      if (act !== 'take' && act !== 'recycle') return;
      if (act === 'take') P.sim.grantItem(player, id);
      else player.mats += Math.floor(item.price / 2);
      P.sfx?.('buy');
      player.pendingCrates.shift();
      crates(session, player, count - 1, cb);
    };
  }
  function upgrades(player, cb) {
    if (!player.levelUps) { cb(); return; }
    let choices = P.sim.rollUpgrades(player);
    let rerolled = false;
    function draw() {
      activeRefresh = draw;
      const cards = choices.map(({ id, grade, value }, index) => {
        const now = Math.round(player.stats[id] || 0);
        const next = Math.round((player.stats[id] || 0) + value);
        const glyph = GLYPH[id];
        return `<button type="button" class="upgrade-card tier${grade}" data-act="pick${index}">
          <span class="grade">${esc(I.grade(grade))}</span>
          <span class="upgrade-glyph">${glyph}</span><strong>${esc(I.stat(id))}</strong>
          <span>${now} <span aria-hidden="true">→</span> <b>${next}</b></span>
        </button>`;
      }).join('');
      const cost = P.main?.session?.wave || 1;
      show(`<section class="upgrade-screen"><span class="eyebrow">LEVEL UP</span>
        <h2>⭐ ${esc(I.t('left'))}: ${player.levelUps}</h2>
        <div class="upgrade-grid">${cards}</div>
        ${rerolled ? '' : button(`${I.t('reroll')} · 💎${cost}`, 'reroll')}</section>`);
      panel.onclick = event => {
        const act = event.target.closest('[data-act]')?.dataset.act;
        if (act === 'reroll') {
          if (player.mats < cost || rerolled) return;
          player.mats -= cost; rerolled = true;
          choices = P.sim.rollUpgrades(player);
          draw(); return;
        }
        if (!act?.startsWith('pick')) return;
        const { id, value } = choices[Number(act.slice(4))];
        if (!id) return;
        player.stats[id] += value;
        if (id === 'maxHp') { player.maxHp += value; player.hp += value; }
        player.levelUps--;
        upgrades(player, cb);
      };
    }
    draw();
  }
  function shop(session, uid, cb) {
    const player = session.world?.players[uid] || P.main.localPlayer;
    const world = session.world || { wave: session.wave, rng: Math.random };
    const fresh = P.sim.shop(world, player);
    let cards = (P.main.offers || []).map((offer, index) => offer || fresh[index]);
    if (cards.length !== 4) cards = fresh;
    P.main.offers = cards;
    let count = P.main.shopRolls || 0;
    let selected = -1;
    let detail = -1;
    function draw() {
      activeRefresh = draw;
      const offers = cards.map((offer, index) => {
        // 구매한 칸은 리롤 전까지 비워 둔다(원작 방식 — 같은 상점에서 무한 구매로 능력치가 부풀지 않게).
        if (offer.sold) return `<article class="shop-card sold" aria-label="${esc(I.t('soldOut'))}">
          <div class="sold-mark">✔ ${esc(I.t('soldOut'))}</div><small>${esc(I.t('soldHint'))}</small></article>`;
        const name = I.name(offer.weapon ? 'weapons' : 'items', offer.id);
        const description = offer.weapon
          ? `${I.feature(offer.id)} · ${I.t('damage')} ${shown(D.weapons[offer.id].damage)}
             · ${I.t('cool')} ${Math.round(D.weapons[offer.id].cool * 1000)}ms
             · ${I.t('reach')} ${shown(D.weapons[offer.id].range)}`
          : I.itemEffect(offer.id) || I.name('items', offer.id);
        return `<article class="shop-card tier${offer.tier}${offer.locked ? ' is-locked' : ''}">
          ${offer.weapon ? weaponIcon(offer.id, offer.tier, 'shop-art') : icon('item_' + offer.id, 'shop-art')}
          <div class="shop-detail"><strong>${esc(name)} · ${esc(I.grade(offer.tier))}</strong>
          <small>${offer.weapon ? esc(description) : itemMarkup(offer.id)}</small><span class="price">💎${shown(offer.price)}
            ${offer.weapon ? ` · T${offer.tier}` : ''}</span></div>
          <div class="offer-actions">${button(offer.weapon && player.weapons.length >= P.sim.capacity(player)
            && !P.sim.canBuy({ ...player, mats: Infinity }, offer) ? '🈵' : I.t('buy'), `buy${index}`,
            P.sim.canBuy(player, offer) ? '' : 'cant')}
          ${button(offer.locked ? '🔒' : '🔓', `lock${index}`, 'lock-btn' + (offer.locked ? ' locked' : ''))}</div>
        </article>`;
      }).join('');
      const slots = Array.from({ length: P.sim.capacity(player) }, (_, i) => {
        const weapon = player.weapons[i];
        return `<button type="button" class="slot tier${weapon?.[1] || 1}
          ${selected === i ? 'selected' : ''}" data-act="slot${i}">
          ${weapon ? weaponIcon(weapon[0], weapon[1]) : '＋'}
          <span>${weapon ? `${esc(I.name('weapons', weapon[0]))} T${weapon[1]}${weapon[1] === D.MAX_WEAPON_TIER ? ' MAX' : ''}` : '—'}</span>
        </button>`;
      }).join('');
      const owned = [...new Set(player.items)].map(id => `<button type="button" class="owned-item" data-act="owned:${esc(id)}">
        ${icon('item_' + id)} ${esc(I.name('items', id))} ×${player.items.filter(x => x === id).length}</button>`).join('') || I.t('empty');
      const roster = Object.keys(session.players).map(id =>
        `${esc(displayName(session.players[id], id)).slice(0, 12)} ${session.ready.has(id) ? '✔' : '…'}`
      ).join('　');
      show(`<section class="shop-screen"><header class="shop-header">
        <h2>🛒 ${esc(I.t('shop'))}</h2><span>❤️ ${shown(player.hp)}/${shown(player.maxHp)}</span>
        <b>💎 ${shown(player.mats)}</b></header>
        <div class="shop-grid">${offers}</div><small class="weapon-min-tier">${esc(I.t('weapons'))}: avg T${num(P.sim.weaponMean(player))} → T${Math.min(6, Math.floor(P.sim.weaponMean(player)) + 1)}–T6 · ${esc(I.t('slotsFull'))}</small>
        <div class="shop-toolbar">${button(`${I.t('reroll')} · 💎${P.sim.shopRerollCost(player, session.wave, count, cards)}`, 'roll')}
          <small>${esc(I.t('freeRefill'))}</small><span class="shop-roster">${roster}</span><span class="shop-timer" aria-live="polite"></span></div>
        <div class="shop-divider">${esc(I.t('slots'))} · ${player.weapons.length}/${P.sim.capacity(player)}</div>
        <div class="set-bonuses">${Object.entries(P.sim.sets(player)).map(([key, value]) =>
          `${esc(I.setName(key))} ×${value.count}${value.stage ? ' ✔' : ''}`).join(' · ')}</div>
        <div id="shopSlots">${slots}</div>
        <div class="slot-actions">${button(I.t('merge'), 'merge')}
          ${button(I.t('sell'), 'sell')}${button('📊 ' + I.t('stats'), 'stats')}
          ${P.main?.debug && P.main?.solo ? button('🐞', 'debug', 'dbg-btn') : ''}</div>
        <div class="inventory"><b>${esc(I.t('items'))}</b><div>${owned}</div></div>
        ${button(I.t('ready'), 'ready', 'primary ready-btn')}
        ${detail >= 0 && cards[detail] && !cards[detail].sold ? `<aside class="detail-sheet" role="dialog">
          <h3>${esc(I.name(cards[detail].weapon ? 'weapons' : 'items', cards[detail].id))}</h3>
          <p>${cards[detail].weapon ? esc(I.feature(cards[detail].id)) : itemMarkup(cards[detail].id)}</p>
          ${button('×', 'closeDetail')}
        </aside>` : ''}
      </section>`);
      panel.onclick = event => {
        const act = event.target.closest('[data-act]')?.dataset.act;
        if (!act && event.target.closest('.shop-card')) {
          detail = [...panel.querySelectorAll('.shop-card')].indexOf(event.target.closest('.shop-card'));
          draw(); return;
        }
        if (!act) return;
        if (act === 'closeDetail') detail = -1;
        else if (act.startsWith('owned:')) { stats(() => player, act.slice(6)); return; }
        else if (act.startsWith('buy')) {
          const i = Number(act.slice(3));
          if (!cards[i]?.sold && P.sim.buy(player, cards[i])) {
            P.sfx?.('buy');
            cards[i] = { sold: true };
          }
        } else if (act.startsWith('lock')) {
          const i = Number(act.slice(4));
          if (!cards[i]?.sold) cards[i].locked = !cards[i].locked;
        } else if (act.startsWith('slot')) {
          selected = Number(act.slice(4));
        } else if (act === 'roll') {
          const price = P.sim.shopRerollCost(player, session.wave, count, cards);
          if (player.mats >= price) {
            player.mats -= price;
            count++;
            const rolled = P.sim.shop(world, player);
            cards = cards.map((offer, index) => offer.locked ? offer : rolled[index]);
            P.main.offers = cards;
          }
        } else if (act === 'merge') {
          P.sim.merge(player, selected);
        } else if (act === 'sell' && player.weapons[selected]) {
          const [id, tier] = player.weapons.splice(selected, 1)[0];
          player.mats += Math.floor(P.sim.price(D.weapons[id].price, session.wave) * tier * .5);
          selected = -1;
        } else if (act === 'stats') {
          stats(() => player); return;
        } else if (act === 'debug') {
          debugPanel(); return;
        } else if (act === 'ready') {
          hide();
          cb(player);
          return;
        }
        draw();
      };
    }
    draw();
  }
  // 무한 모드 선택(로컬 설정). 솔로·방장이 게임 시작 시 읽는다.
  function endlessMode() {
    try { return localStorage.getItem('spud_mode') === 'endless'; } catch { return false; }
  }
  function result(data, cb) {
    activeRefresh = () => result(data, cb);
    const endless = P.main?.session?.endless;
    show(`<h1>${esc(I.t(data.win ? 'win' : endless ? 'endlessOver' : 'lose'))}</h1>
      ${endless ? `<p class="endless-best">∞ ${esc(I.t('modeEndless'))} · WAVE ${data.wave}</p>` : ''}
      <p>${esc(I.t('wave'))} ${data.wave} · ${Object.entries(data.kills || {})
        .map(([uid, n]) => `${esc(uid).slice(0, 8)} ${n} KOs`).join(' / ')}</p>
      ${button(I.t('back'), 'back')}`);
    panel.onclick = event => { if (event.target.closest('[data-act]')) cb(); };
  }
  function ultimate(player, mode, blocked = false) {
    const btn = document.getElementById('ultBtn');
    if (!btn) return;
    const u = D.ults[player?.char], lang = I.language;
    const label = I.t?.('ultLabel') || (lang === 'ko' ? '필살기' : lang === 'zh-TW' ? '必殺技' : 'Ultimate');
    const name = u ? (lang === 'ko' ? u.name : lang === 'zh-TW' ? u.zh : u.en) : label;
    const text = `⚡ ${name} · U${player?.ultUsed ? ' · ' + (I.t?.('ultUsed') || 'Used') : ''}`;
    if (btn.textContent !== text) btn.textContent = text;
    btn.title = u ? ultDescription(player.char) : label;
    btn.setAttribute('aria-label', btn.title);
    btn.hidden = mode !== 'wave';
    btn.style.display = mode === 'wave' ? '' : 'none';
    btn.disabled = !u || mode !== 'wave' || blocked || !player?.alive || !(player.hp > 0) || !!player.ultUsed;
  }
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsPanel = document.getElementById('settingsPanel');
  function closeSettings(focus = true) {
    if (!settingsPanel || settingsPanel.hidden) return;
    settingsPanel.hidden = true;
    settingsBtn.setAttribute('aria-expanded', 'false');
    if (focus) settingsBtn.focus();
  }
  function placeSettings() {
    const field = document.getElementById('field').getBoundingClientRect();
    const button = settingsBtn.getBoundingClientRect();
    settingsPanel.style.top = Math.max(0, button.bottom - field.top + 4) + 'px';
    const panelWidth = Math.min(280, field.width - 16);
    settingsPanel.style.right = Math.max(4, Math.min(field.width - panelWidth - 4, field.right - button.right)) + 'px';
  }
  if (settingsBtn && settingsPanel) {
    root.addEventListener?.('resize', () => { if (!settingsPanel.hidden) placeSettings(); });
    settingsBtn.onclick = () => {
      if (!settingsPanel.hidden) { closeSettings(); return; }
      P.main?.clearInput?.();
      placeSettings();
      settingsPanel.hidden = false;
      settingsBtn.setAttribute('aria-expanded', 'true');
      document.getElementById('settingsClose').focus();
    };
    document.getElementById('settingsClose').onclick = () => closeSettings();
    document.getElementById('settingsLandscape').onclick = landscape;
    document.addEventListener?.('pointerdown', event => {
      if (!settingsPanel.hidden && !settingsPanel.contains(event.target) && !settingsBtn.contains(event.target)) closeSettings(false);
    });
    root.addEventListener?.('keydown', event => {
      if (event.key === 'Escape' && !settingsPanel.hidden) { event.preventDefault(); closeSettings(); }
    });
  }
  P.ui = {
    settingsOpen: () => !!settingsPanel && !settingsPanel.hidden,
    ultimate, endlessMode, title, choose, hud, crates, upgrades, shop, result, hide, show,
    stats, debugPanel, collection, closeSheet,
    sheetOpen: () => !!sheetEl && !sheetEl.hidden,
    t: key => I.t(key),
    language: () => I.language,
    toggle() {
      I.toggle();
      if (activeRefresh) activeRefresh(); else P.main?.refresh();
      if (sheetDraw && !sheetEl.hidden) sheetDraw();
    }
  };
  document.getElementById('lang').onclick = () => P.ui.toggle();
})(window);
