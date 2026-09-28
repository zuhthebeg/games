(function (root) {
  'use strict';
  const P = root.SPUD;
  const D = P.data;
  const S = P.sim;
  const N = P.net;
  const U = P.ui;
  let session = null;
  let lobby = null;
  let renderer = null;
  let uid = 'solo';
  let mode = 'title';
  let localPlayer = null;
  let offers = null;
  let rewarded = false;
  let last = 0;
  let stick = null;
  let pendingResync = null;
  let walletPromise;
  let roster = { players: [], hostUser: null };
  const keys = new Set();
  let cratesRemaining = 0;
  let shopRolls = 0;
  let lastSave = 0;
  const solo = () => uid === 'solo' && session?.isHost && !lobby &&
    Object.keys(session.players).length === 1;
  // 디버그 모드: ?debug=1(탭 세션 유지) / ?debug=0 해제. 디버그 런은 보상·랭킹·도감 기록 금지.
  const DEBUG_RUN_KEY = 'spudsquad:solo:dbg';
  let debugOn = false;
  try {
    const store = typeof sessionStorage !== 'undefined' ? sessionStorage : null;
    debugOn = P.collection?.debugFlag ? P.collection.debugFlag(location.search, store)
      : new URLSearchParams(location.search).get('debug') === '1';
  } catch {}
  let tainted = false; // 디버그로 시작/조작한 솔로 런(새로고침 후 ?debug=0이어도 보상 금지)
  const debugView = { god: false, ranges: false };
  const debugRun = () => debugOn || tainted;
  function markTainted(on) {
    tainted = on;
    try { on ? localStorage.setItem(DEBUG_RUN_KEY, '1') : localStorage.removeItem(DEBUG_RUN_KEY); } catch {}
  }
  // 웨이브 클리어(또는 승리) 시 로컬 플레이어 기준으로 도감 기록. 로그인 여부는 collection.add가 판단.
  function recordClear(wave, win = false) {
    if (debugRun()) return;
    const p = session?.world?.players[uid] || localPlayer;
    if (!p?.char) return;
    try {
      P.collection?.add?.({ char: p.char, wave, win,
        weapons: (p.weapons || []).map(v => v[0]), items: p.items || [] });
    } catch (error) { console.warn('collection pending', error); }
  }
  function checkpoint(force = false) {
    if (!solo() || !session.world || !['wave', 'shop'].includes(mode)) return;
    const now = Date.now();
    if (!force && now - lastSave < 3000) return;
    try {
      if (S.soloSave.save(localStorage, { mode, world: session.world, offers,
        cratesRemaining, shopRolls }, now)) lastSave = now;
    } catch {} // blocked browser storage is non-fatal
  }
  function restoreSolo() {
    let saved;
    try { saved = S.soloSave.load(localStorage); } catch { return false; }
    if (!saved) return false;
    uid = 'solo';
    try { tainted = localStorage.getItem(DEBUG_RUN_KEY) === '1'; } catch {}
    session = new N.Session({ uid, host: uid, rng: Math.random,
      onAction: handleAction, onEnd: finish, sendRt: data => renderer.fx(data.fx, uid) });
    session.roster({ players: [{ user: uid }], hostUser: uid });
    session.world = saved.world;
    session.wave = saved.world.wave;
    session.endless = !!saved.world.endless;
    session.lastPlayers = { solo: { char: saved.world.players.solo.char } };
    session.pick.solo = saved.world.players.solo.char;
    offers = saved.offers;
    cratesRemaining = saved.cratesRemaining;
    shopRolls = saved.shopRolls;
    mode = saved.mode;
    if (mode === 'shop') {
      const player = session.world.players.solo;
      U.crates(session, player, cratesRemaining,
        () => U.upgrades(player, () => U.shop(session, uid, ready)));
    } else U.hide();
    return true;
  }


  function getUid() {
    try {
      let value = localStorage.getItem('spud_uid');
      if (!value) {
        value = 'u-' + Math.random().toString(36).slice(2, 10);
        localStorage.setItem('spud_uid', value);
      }
      return value;
    } catch {
      return 'u-' + Math.random().toString(36).slice(2, 10);
    }
  }
  function scene() {
    if (session?.isHost) return session.world;
    const snap = session?.buffer.sample(Date.now());
    if (!snap || !localPlayer) return snap;
    return { ...snap, pl: snap.pl.map(row => row[0] === uid
      ? [row[0], Math.round(localPlayer.x), Math.round(localPlayer.y), ...row.slice(3)]
      : row) };
  }
  function selected(char) {
    mode = 'select-wait';
    if (Object.keys(session.players).length > 1) U.show(`<h2>🥔 ${U.t('wait')}</h2>`, true);
    session.local({ type: 'PICK', payload: { uid, char } });
  }
  function beginSolo() {
    uid = 'solo';
    lobby = null;
    try { S.soloSave.clear(localStorage); } catch {} // storage disabled
    markTainted(debugOn);
    offers = null;
    cratesRemaining = shopRolls = 0;
    session = new N.Session({
      uid, host: uid, rng: Math.random, onAction: handleAction, onEnd: finish,
      sendRt: data => renderer.fx(data.fx, uid)
    });
    session.roster({ players: [{ user: uid }], hostUser: uid });
    session.endless = !!U.endlessMode?.();
    mode = 'select';
    U.choose(selected);
  }
  function connect() {
    uid = getUid();
    mode = 'lobby';
    lobby = new MultiplayerLobby({
      gameType: 'spudsquad', gameName: '감자특공대', minPlayers: 1, maxPlayers: 4,
      userId: uid, walletReady: walletPromise,
      onGameEvent(type, event) {
        if (type !== 'event') return;
        const action = event?.data;
        if (action?.type === '__resync' && action.__snapshot) {
          pendingResync = action.__snapshot;
          if (session) session.receive({ type: 'WAVE_START', payload: action.__snapshot });
          else if (lobby?._roster?.started) {
            setTimeout(() => onRosterChanged(lobby._roster), 0);
          }
          return;
        }
        if (action?.type) session?.receive(action, event.seq);
      },
      onLeave() { reset(); },
      onLocal() { beginSolo(); }
    });
    const wrap = () => {
      const ws = lobby._ws;
      if (!ws || ws._spudHook) return false;
      ws._spudHook = true;
      const started = ws.onStarted;
      ws.onStarted = data => { started?.(data); onStarted(data); };
      const onRoster = ws.onRoster;
      ws.onRoster = data => { onRoster?.(data); roster = data; onRosterChanged(data); };
      ws.onRt = (from, data) => session?.rt(from, data);
      if (lobby._roster?.started) onRosterChanged(lobby._roster);
      return true;
    };
    const poll = setInterval(() => {
      if (wrap() || mode === 'title') clearInterval(poll);
    }, 50);
  }
  function onStarted(data) {
    const host = roster.hostUser || data.players?.[0] || uid;
    session = new N.Session({
      uid, host, sendAction: action => lobby._ws.sendAction(action),
      sendRt: packet => { renderer.fx(packet.fx, uid); lobby._ws.sendRt(packet); },
      onSnapshot: packet => renderer.fx(packet.fx, uid),
      onAction: handleAction, onEnd: finish
    });
    session.sendAction.echo = true;
    session.endless = !!U.endlessMode?.(); // 방장 설정만 WAVE_START로 전파된다
    session.roster(roster.players?.length ? roster : {
      players: (data.players || [uid]).map(user => ({ user })), hostUser: host
    });
    mode = 'select';
    U.choose(selected);
    if (session.isHost) {
      setTimeout(() => {
        if (!session || session.wave !== 0) return;
        for (const id of Object.keys(session.players)) {
          if (!session.pick[id]) session.pick[id] = 'basic';
        }
        session.start(1);
      }, 20000);
    }
  }
  function onRosterChanged(data) {
    if (!session && data.started && pendingResync) {
      onStarted({ players: data.players.map(player => player.user) });
      session.receive({ type: 'WAVE_START', payload: pendingResync });
      pendingResync = null;
    }
    const oldHost = session?.host;
    session?.roster(data);
    if (!session?.wave) return;
    if (oldHost && oldHost !== data.hostUser && uid !== oldHost) {
      mode = 'end';
      U.show('<h2>호스트가 나갔습니다</h2><button class="btn" id="returnLobby">대기실로</button>');
      document.getElementById('returnLobby').onclick = () => {
        lobby?.goToWaitingRoom();
        reset();
      };
    }
  }
  function handleAction(action) {
    if (action.type === 'WAVE_START') {
      mode = 'wave';
      cratesRemaining = shopRolls = 0;
      offers = (offers || []).map(offer => offer.locked ? offer : null);
      U.hide();
      if (!session.isHost) {
        const data = action.payload.players[uid];
        localPlayer = S.createPlayer(uid, data?.char || 'basic', data || {});
        session.buffer.a = [];
      }
      checkpoint(true);
    }
    if (action.type === 'WAVE_END') {
      mode = 'shop';
      // 무한 모드에서 20웨이브(보스) 돌파 = 해당 캐릭터 클리어로 기록
      recordClear(action.payload.w, !!session?.endless && action.payload.w === 20);
      const player = session.world?.players[uid] || localPlayer;
      const levelUps = action.payload.players?.[uid]?.levelUps || 0;
      if (solo()) cratesRemaining = action.payload.players?.[uid]?.crates || 0;
      if (player) {
        player.mats = action.payload.players?.[uid]?.mats ?? player.mats;
        // 게스트 사본은 호스트가 웨이브 중 바꾼 스탯을 받아 맞춘다(READY 로드아웃이 덮어쓰므로)
        if (!session.isHost && action.payload.players?.[uid]?.stats) player.stats = { ...action.payload.players[uid].stats };
        player.levelUps = levelUps;
        S.enterShop(player, session.world?.rng || Math.random); // 모루 등 상점 입장 훅(자기 플레이어 1회)
        U.crates(session, player, action.payload.players?.[uid]?.crates || 0,
          () => U.upgrades(player, () => U.shop(session, uid, ready)));
      } else U.shop(session, uid, ready);
      checkpoint(true);
      if (session.isHost) {
        setTimeout(() => {
          if (session && session.wave === action.payload.w &&
              (mode === 'shop' || mode === 'ready')) session.next();
        }, 45000);
      }
    }
    if (action.type === 'READY' && (mode === 'shop' || mode === 'ready') && session.isHost &&
        session.ready.size === Object.keys(session.players).length) session.next();
  }
  function ready(player) {
    // 대기 화면은 READY 전송 '전에' 띄운다. 솔로는 READY가 동기로 다음 웨이브를 시작하므로
    // 뒤에 띄우면 진행 중인 웨이브 위에 '동료를 기다리는 중'이 덮여 멈춘 것처럼 보였다.
    mode = 'ready';
    if (Object.keys(session.players).length > 1) U.show(`<h2>${U.t('wait')}</h2>`);
    session.local({ type: 'READY', payload: { uid, loadout: {
      weapons: player.weapons, items: player.items, stats: player.stats, mats: player.mats,
      pending: player.pending
    } } });
  }
  function finish(data) {
    if (mode === 'end') return;
    mode = 'end';
    if (solo()) { try { S.soloSave.clear(localStorage); } catch {} }
    U.result(data, () => {
      if (lobby) { lobby.goToWaitingRoom(); reset(); }
      else reset();
    });
    if (rewarded) return;
    rewarded = true;
    if (debugRun()) return; // 디버그 런: 골드·랭킹·도감 모두 건너뜀
    if (data.win) recordClear(data.wave || 20, true);
    const cleared = data.win ? data.wave : Math.max(0, data.wave - 1);
    const gold = cleared * 30 + (data.win || (session?.endless && cleared >= 20) ? 500 : 0);
    try {
      if (typeof SharedWallet !== 'undefined' && SharedWallet.addGold) {
        SharedWallet.addGold(gold, 'spudsquad');
      }
    } catch (error) { console.warn('reward pending', error); }
    try {
      const kills = Object.values(data.kills || {}).reduce((sum, n) => sum + n, 0);
      GameRankings.submit('spudsquad', { score: data.wave * 1000 + kills });
    } catch (error) { console.warn('rank pending', error); }
  }
  function reset() {
    session = null;
    lobby = null;
    mode = 'title';
    rewarded = false;
    tainted = false; // 솔로 복원 시 restoreSolo가 저장된 표시를 다시 읽는다
    U.closeSheet?.();
    U.title(action => action === 'solo' ? beginSolo()
      : action === 'collection' ? U.collection(reset) : connect());
  }
  // 스탯 시트용 로컬 플레이어. 게스트 클라는 HP만 최신 스냅샷에서 덮어쓴 사본(원본 불변).
  function statsPlayer() {
    if (!session) return null;
    if (session.isHost) return session.world?.players[uid] || null;
    if (!localPlayer) return null;
    const row = session.buffer.sample(Date.now())?.pl?.find(r => r[0] === uid);
    return row ? { ...localPlayer, hp: row[3], maxHp: row[4] } : localPlayer;
  }
  function debugAct(name, a = {}) {
    if (!debugOn || !solo()) return U.t('soloOnly');
    const w = session.world, p = w?.players[uid];
    if (!p) return '';
    markTainted(true);
    const int = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(Number(v) || 0)));
    let note = U.t('done');
    if (name === 'weapon') {
      const tier = int(a.tier, 1, 4);
      if (!D.weapons[a.weapon]) return '';
      if (p.weapons.length >= S.capacity(p)) return U.t('slotsFull');
      p.weapons.push([a.weapon, tier]);
      note = `+ ${P.i18n.name('weapons', a.weapon)} T${tier}`;
    } else if (name === 'item') {
      if (!S.grantItem(p, a.item)) return U.t('capped');
      note = `+ ${P.i18n.name('items', a.item)}`;
    } else if (name === 'mats') {
      p.mats = int(a.mats, 0, 99999);
      note = `💎 ${p.mats}`;
    } else if (name === 'wave') {
      // 현재 웨이브를 끝내고 지금 장비 그대로 N웨이브 시작
      U.closeSheet();
      session.start(int(a.wave, 1, session.endless ? 99 : 20));
      return '';
    } else if (name === 'god') {
      debugView.god = !debugView.god;
    } else if (name === 'ranges') {
      debugView.ranges = !debugView.ranges;
    } else if (name === 'kill' || name === 'spawn') {
      if (mode !== 'wave' || w.ended) return U.t('waveOnly');
      if (name === 'kill') {
        for (let pass = 0; pass < 3 && w.enemies.length; pass++) {
          for (const e of w.enemies.slice()) { e.hp = 0; S.kill(w, e, uid); }
        }
        w.shots.length = 0;
        w.bullets.length = 0;
      } else if (D.enemies[a.enemy]) {
        const n = int(a.n, 1, 50);
        for (let i = 0; i < n; i++) {
          const angle = Math.PI * 2 * i / n, r = 220 + (i % 3) * 30;
          S.spawn(w, a.enemy, S.clamp(p.x + Math.cos(angle) * r, 0, D.W),
            S.clamp(p.y + Math.sin(angle) * r, 0, D.H));
        }
        note = `${P.i18n.enemy(a.enemy)} ×${n}`;
      }
    }
    checkpoint(true);
    return note;
  }
  function move(dt) {
    const player = session.isHost ? session.world?.players[uid] : localPlayer;
    if (!player?.alive) return;
    let dx = Number(keys.has('d') || keys.has('ArrowRight')) -
      Number(keys.has('a') || keys.has('ArrowLeft'));
    let dy = Number(keys.has('s') || keys.has('ArrowDown')) -
      Number(keys.has('w') || keys.has('ArrowUp'));
    if (stick) { dx += stick.dx; dy += stick.dy; }
    const length = Math.hypot(dx, dy);
    if (length > 1) { dx /= length; dy /= length; }
    // 가속 0.07s·감속 0.09s 관성: 즉각 반응하되 멈춤/출발이 부드럽게. 키보드는 풀속, 패드는 기울기 비례.
    const speed = 200 * (1 + S.effectiveStats(player).speed / 100);
    const tx = dx * speed, ty = dy * speed;
    const k = 1 - Math.exp(-dt / (length > 0 ? .07 : .09));
    player.vx = (player.vx || 0) + (tx - (player.vx || 0)) * k;
    player.vy = (player.vy || 0) + (ty - (player.vy || 0)) * k;
    if (Math.abs(player.vx) < 1 && Math.abs(player.vy) < 1 && !length) { player.vx = 0; player.vy = 0; }
    if (dx) player.f = dx < 0 ? -1 : 1;
    player.x = S.clamp(player.x + player.vx * dt, 0, D.W);
    player.y = S.clamp(player.y + player.vy * dt, 0, D.H);
    if (!session.isHost) {
      return { dx, dy, x: player.x, y: player.y, f: player.f, move() {} };
    }
  }
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(.1, (now - last) / 1000 || 0);
    last = now;
    // 배경음: 전투(10·20웨이브는 보스곡) / 그 외 화면은 상점곡. 같은 곡이면 music()이 무시.
    P.sfx?.music?.(mode === 'wave' ? ((session?.wave % 10 === 0) ? 'boss' : 'battle') : 'shop');
    // 솔로에서 스탯 시트/디버그 패널이 열려 있으면 시뮬레이션 정지(그리기만)
    const hold = solo() && U.sheetOpen?.();
    if (debugBtn) debugBtn.hidden = !(debugOn && solo());
    if (session && mode === 'wave' && hold) {
      const view = scene();
      if (view) renderer.draw(view, uid, now);
    } else if (session && mode === 'wave') {
      if (debugOn && debugView.god && session.isHost) {
        const me = session.world?.players[uid]; // 무적: 피격 무적시간을 계속 채워 hurtPlayer를 막는다
        if (me) me.immune = Math.max(me.immune || 0, .2);
      }
      if (session.isHost) { move(dt); session.update(dt); }
      else { const input = move(dt); session.update(dt, input); }
      const view = scene();
      if (view) { U.hud(view, uid); renderer.draw(view, uid, now); }
      checkpoint();
    } else if (renderer) renderer.draw(null, uid, now);
  }
  let debugBtn = null;
  document.addEventListener('DOMContentLoaded', () => {
    walletPromise = typeof SharedWallet !== 'undefined'
      ? SharedWallet.init() : Promise.resolve();
    // 로그인 확인 뒤 도감(서버+로컬 병합) 로드
    Promise.resolve(walletPromise).catch(() => {}).then(() => P.collection?.load?.()).catch(() => {});
    const statsBtn = document.getElementById('statsBtn');
    if (statsBtn) statsBtn.onclick = () => { if (statsPlayer()) U.stats(statsPlayer); };
    debugBtn = document.getElementById('debugBtn');
    if (debugBtn) debugBtn.onclick = () => U.debugPanel?.();
    if (debugOn && document.body) {
      const badge = document.createElement('div');
      badge.id = 'debugBadge';
      badge.textContent = 'DEBUG';
      document.body.appendChild(badge);
    }
    renderer = new P.render.Renderer(document.getElementById('canvas'));
    document.getElementById('sound').onclick = () => {
      document.getElementById('sound').textContent = P.sfx.mute() ? '🔇' : '🔊';
    };
    const musicBtn = document.getElementById('music');
    const paintMusic = on => { musicBtn.textContent = on ? '🎵' : '🎵̸'; musicBtn.style.opacity = on ? 1 : .45; };
    paintMusic(P.sfx.settings().musicOn);
    musicBtn.onclick = () => paintMusic(P.sfx.toggleMusic());
    if (P.sfx.settings().muted) document.getElementById('sound').textContent = '🔇';
    document.getElementById('volume').value = P.sfx.settings().volume * 100;
    document.getElementById('volume').oninput = event => P.sfx.volume(event.target.value / 100);
    document.getElementById('shake').onclick = () => {
      document.getElementById('shake').textContent = renderer.effects.toggleShake() ? '📳' : '🚫';
    };
    try { GameRankings.injectNavButton('spudsquad'); }
    catch (error) { console.warn('rank nav unavailable', error); }
    reset();
    // A multiplayer room link always takes precedence over a local SOLO checkpoint.
    if (!new URLSearchParams(location.search).has('room')) restoreSolo();
    requestAnimationFrame(frame);
    if (new URLSearchParams(location.search).has('room')) connect();
  });
  window.addEventListener('keydown', event => {
    keys.add(event.key.length === 1 ? event.key.toLowerCase() : event.key);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) {
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', event => {
    keys.delete(event.key.length === 1 ? event.key.toLowerCase() : event.key);
  });
  const canvas = document.getElementById('canvas');
  // 가상 패드: 필드 아무 곳이나 누르면 그 자리에 조이스틱이 뜬다(플로팅). 손 떼면 좌하단에 옅은 힌트로 복귀.
  // 아날로그 입력(데드존 0.12, 반경 64px), 멀티터치 중 첫 손가락만 추적.
  const pad = document.getElementById('pad'), knob = document.getElementById('padKnob');
  const PAD_R = 64;
  const padHome = () => {
    pad.classList.remove('active');
    pad.style.left = ''; pad.style.top = '';
    knob.style.transform = 'translate(-50%, -50%)';
  };
  canvas.addEventListener('pointerdown', event => {
    if (stick) return;
    const box = canvas.getBoundingClientRect();
    stick = { id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, dy: 0 };
    canvas.setPointerCapture(event.pointerId);
    pad.classList.add('active');
    pad.style.left = (event.clientX - box.left) + 'px';
    pad.style.top = (event.clientY - box.top) + 'px';
  });
  canvas.addEventListener('pointermove', event => {
    if (!stick || event.pointerId !== stick.id) return;
    let ox = event.clientX - stick.x, oy = event.clientY - stick.y;
    const d = Math.hypot(ox, oy);
    if (d > PAD_R) { ox *= PAD_R / d; oy *= PAD_R / d; }
    const m = Math.min(1, d / PAD_R);
    const a = m < .12 ? 0 : (m - .12) / .88; // 데드존 후 재정규화
    stick.dx = d ? ox / Math.min(d, PAD_R) * a : 0;
    stick.dy = d ? oy / Math.min(d, PAD_R) * a : 0;
    knob.style.transform = `translate(calc(-50% + ${ox}px), calc(-50% + ${oy}px))`;
  });
  const release = event => { if (stick && event.pointerId === stick.id) { stick = null; padHome(); } };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  document.addEventListener('visibilitychange', () => { last = performance.now(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) checkpoint(true);
  });
  window.addEventListener('pagehide', () => { checkpoint(true); P.collection?.flush?.(); });
  // UI buttons are handled synchronously on #panel. Observe the completed action
  // without rebinding its handlers or re-running any simulation callback.
  let beforeShopOffers;
  document.addEventListener('click', event => {
    if (!solo() || mode !== 'shop') return;
    if (event.target.closest('[data-act="roll"]')) beforeShopOffers = offers;
  }, true);
  document.addEventListener('click', event => {
    if (!solo() || mode !== 'shop') return;
    const act = event.target.closest('[data-act]')?.dataset.act;
    if ((act === 'take' || act === 'recycle') && cratesRemaining > 0) cratesRemaining--;
    if (act === 'roll' && beforeShopOffers !== offers) shopRolls++;
    beforeShopOffers = null;
    if (act) checkpoint(true);
  });
  P.main = {
    get session() { return session; },
    get localPlayer() { return localPlayer; },
    get offers() { return offers; },
    set offers(value) { offers = value; },
    get shopRolls() { return shopRolls; },
    get solo() { return !!solo(); },
    get debug() { return debugOn; },
    get debugView() { return debugOn ? debugView : null; },
    debugAct,
    resize() { renderer?.resize(); },
    refresh() { if (mode === 'title') reset(); }
  };
})(window);
