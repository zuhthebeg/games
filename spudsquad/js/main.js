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
    session = new N.Session({
      uid, host: uid, rng: Math.random, onAction: handleAction, onEnd: finish,
      sendRt: data => renderer.fx(data.fx, uid)
    });
    session.roster({ players: [{ user: uid }], hostUser: uid });
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
      offers = (offers || []).map(offer => offer.locked ? offer : null);
      U.hide();
      if (!session.isHost) {
        const data = action.payload.players[uid];
        localPlayer = S.createPlayer(uid, data?.char || 'basic', data || {});
        session.buffer.a = [];
      }
    }
    if (action.type === 'WAVE_END') {
      mode = 'shop';
      const player = session.world?.players[uid] || localPlayer;
      const levelUps = action.payload.players?.[uid]?.levelUps || 0;
      if (player) {
        player.mats = action.payload.players?.[uid]?.mats ?? player.mats;
        player.levelUps = levelUps;
        U.crates(session, player, action.payload.players?.[uid]?.crates || 0,
          () => U.upgrades(player, () => U.shop(session, uid, ready)));
      } else U.shop(session, uid, ready);
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
      weapons: player.weapons, items: player.items, stats: player.stats, mats: player.mats
    } } });
  }
  function finish(data) {
    if (mode === 'end') return;
    mode = 'end';
    U.result(data, () => {
      if (lobby) { lobby.goToWaitingRoom(); reset(); }
      else reset();
    });
    if (rewarded) return;
    rewarded = true;
    const cleared = data.win ? data.wave : Math.max(0, data.wave - 1);
    const gold = cleared * 30 + (data.win ? 500 : 0);
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
    mode = 'title';
    rewarded = false;
    U.title(action => action === 'solo' ? beginSolo() : connect());
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
    P.sfx?.music?.(mode === 'wave' ? ((session?.wave === 10 || session?.wave === 20) ? 'boss' : 'battle') : 'shop');
    if (session && mode === 'wave') {
      if (session.isHost) { move(dt); session.update(dt); }
      else { const input = move(dt); session.update(dt, input); }
      const view = scene();
      if (view) { U.hud(view, uid); renderer.draw(view, uid, now); }
    } else if (renderer) renderer.draw(null, uid, now);
  }
  document.addEventListener('DOMContentLoaded', () => {
    walletPromise = typeof SharedWallet !== 'undefined'
      ? SharedWallet.init() : Promise.resolve();
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
  P.main = {
    get session() { return session; },
    get localPlayer() { return localPlayer; },
    get offers() { return offers; },
    set offers(value) { offers = value; },
    resize() { renderer?.resize(); },
    refresh() { if (mode === 'title') reset(); }
  };
})(window);
