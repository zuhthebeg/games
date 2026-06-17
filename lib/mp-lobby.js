/**
 * MultiplayerLobby — DO/WS 위에서 도는 공용 로비 모듈.
 * 게임마다 손으로 짜던 인라인 미니로비를 대체. MultiplayerWSClient(공용 lib) 백킹.
 *
 * 사용:
 *   const lobby = new MultiplayerLobby({
 *     gameType:'pvp-battle', gameName:'⚔️ 무기 배틀', maxPlayers:2, minPlayers:2,
 *     container: document.body,
 *     getPlayerData: () => ({ weapon: {...} }),   // 선택: sendProfile로 서버에 등록
 *     onGameStart: (view) => { ...게임 렌더 시작... },        // {gameState:view}
 *     onGameEvent: (type, data) => { ...state_update/game_end... },
 *     onLeave: () => { ...메뉴로... },
 *   });
 *
 * 흐름: URL(?room,?u) → 연결 → 대기실(명단+ready+호스트 시작) → 인게임(콜백) → 결과(재대결/나가기).
 * 서버 의존: room-do.ts의 roster/ready/start_rejected/started + 좀비방 alarm 정리.
 */
(function () {
  'use strict';

  var DEFAULT_WORKER = 'wss://relay-do-poc.zuhejbeg.workers.dev';

  function genUid() {
    try {
      var k = 'mp_tab_uid';
      var v = sessionStorage.getItem(k);
      if (!v) {
        v = 'p' + ((self.crypto && crypto.randomUUID) ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10));
        sessionStorage.setItem(k, v);
      }
      return v;
    } catch (e) {
      return 'p' + Math.random().toString(36).slice(2, 10);
    }
  }

  function el(tag, css, html) {
    var d = document.createElement(tag);
    if (css) d.style.cssText = css;
    if (html != null) d.innerHTML = html;
    return d;
  }

  function MultiplayerLobby(opts) {
    opts = opts || {};
    this.gameType = opts.gameType || 'mp';
    this.gameName = opts.gameName || '온라인 멀티';
    this.maxPlayers = opts.maxPlayers || 2;
    this.minPlayers = opts.minPlayers || 2;
    this.container = opts.container || document.body;
    this._getPlayerData = opts.getPlayerData || null; // 메서드 getPlayerData()와 충돌 피하려 내부보관
    this.onGameStart = opts.onGameStart || function () {};
    this.onGameEvent = opts.onGameEvent || function () {};
    this.onLeave = opts.onLeave || function () {};
    this.workerBase = opts.workerBase || DEFAULT_WORKER;

    var P = new URLSearchParams(location.search);
    this.room = opts.room || P.get('room') || ('r' + Math.random().toString(36).slice(2, 7));
    this.uid = opts.userId || P.get('u') || genUid();
    var nick = '';
    try { nick = localStorage.getItem('mp_nick') || localStorage.getItem('enhance_nick') || ''; } catch (e) {}
    this.nick = opts.nickname || nick || ('전사-' + String(this.uid).slice(-4));

    this._inGame = false;
    this._ended = false;
    this._iAmReady = false;
    this._roster = { players: [], hostUser: null, connections: 1, started: false };

    this._injectStyles();
    this._connect();
    this._renderLobby();
  }

  MultiplayerLobby.prototype.getClient = function () { return this._shim; };
  MultiplayerLobby.prototype.getMyUserId = function () { return this.uid; };
  MultiplayerLobby.prototype.sendAction = function (a) { return this._ws.sendAction(a).then(function () { return {}; }); };
  MultiplayerLobby.prototype.getPlayerData = function () { try { return this._getPlayerData ? this._getPlayerData() : null; } catch (e) { return null; } };
  MultiplayerLobby.prototype.goToWaitingRoom = function () { this._inGame = false; this._iAmReady = false; this._renderLobby(); };

  MultiplayerLobby.prototype._injectStyles = function () {
    if (document.getElementById('mp-lobby-styles')) return;
    var s = el('style');
    s.id = 'mp-lobby-styles';
    s.textContent =
      '.mpl-ov{position:fixed;inset:0;z-index:99990;display:flex;align-items:center;justify-content:center;background:#0c111c;color:#eef;font-family:system-ui,sans-serif;padding:18px;box-sizing:border-box}' +
      '.mpl-card{width:100%;max-width:380px;background:#161d2c;border:1px solid #283349;border-radius:18px;padding:22px;box-shadow:0 12px 40px rgba(0,0,0,.5)}' +
      '.mpl-h{font-size:1.25rem;font-weight:800;margin:0 0 2px}' +
      '.mpl-sub{font-size:.72rem;color:#7c8aa5;margin:0 0 16px}' +
      '.mpl-room{display:flex;align-items:center;gap:8px;background:#0e1422;border:1px dashed #36507a;border-radius:12px;padding:10px 12px;margin-bottom:12px}' +
      '.mpl-room b{font-size:1.3rem;letter-spacing:2px;color:#7CFC9A}' +
      '.mpl-mini{font-size:.7rem;color:#7c8aa5}' +
      '.mpl-list{display:flex;flex-direction:column;gap:8px;margin:12px 0}' +
      '.mpl-pl{display:flex;align-items:center;gap:10px;background:#0e1422;border-radius:10px;padding:9px 12px;font-size:.92rem}' +
      '.mpl-dot{width:9px;height:9px;border-radius:50%;background:#3a4a66}' +
      '.mpl-ready{margin-left:auto;font-size:.72rem;font-weight:700;padding:2px 9px;border-radius:20px}' +
      '.mpl-ready.on{background:#1c5e34;color:#7CFC9A}.mpl-ready.off{background:#3a2030;color:#ff9aa8}' +
      '.mpl-host{font-size:.62rem;color:#ffd76a}' +
      '.mpl-btn{display:block;width:100%;margin-top:9px;padding:13px;border:0;border-radius:11px;font-weight:800;font-size:1rem;cursor:pointer;color:#06210f;background:#23c552}' +
      '.mpl-btn.sec{background:#27324a;color:#cdd8ef}.mpl-btn:disabled{opacity:.45;cursor:not-allowed}' +
      '.mpl-status{font-size:.78rem;color:#ffd76a;min-height:1.1em;margin:8px 2px 0;text-align:center}' +
      '.mpl-row{display:flex;gap:8px}.mpl-row .mpl-btn{margin-top:0}';
    document.head.appendChild(s);
  };

  MultiplayerLobby.prototype._connect = function () {
    var self = this;
    if (typeof MultiplayerWSClient !== 'function') { alert('멀티 라이브러리 로드 실패 — 새로고침'); return; }
    var ws = new MultiplayerWSClient({
      workerBase: this.workerBase, room: this.room, userId: this.uid,
      nickname: this.nick, gameType: this.gameType
    });
    this._ws = ws;
    this._shim = {
      getMyUserId: function () { return self.uid; },
      getRoomCode: function () { return self.room; },
      leaveRoom: function () { return ws.leaveRoom(); },
      rematch: function () { ws.start({}); return Promise.resolve(); },
      _clearRoom: function () {}
    };

    // 프로필(무기 등) 등록 — 서버가 모아 createInitialState에 전달
    if (this._getPlayerData) {
      try { var pd = this._getPlayerData(); if (pd) ws.sendProfile(pd); } catch (e) {}
    }

    ws.onOpen = function () { self._setStatus('연결됨 ✓'); };
    ws.onPresence = function (n) { self._roster.connections = n; self._syncLobby(); };
    ws.onRoster = function (d) { self._roster = d || self._roster; self._syncLobby(); };
    ws.onPreStartFail = function (k) { self._setStatus(k === 'error' ? '⚠️ 연결 오류 — 새로고침' : '연결 끊김 — 새로고침'); };
    ws.onNotice = function (d) {
      if (d && d.type === 'start_rejected') self._setStatus('⚠️ 상대 대기 중 (필요 ' + (d.need || self.minPlayers) + '명)');
    };
    ws.onStarted = function () { self._inGame = false; self._ended = false; self._hideResult(); self._hideLobby(); };
    ws.onStateChange = function (view) {
      if (!self._inGame) {
        self._inGame = true; self._hideLobby();
        self.onGameStart({ gameState: view });
      } else {
        self.onGameEvent('state_update', { gameState: view });
      }
      if (!self._ended && view && view.winnerId != null) {
        self._ended = true;
        self.onGameEvent('game_end', { result: { winnerId: view.winnerId } });
      }
    };
    ws.onEvent = function (ev) { self.onGameEvent('event', ev); };
  };

  // ===== 로비 / 대기실 =====
  MultiplayerLobby.prototype._renderLobby = function () {
    var self = this;
    this._hideLobby();
    var ov = el('div', '', '');
    ov.className = 'mpl-ov'; ov.id = 'mpl-lobby';
    var inviteUrl = this._inviteUrl();
    ov.innerHTML =
      '<div class="mpl-card">' +
        '<div class="mpl-h">' + this.gameName + '</div>' +
        '<div class="mpl-sub">온라인 대전 · 실시간(DO/WS)</div>' +
        '<div class="mpl-room"><span class="mpl-mini">방코드</span> <b>' + this.room + '</b>' +
          '<button class="mpl-btn sec" id="mpl-copy" style="margin:0 0 0 auto;width:auto;padding:7px 12px;font-size:.75rem">링크 복사</button></div>' +
        '<div class="mpl-mini">같은 링크로 친구가 들어오면 명단에 떠요</div>' +
        '<div class="mpl-list" id="mpl-list"></div>' +
        '<button class="mpl-btn" id="mpl-ready">준비하기</button>' +
        '<button class="mpl-btn" id="mpl-start" disabled>상대 대기 중…</button>' +
        '<div class="mpl-status" id="mpl-status">연결 중…</div>' +
        '<button class="mpl-btn sec" id="mpl-leave" style="margin-top:14px">나가기</button>' +
      '</div>';
    this.container.appendChild(ov);

    ov.querySelector('#mpl-copy').onclick = function () {
      try { navigator.clipboard.writeText(inviteUrl); self._setStatus('초대 링크 복사됨'); }
      catch (e) { prompt('초대 링크', inviteUrl); }
    };
    ov.querySelector('#mpl-ready').onclick = function () {
      self._iAmReady = !self._iAmReady;
      self._ws._ws && self._ws._ws.readyState === 1 && self._ws._ws.send(JSON.stringify({ type: 'ready', ready: self._iAmReady }));
      self._syncLobby();
    };
    ov.querySelector('#mpl-start').onclick = function () {
      if (self._roster.connections < self.minPlayers) { self._setStatus('인원 부족 (필요 ' + self.minPlayers + '명)'); return; }
      self._ws.start({}); self._setStatus('시작 요청 → 대기…');
    };
    ov.querySelector('#mpl-leave').onclick = function () {
      try { self._ws.leaveRoom(); } catch (e) {}
      self._hideLobby(); self.onLeave();
    };
    this._syncLobby();
  };

  MultiplayerLobby.prototype._syncLobby = function () {
    var lob = document.getElementById('mpl-lobby'); if (!lob) return;
    var r = this._roster;
    var amHost = r.hostUser === this.uid;
    // 명단
    var list = document.getElementById('mpl-list');
    if (list) {
      var players = (r.players && r.players.length) ? r.players : [{ user: this.uid, nick: this.nick, ready: this._iAmReady }];
      list.innerHTML = players.map(function (p) {
        var isHost = p.user === r.hostUser;
        return '<div class="mpl-pl">' +
          '<span class="mpl-dot" style="background:' + (p.ready ? '#23c552' : '#3a4a66') + '"></span>' +
          '<span>' + (p.nick || p.user) + (isHost ? ' <span class="mpl-host">👑호스트</span>' : '') + '</span>' +
          '<span class="mpl-ready ' + (p.ready ? 'on' : 'off') + '">' + (p.ready ? '준비완료' : '대기') + '</span>' +
        '</div>';
      }).join('');
    }
    // ready 버튼(호스트는 시작으로 대체)
    var readyBtn = document.getElementById('mpl-ready');
    var startBtn = document.getElementById('mpl-start');
    if (readyBtn) {
      readyBtn.style.display = amHost ? 'none' : 'block';
      readyBtn.textContent = this._iAmReady ? '준비 취소' : '준비하기';
      readyBtn.className = 'mpl-btn' + (this._iAmReady ? ' sec' : '');
    }
    if (startBtn) {
      var enough = r.connections >= this.minPlayers;
      var othersReady = (r.players || []).filter(function (p) { return p.user !== r.hostUser; }).every(function (p) { return p.ready; });
      var canStart = amHost && enough && (r.players.length <= 1 ? false : othersReady);
      startBtn.style.display = amHost ? 'block' : 'none';
      startBtn.disabled = !canStart;
      startBtn.textContent = !enough ? '상대 대기 중…' : (othersReady ? '시작!' : '상대 준비 대기…');
    }
    var st = document.getElementById('mpl-status');
    if (st && st.textContent === '연결 중…' && r.connections >= 1) this._setStatus('접속자: ' + r.connections + '명');
  };

  MultiplayerLobby.prototype._inviteUrl = function () {
    var u = new URL(location.href);
    u.searchParams.set('relay', 'do');
    u.searchParams.set('room', this.room);
    u.searchParams.delete('u'); // 초대받는 쪽은 자기 uid 생성
    return u.toString();
  };

  // ===== 결과 / 재대결 =====
  MultiplayerLobby.prototype.showResult = function (opts) {
    var self = this; opts = opts || {};
    this._hideResult();
    var ov = el('div'); ov.className = 'mpl-ov'; ov.id = 'mpl-result';
    // 호환: buttons|actions, message|detail (enhance는 actions/detail 사용)
    var btns = opts.buttons || opts.actions || [
      { label: '🔄 재대결', primary: true, handler: function () { self._shim.rematch(); self.goToWaitingRoom(); } },
      { label: '나가기', handler: function () { try { self._ws.leaveRoom(); } catch (e) {} self.onLeave(); } }
    ];
    var msg = (opts.message != null ? opts.message : (opts.detail || '')) + '';
    var card = el('div'); card.className = 'mpl-card'; card.style.textAlign = 'center';
    card.innerHTML = '<div class="mpl-h">' + (opts.title || '결과') + '</div><div class="mpl-sub" style="font-size:.9rem;color:#cdd8ef;white-space:pre-line">' + msg + '</div>';
    btns.forEach(function (b) {
      var btn = el('button'); btn.className = 'mpl-btn' + (b.primary ? '' : ' sec'); btn.textContent = b.label;
      btn.onclick = function () { self._hideResult(); try { b.handler && b.handler(); } catch (e) {} };
      card.appendChild(btn);
    });
    ov.appendChild(card); this.container.appendChild(ov);
  };

  MultiplayerLobby.prototype._hideLobby = function () { var e = document.getElementById('mpl-lobby'); if (e) e.remove(); };
  MultiplayerLobby.prototype._hideResult = function () { var e = document.getElementById('mpl-result'); if (e) e.remove(); };
  MultiplayerLobby.prototype._setStatus = function (t) { var e = document.getElementById('mpl-status'); if (e) e.textContent = t; };

  if (typeof window !== 'undefined') window.MultiplayerLobby = MultiplayerLobby;
})();
