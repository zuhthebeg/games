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
  const label = (key, n) => `<span class="stat-change ${n < 0 ? 'negative' : 'positive'}">${esc(I.stat(key))} ${n > 0 ? '+' : ''}${n}</span>`;
  const icon = (id, kind = '') =>
    `<img class="${kind}" src="assets/${esc(id)}.webp" alt="" onerror="this.hidden=true">`;
  const button = (text, act, extra = '') =>
    `<button type="button" class="btn ${extra}" data-act="${act}">${esc(text)}</button>`;

  function show(html, menu = false) {
    panel.innerHTML = html;
    overlay.style.display = 'flex';
    document.body.classList.toggle('menu-mode', menu);
    hudEl.setAttribute('aria-hidden', String(menu));
    requestAnimationFrame(() => P.main?.resize?.());
  }
  function hide() {
    overlay.style.display = 'none';
    document.body.classList.remove('menu-mode');
    hudEl.setAttribute('aria-hidden', 'false');
    activeRefresh = null;
    requestAnimationFrame(() => P.main?.resize?.());
  }
  function title(cb) {
    activeRefresh = () => title(cb);
    show(`<section class="title-screen">
      ${icon('key_art', 'key-art')}
      <div class="title-copy"><span class="eyebrow">1–4 PLAYER · CO-OP SURVIVAL</span>
      <h1>${esc(I.t('title'))}</h1><p>${esc(I.t('subtitle'))}</p>
      <div class="title-actions">${button(I.t('solo'), 'solo', 'primary large')}
      ${button(I.t('multi'), 'multi', 'large')}</div></div>
    </section>`, true);
    panel.onclick = event => {
      const act = event.target.closest('[data-act]')?.dataset.act;
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
  function hud(scene, uid) {
    if (!scene) return;
    const p = scene.pl?.find(row => row[0] === uid) || scene.players?.[uid];
    if (!p) return;
    const hp = Array.isArray(p) ? p[3] : p.hp;
    const max = Array.isArray(p) ? p[4] : p.maxHp;
    const mats = Array.isArray(p) ? p[6] : p.mats;
    const xp = Array.isArray(p) ? p[7] : p.xp;
    const lvl = Array.isArray(p) ? p[8] : p.lvl;
    document.getElementById('hpText').textContent = `${Math.ceil(hp)}/${max}`;
    document.getElementById('hpBar').style.width = Math.max(0, hp / max * 100) + '%';
    document.getElementById('xpBar').style.width = xp / P.sim.needXp(lvl) * 100 + '%';
    document.getElementById('level').textContent = lvl;
    document.getElementById('mats').textContent = mats;
    document.getElementById('wave').textContent = P.main?.session?.wave || 1;
    const remaining = scene.tm ?? P.main?.session?.world?.tm ?? 0;
    document.getElementById('timer').textContent =
      P.main?.session?.wave === 20 && remaining <= 0 ? 'BOSS' : Math.ceil(remaining);
    const members = scene.pl || Object.values(scene.players || {}).map(v =>
      [v.uid, v.x, v.y, v.hp, v.maxHp, v.alive]
    );
    document.getElementById('team').innerHTML = members.filter(v => v[0] !== uid)
      .map(v => {
        const member = P.main?.session?.players?.[v[0]];
        const char = P.main?.session?.lastPlayers?.[v[0]]?.char || 'basic';
        return `<div>${icon('char_' + char)} ${esc(member?.nick || v[0]).slice(0, 12)}
          ${v[5] ? `❤️${Math.ceil(v[3])}/${v[4]}` : '👻'}</div>`;
      })
      .join('');
  }
  function crates(session, player, count, cb) {
    if (!count) { cb(); return; }
    const world = session.world || { wave: session.wave, rng: Math.random };
    const id = P.sim.rollCrateItem(world, player);
    const item = D.items[id];
    activeRefresh = () => crates(session, player, count, cb);
    show(`<section class="upgrade-screen"><h2>📦 ${esc(I.t('crate'))}</h2>
      <article class="shop-card tier${item.tier || 1}">${icon('item_' + id, 'shop-art')}
      <strong>${esc(I.name('items', id))}</strong><small>${esc(I.effect(item.stats).join(' · '))}</small></article>
      ${button(I.t('take'), 'take', 'primary')}
      ${button(`${I.t('recycle')} · 💎${Math.floor(item.price / 2)}`, 'recycle')}</section>`);
    panel.onclick = event => {
      const act = event.target.closest('[data-act]')?.dataset.act;
      if (act !== 'take' && act !== 'recycle') return;
      if (act === 'take') P.sim.grantItem(player, id);
      else player.mats += Math.floor(item.price / 2);
      P.sfx?.('buy');
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
        const now = player.stats[id];
        const next = now + value;
        const glyph = { maxHp: '❤️', dmg: '⚔️', atkSpd: '⚡', melee: '🥊',
          ranged: '🎯', armor: '🛡️', speed: '👟', crit: '💥', range: '🔭',
          regen: '🩹', dodge: '🪶', luck: '🍀', harvest: '🌱', elemental: '🔥',
          explosion: '💣', thorns: '🌵', knockback: '💫' }[id];
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
    let count = 0;
    let selected = -1;
    let showStats = false;
    let detail = -1;
    function draw() {
      activeRefresh = draw;
      const offers = cards.map((offer, index) => {
        const name = I.name(offer.weapon ? 'weapons' : 'items', offer.id);
        const description = offer.weapon
          ? `${I.feature(offer.id)} · ${I.t('damage')} ${D.weapons[offer.id].damage}
             · ${I.t('cool')} ${D.weapons[offer.id].cool}${I.t('seconds')}
             · ${I.t('reach')} ${D.weapons[offer.id].range}`
          : I.effect(D.items[offer.id].stats).join(' · ') || I.name('items', offer.id);
        return `<article class="shop-card tier${offer.tier}">
          ${icon((offer.weapon ? 'weapon_' : 'item_') + offer.id, 'shop-art')}
          <div class="shop-detail"><strong>${esc(name)} · ${esc(I.grade(offer.tier))}</strong>
          <small>${esc(description)}</small><span class="price">💎${offer.price}
            ${offer.weapon ? ` · T${offer.tier}` : ''}</span></div>
          <div class="offer-actions">${button(I.t('buy'), `buy${index}`)}
          ${button(offer.locked ? '🔓' : '🔒', `lock${index}`, 'lock-btn')}</div>
        </article>`;
      }).join('');
      const slots = Array.from({ length: P.sim.capacity(player) }, (_, i) => {
        const weapon = player.weapons[i];
        return `<button type="button" class="slot tier${weapon?.[1] || 1}
          ${selected === i ? 'selected' : ''}" data-act="slot${i}">
          ${weapon ? icon('weapon_' + weapon[0]) : '＋'}
          <span>${weapon ? `${esc(I.name('weapons', weapon[0]))} T${weapon[1]}` : '—'}</span>
        </button>`;
      }).join('');
      const owned = player.items.map(id => `<span class="owned-item">
        ${icon('item_' + id)} ${esc(I.name('items', id))}</span>`).join('') || I.t('empty');
      const stats = Object.entries(P.sim.effectiveStats(player)).map(([key, value]) =>
        `<span>${esc(I.stat(key))}: <b>${Math.round(value * 10) / 10}</b></span>`
      ).join('');
      const roster = Object.keys(session.players).map(id =>
        `${esc(session.players[id]?.nick || id).slice(0, 12)} ${session.ready.has(id) ? '✔' : '…'}`
      ).join('　');
      show(`<section class="shop-screen"><header class="shop-header">
        <h2>🛒 ${esc(I.t('shop'))}</h2><span>❤️ ${Math.ceil(player.hp)}/${player.maxHp}</span>
        <b>💎 ${player.mats}</b></header>
        <div class="shop-grid">${offers}</div>
        <div class="shop-toolbar">${button(`${I.t('reroll')} · 💎${player.char === 'basic' && !count
          ? 0 : P.sim.rerollCost(session.wave, count)}`, 'roll')}
          <span class="shop-roster">${roster}</span></div>
        <div class="shop-divider">${esc(I.t('slots'))} · ${player.weapons.length}/${P.sim.capacity(player)}</div>
        <div class="set-bonuses">${Object.entries(P.sim.sets(player)).map(([key, value]) =>
          `${esc(key)} ${value.count} (${value.stage || '—'})`).join(' · ')}</div>
        <div id="shopSlots">${slots}</div>
        <div class="slot-actions">${button(I.t('merge'), 'merge')}
          ${button(I.t('sell'), 'sell')}${button(I.t('stats'), 'stats')}</div>
        <div class="inventory"><b>${esc(I.t('items'))}</b><div>${owned}</div></div>
        <div id="stats" class="stat-panel" style="display:${showStats ? 'grid' : 'none'}">${stats}</div>
        ${button(I.t('ready'), 'ready', 'primary ready-btn')}
        ${detail >= 0 ? `<aside class="detail-sheet" role="dialog">
          <h3>${esc(I.name(cards[detail].weapon ? 'weapons' : 'items', cards[detail].id))}</h3>
          <p>${esc(cards[detail].weapon ? I.feature(cards[detail].id)
            : I.effect(D.items[cards[detail].id].stats).join(' · '))}</p>
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
        else if (act.startsWith('buy')) {
          const i = Number(act.slice(3));
          if (P.sim.buy(player, cards[i])) {
            P.sfx?.('buy');
            cards[i] = P.sim.shop(world, player)[0];
          }
        } else if (act.startsWith('lock')) {
          const i = Number(act.slice(4));
          cards[i].locked = !cards[i].locked;
        } else if (act.startsWith('slot')) {
          selected = Number(act.slice(4));
        } else if (act === 'roll') {
          const price = player.char === 'basic' && !count ? 0 : P.sim.rerollCost(session.wave, count);
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
          showStats = !showStats;
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
  function result(data, cb) {
    activeRefresh = () => result(data, cb);
    show(`<h1>${esc(I.t(data.win ? 'win' : 'lose'))}</h1>
      <p>${esc(I.t('wave'))} ${data.wave} · ${Object.entries(data.kills || {})
        .map(([uid, n]) => `${esc(uid).slice(0, 8)} ${n} KOs`).join(' / ')}</p>
      ${button(I.t('back'), 'back')}`);
    panel.onclick = event => { if (event.target.closest('[data-act]')) cb(); };
  }
  P.ui = {
    title, choose, hud, crates, upgrades, shop, result, hide, show,
    t: key => I.t(key),
    language: () => I.language,
    toggle() { I.toggle(); if (activeRefresh) activeRefresh(); else P.main?.refresh(); }
  };
  document.getElementById('lang').onclick = () => P.ui.toggle();
})(window);
