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
    this.onLocal = opts.onLocal || null; // 솔로/로컬 플레이 콜백 — 있으면 모드선택에 '혼자 하기' 버튼 노출
    this.workerBase = opts.workerBase || DEFAULT_WORKER;
    this._httpBase = this.workerBase.replace(/^ws/, 'http'); // wss→https, ws→http (코디네이터 REST)
    this._startCfg = opts.startConfig || null; // 호스트 시작 시 서버로 보낼 설정(bet/seats/timeLimit 등) — 없으면 {}

    var P = new URLSearchParams(location.search);
    var explicitRoom = opts.room || P.get('room') || '';
    this._hasExplicitRoom = !!explicitRoom; // 초대링크/URL 진입 = 바로 그 방 대기실로
    this.room = explicitRoom || null;
    this.uid = opts.userId || P.get('u') || genUid();
    this._optNick = opts.nickname || '';
    this._walletReady = opts.walletReady || null; // SharedWallet.init() 첫 호출 프로미스(로그인 fetch 완료대기)
    this.nick = this._resolveNick();              // 잠정(동기) — walletReady 후 재해석

    this._inGame = false;
    this._ended = false;
    this._iAmReady = false;
    this._roster = { players: [], hostUser: null, connections: 1, started: false };

    this._injectStyles();
    // 로그인 닉(SharedWallet) 확보 후 진입. 동기 구성 직후 비동기 시작(호출측 await 불필요).
    // init()은 _initialized를 동기로 세워 재호출 await로는 로그인 fetch를 못 기다리므로 walletReady가 정석.
    var self = this;
    Promise.resolve()
      .then(function () { return self._walletReady || (typeof SharedWallet !== 'undefined' ? SharedWallet.init() : null); })
      .catch(function () {})
      .then(function () {
        self.nick = self._resolveNick();
        if (self._hasExplicitRoom) self._enterRoom(self.room); // 초대 링크 → 그 방 대기실
        else self._renderModeSelect();                          // 메뉴 → 빠른대전/방만들기/코드/목록
      });
  }

  // 닉 해석: 로그인 닉(SharedWallet) > opts.nickname > relay 공용 닉 > 게임 로컬 닉 > 게스트.
  // 로그인 유저가 게스트로 빠지던 버그 방지(walletReady 이후 호출돼야 isLoggedIn 신뢰 가능).
  MultiplayerLobby.prototype._resolveNick = function () {
    try {
      if (typeof SharedWallet !== 'undefined' && SharedWallet.isLoggedIn && SharedWallet.user && SharedWallet.user.nickname) {
        return SharedWallet.user.nickname;
      }
    } catch (e) {}
    try {
      if (this._optNick && this._optNick.trim()) return this._optNick.trim();
      var rn = localStorage.getItem('relay_nickname'); if (rn && rn.trim()) return rn.trim();
      var gn = localStorage.getItem(this.gameType + '_nick') || localStorage.getItem('mp_nick');
      if (gn && gn.trim()) return gn.trim();
    } catch (e) {}
    return '게스트' + Math.floor(Math.random() * 9000 + 1000);
  };

  function genRoom() { return 'r' + Math.random().toString(36).slice(2, 7); }

  // 방 입장(연결 + 대기실). code 지정 시 그 방, 없으면 새 코드.
  MultiplayerLobby.prototype._enterRoom = function (code) {
    this.room = code || genRoom();
    this._hideModeSelect();
    if (!this._ws) this._connect();
    this._renderLobby();
  };

  // ⚡ 빠른 대전: 열린 방이 있으면 합류, 없으면 새 방 생성(호스트로 대기).
  MultiplayerLobby.prototype._quickMatch = function () {
    var self = this;
    self._setModeStatus('상대 찾는 중…');
    fetch(self._httpBase + '/match?g=' + encodeURIComponent(self.gameType))
      .then(function (r) { return r.json(); })
      .then(function (d) { self._enterRoom(d && d.roomId ? d.roomId : genRoom()); })
      .catch(function () { self._enterRoom(genRoom()); }); // 코디네이터 불통 시 새 방
  };

  MultiplayerLobby.prototype.getClient = function () { return this._shim; };
  MultiplayerLobby.prototype.getMyUserId = function () { return this.uid; };
  MultiplayerLobby.prototype.sendAction = function (a) { return this._ws.sendAction(a).then(function () { return {}; }); };
  // 일부 게임(gostop 등)은 MP.client=lobby로 두고 leaveRoom을 직접 호출 → shim 경유로 위임(=ws.leave 의도신호).
  MultiplayerLobby.prototype.leaveRoom = function () { return this._shim ? this._shim.leaveRoom() : Promise.resolve({}); };
  MultiplayerLobby.prototype.getPlayerData = function () { try { return this._getPlayerData ? this._getPlayerData() : null; } catch (e) { return null; } };
  MultiplayerLobby.prototype.goToWaitingRoom = function () { this._inGame = false; this._iAmReady = false; this._oppGoneShown = false; this._renderLobby(); };

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
      // 의도적 나가기는 leave()로 — close 전 {type:'leave'} 전송해 서버가 상대에게 opponent_left 통보.
      // (leaveRoom=단순 close=튕김과 동일 → 상대가 '상대 나감'을 못 받음)
      leaveRoom: function () { return ws.leave ? ws.leave() : ws.leaveRoom(); },
      // 모델 A(합의): 재대결은 즉시 start하지 않고 대기실로 복귀 → 양쪽 ready → 호스트 시작.
      // (예전: ws.start({}) 단독 → 상대 동의 없이 새 판 강제. 일관 합의 흐름으로 교체)
      rematch: function () { self.goToWaitingRoom(); return Promise.resolve(); },
      _clearRoom: function () {}
    };

    // 프로필(무기 등) 등록 — 서버가 모아 createInitialState에 전달
    if (this._getPlayerData) {
      try { var pd = this._getPlayerData(); if (pd) ws.sendProfile(pd); } catch (e) {}
    }

    ws.onOpen = function () { self._setStatus('연결됨 ✓'); };
    ws.onPresence = function (n) {
      self._roster.connections = n;
      self._syncLobby();
      // 결과창이 떠 있는 동안(게임 종료 후 합의 단계) 상대가 빠지면 → 재대결 불가, 상대 나감 안내.
      // (종료 후 leave는 서버가 opponent_left를 안 쏨 — 이미 끝난 판이라 — 이라 presence로 감지)
      if (n < self.minPlayers && document.getElementById('mpl-result')) self._opponentGone();
      // 진행 중 상대 이탈(탭 닫기/튕김=opponent_left 이벤트 없음): 시작 인원보다 줄면 grace(4s) 후 종료.
      // AI 좌석은 connection이 아니라 solo+AI(시작인원=1)에선 오탐 없음. 재접속하면 presence 회복 → 타이머 취소.
      if (self._inGame && !self._ended && self._startConns && n < self._startConns) {
        if (!self._leaveTimer) self._leaveTimer = setTimeout(function () {
          self._leaveTimer = null;
          if (self._inGame && !self._ended && (self._roster.connections || 0) < self._startConns) self._opponentGone();
        }, 4000);
      } else if (self._leaveTimer && n >= (self._startConns || 0)) {
        clearTimeout(self._leaveTimer); self._leaveTimer = null;
      }
    };
    ws.onRoster = function (d) { self._roster = d || self._roster; self._syncLobby(); };
    ws.onPreStartFail = function (k) { self._setStatus(k === 'error' ? '⚠️ 연결 오류 — 새로고침' : '연결 끊김 — 새로고침'); };
    ws.onNotice = function (d) {
      if (d && d.type === 'start_rejected') self._setStatus('⚠️ 상대 대기 중 (필요 ' + (d.need || self.minPlayers) + '명)');
    };
    ws.onStarted = function () { self._inGame = false; self._ended = false; self._oppGoneShown = false; self._hideResult(); self._hideLobby(); };
    ws.onStateChange = function (view) {
      if (!self._inGame) {
        self._inGame = true; self._hideLobby();
        self._startConns = self._roster.connections || 1; // 진행 중 이탈 감지 기준(시작 시 사람 수)
        self.onGameStart({ gameState: view });
      } else {
        self.onGameEvent('state_update', { gameState: view });
      }
      // 종료 판정 일반화: winnerId(enhance) 또는 winner(gomoku/connect4 등). 'draw'도 종료로 인정.
      var w = view ? (view.winnerId != null ? view.winnerId : (view.winner != null ? view.winner : null)) : null;
      if (!self._ended && w != null) {
        self._ended = true;
        self.onGameEvent('game_end', { result: { winnerId: w, winner: w } });
      }
    };
    ws.onEvent = function (ev) {
      // 상대 의도적 나가기(서버 opponent_left 이벤트) → 모듈이 종료 처리(게임별 처리 불필요)
      if (ev && ev.type === 'opponent_left') { self._onOpponentLeft(); return; }
      self.onGameEvent('event', ev);
    };
  };

  // 상대가 '나가기'로 이탈(튕김 아님) — 진행 중(opponent_left 이벤트)만. 결과창/대기실은 presence 경로가 처리.
  MultiplayerLobby.prototype._onOpponentLeft = function () {
    if (!this._inGame || this._ended) return;
    this._opponentGone();
  };

  // 상대 이탈 공통 처리: 종료 안내 + 재대결 불가(상대 없음) → 대기실/나가기만. 중복 표시 가드.
  MultiplayerLobby.prototype._opponentGone = function () {
    if (this._oppGoneShown) return;
    this._oppGoneShown = true;
    this._ended = true;
    var self = this;
    this.showResult({
      title: '🚪 상대가 나갔습니다',
      detail: '게임이 종료되었습니다 — 새 상대를 찾으세요',
      actions: [
        { label: '대기실로', primary: true, handler: function () { self._oppGoneShown = false; self.goToWaitingRoom(); } },
        { label: '나가기', handler: function () { self._oppGoneShown = false; try { (self._ws.leave ? self._ws.leave() : self._ws.leaveRoom()); } catch (e) {} self.onLeave(); } }
      ]
    });
  };

  // ===== 모드 선택 (메뉴 진입) =====
  MultiplayerLobby.prototype._renderModeSelect = function () {
    var self = this;
    this._hideModeSelect();
    var ov = el('div'); ov.className = 'mpl-ov'; ov.id = 'mpl-mode';
    ov.innerHTML =
      '<div class="mpl-card">' +
        '<div class="mpl-h">' + this.gameName + '</div>' +
        '<div class="mpl-sub">온라인 대전 · 실시간(DO/WS)</div>' +
        (this.onLocal ? '<button class="mpl-btn sec" id="mpl-solo" style="margin-bottom:12px">🎮 혼자 하기 (솔로)</button>' : '') +
        '<button class="mpl-btn" id="mpl-quick">⚡ 빠른 대전 <span style="font-weight:500;opacity:.8;font-size:.8rem">— 자동 매칭</span></button>' +
        '<button class="mpl-btn sec" id="mpl-create">방 만들기</button>' +
        '<div class="mpl-row" style="margin-top:9px">' +
          '<input id="mpl-code" maxlength="12" placeholder="방 코드" style="flex:1;min-width:0;padding:12px;border-radius:11px;border:1px solid #36507a;background:#0e1422;color:#fff;font-size:1rem" />' +
          '<button class="mpl-btn sec" id="mpl-join" style="width:auto;padding:0 16px">입장</button>' +
        '</div>' +
        '<div class="mpl-mini" style="margin:14px 2px 6px">공개 방</div>' +
        '<div class="mpl-list" id="mpl-rooms"><div class="mpl-mini">불러오는 중…</div></div>' +
        '<div class="mpl-status" id="mpl-mode-status"></div>' +
        '<button class="mpl-btn sec" id="mpl-mode-leave" style="margin-top:12px">닫기</button>' +
      '</div>';
    this.container.appendChild(ov);
    if (this.onLocal) { var soloBtn = ov.querySelector('#mpl-solo'); if (soloBtn) soloBtn.onclick = function () { self._hideModeSelect(); self.onLocal(); }; }
    ov.querySelector('#mpl-quick').onclick = function () { self._quickMatch(); };
    ov.querySelector('#mpl-create').onclick = function () { self._enterRoom(genRoom()); };
    ov.querySelector('#mpl-join').onclick = function () {
      var c = (ov.querySelector('#mpl-code').value || '').trim();
      if (c) self._enterRoom(c); else self._setModeStatus('방 코드를 입력해줘');
    };
    ov.querySelector('#mpl-mode-leave').onclick = function () { self._hideModeSelect(); self.onLeave(); };
    this._loadRoomList();
  };

  MultiplayerLobby.prototype._loadRoomList = function () {
    var self = this;
    var box = document.getElementById('mpl-rooms'); if (!box) return;
    fetch(this._httpBase + '/rooms?g=' + encodeURIComponent(this.gameType))
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var rooms = (d && d.rooms) || [];
        if (!document.getElementById('mpl-rooms')) return;
        if (!rooms.length) { box.innerHTML = '<div class="mpl-mini">열린 방이 없어 — 빠른 대전이나 방 만들기로 시작해</div>'; return; }
        box.innerHTML = rooms.map(function (r) {
          return '<div class="mpl-pl" data-room="' + r.roomId + '" style="cursor:pointer">' +
            '<span>🚪 ' + r.roomId + '</span>' +
            '<span class="mpl-ready off" style="margin-left:auto">' + r.players + '/' + r.max + '</span></div>';
        }).join('');
        Array.prototype.forEach.call(box.querySelectorAll('[data-room]'), function (elm) {
          elm.onclick = function () { self._enterRoom(elm.getAttribute('data-room')); };
        });
      })
      .catch(function () { if (box) box.innerHTML = '<div class="mpl-mini">목록 불러오기 실패</div>'; });
  };

  MultiplayerLobby.prototype._hideModeSelect = function () { var e = document.getElementById('mpl-mode'); if (e) e.remove(); };
  MultiplayerLobby.prototype._setModeStatus = function (t) { var e = document.getElementById('mpl-mode-status'); if (e) e.textContent = t; };

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
        '<div style="text-align:center;margin:10px 0 4px"><img alt="입장 QR" width="124" height="124" style="border-radius:10px;background:#fff;padding:6px" src="https://api.qrserver.com/v1/create-qr-code/?size=124x124&data=' + encodeURIComponent(inviteUrl) + '" /></div>' +
        '<div class="mpl-mini">친구가 같은 링크로 들어오거나 QR을 찍으면 명단에 떠요</div>' +
        '<div class="mpl-list" id="mpl-list"></div>' +
        '<button class="mpl-btn" id="mpl-ready">준비하기</button>' +
        '<button class="mpl-btn" id="mpl-start" disabled>상대 대기 중…</button>' +
        '<button class="mpl-btn sec" id="mpl-solo-start" style="margin-top:2px">' + (this.onLocal ? '🎮 혼자 시작' : '🤖 지금 시작 (빈자리 AI로 채움)') + '</button>' +
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
      var _cfg = {}; if (self._startCfg) { try { _cfg = self._startCfg() || {}; } catch (e) { _cfg = {}; } }
      self._ws.start(_cfg); self._setStatus('시작 요청 → 대기…');
    };
    // 혼자 시작: 사람이 안 와도 진행. onLocal 게임(순수 PvP)=로컬 솔로, 그 외=서버가 빈 자리 AI/딜러로 채움.
    var _soloBtn = ov.querySelector('#mpl-solo-start');
    if (_soloBtn) _soloBtn.onclick = function () {
      if (self.onLocal) {
        try { (self._ws && (self._ws.leave ? self._ws.leave() : self._ws.leaveRoom())); } catch (e) {}
        self._ws = null; self._inGame = false; self._hideLobby(); self.onLocal(); return;
      }
      var _cfg = {}; if (self._startCfg) { try { _cfg = self._startCfg() || {}; } catch (e) { _cfg = {}; } }
      self._ws.start(_cfg); self._setStatus('시작 — 빈 자리는 AI로 채움');
    };
    ov.querySelector('#mpl-leave').onclick = function () {
      try { (self._ws.leave ? self._ws.leave() : self._ws.leaveRoom()); } catch (e) {}
      self._ws = null; self._inGame = false; self._iAmReady = false;
      self._hideLobby();
      // 메뉴로 들어왔으면 모드선택으로 복귀, 초대링크 진입이면 게임 메뉴로.
      if (self._hasExplicitRoom) self.onLeave(); else self._renderModeSelect();
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
      { label: '나가기', handler: function () { try { (self._ws.leave ? self._ws.leave() : self._ws.leaveRoom()); } catch (e) {} self.onLeave(); } }
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
