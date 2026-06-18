/**
 * Multiplayer Client Library
 * 범용 멀티플레이어 릴레이 클라이언트
 * relay.cocy.io 연결
 */

const RELAY_URL = 'https://relay.cocy.io';

let _mpClientInstance = null;

class MultiplayerClient {
    constructor() {
        this.token = localStorage.getItem('relay_token');
        this.userId = localStorage.getItem('relay_userId');
        this.nickname = localStorage.getItem('relay_nickname');
        this.isLoggedIn = false;
        this.roomId = localStorage.getItem('relay_roomId') || null; // Persist room
        this.gameType = localStorage.getItem('relay_gameType') || null;
        this.eventSource = null;
        this.lastSeq = 0;
        this.onEvent = null;
        this.onStateChange = null;
        this.onError = null;
        this.onRoomDestroyed = null;
        this.onReconnected = null;
        this.pollingInterval = null;
        this.catchupInterval = null;
        this.presenceInterval = null;
    }

    static getInstance() {
        if (!_mpClientInstance) {
            _mpClientInstance = new MultiplayerClient();
        }
        return _mpClientInstance;
    }

    static resetInstance() {
        if (_mpClientInstance) {
            _mpClientInstance.stopListening();
            _mpClientInstance.roomId = null;
        }
        _mpClientInstance = null;
    }

    // ===== Auth =====
    async ensureAuth() {
        // 1. Check for main site JWT auth (cocy.io login)
        // cocy_auth_token: game.cocy.io에서 저장하는 키
        const mainAccessToken = localStorage.getItem('cocy_auth_token') || localStorage.getItem('accessToken');
        if (mainAccessToken) {
            try {
                let parsedNickname = null;
                const parts = mainAccessToken.split('.');
                if (parts.length === 3) {
                    const payload = JSON.parse(decodeURIComponent(atob(parts[1].replace(/-/g,"+").replace(/_/g,"/")).split("").map(c=>"%"+("00"+c.charCodeAt(0).toString(16)).slice(-2)).join("")));
                    parsedNickname = payload.nickname || payload.email?.split('@')[0] || null;
                }

                // JWT 모양만 보고 relay 토큰으로 받아들이면 방 생성이 401로 실패한다.
                // 반드시 relay.cocy.io가 인정하는 토큰인지 확인한 뒤 사용한다.
                const res = await fetch(`${RELAY_URL}/api/auth/me`, {
                    headers: { 'Authorization': `Bearer ${mainAccessToken}` }
                });
                if (res.ok) {
                    const user = await res.json();
                    this.token = mainAccessToken;
                    this.userId = user.id;
                    this.nickname = user.nickname || parsedNickname;
                    this.isLoggedIn = true;
                    localStorage.setItem('relay_token', this.token);
                    localStorage.setItem('relay_userId', this.userId);
                    localStorage.setItem('relay_nickname', this.nickname || '');
                    localStorage.setItem('cocy_user_id', this.userId);
                    console.log('[MP] Logged in user:', this.userId, 'nickname:', this.nickname);
                    return true;
                }
                if (this.token === mainAccessToken) {
                    this.clearAuth();
                }
            } catch (e) {
                if (this.token === mainAccessToken) {
                    this.clearAuth();
                }
                console.log('Main auth check failed, falling back to relay/anonymous');
            }
        }
        
        // 2. Check existing relay token
        if (this.token && this.userId) {
            try {
                const res = await this.request('GET', '/api/auth/me');
                if (res.id) {
                    this.userId = res.id;
                    this.nickname = res.nickname;
                    this.isLoggedIn = false;
                    return true;
                }
            } catch (e) {
                this.clearAuth();
            }
        }

        // 3. Fall back to anonymous auth
        const res = await this.request('POST', '/api/auth/anonymous');
        this.token = res.token;
        this.userId = res.user.id;
        this.isLoggedIn = false;
        localStorage.setItem('relay_token', this.token);
        localStorage.setItem('relay_userId', this.userId);
        return true;
    }

    clearAuth() {
        this.token = null;
        this.userId = null;
        this.nickname = null;
        this.isLoggedIn = false;
        localStorage.removeItem('relay_token');
        localStorage.removeItem('relay_userId');
        localStorage.removeItem('relay_nickname');
    }

    // ===== Room Persistence =====
    _saveRoom(roomId, gameType) {
        this.roomId = roomId;
        this.gameType = gameType;
        localStorage.setItem('relay_roomId', roomId);
        localStorage.setItem('relay_gameType', gameType);
    }

    _clearRoom() {
        this.roomId = null;
        this.gameType = null;
        localStorage.removeItem('relay_roomId');
        localStorage.removeItem('relay_gameType');
    }

    // ===== Reconnection =====
    async tryReconnect(expectedGameType = null) {
        const savedRoom = localStorage.getItem('relay_roomId');
        const savedGameType = localStorage.getItem('relay_gameType');
        
        if (!savedRoom) return null;
        if (expectedGameType && savedGameType !== expectedGameType) {
            this._clearRoom();
            return null;
        }

        try {
            await this.ensureAuth();
            this.roomId = savedRoom;
            this.gameType = savedGameType;
            
            // Check if room still exists and we're still in it
            const state = await this.getRoomState();
            const myId = this.getMyUserId();
            const amInRoom = state.players?.some(p => p.id === myId);
            
            if (!amInRoom) {
                this._clearRoom();
                return null;
            }

            console.log('Reconnected to room:', savedRoom);
            if (this.onReconnected) {
                this.onReconnected(state);
            }
            return state;
        } catch (e) {
            console.log('Reconnect failed:', e.message);
            this._clearRoom();
            return null;
        }
    }

    hasSavedRoom(gameType = null) {
        const savedRoom = localStorage.getItem('relay_roomId');
        const savedGameType = localStorage.getItem('relay_gameType');
        if (!savedRoom) return false;
        if (gameType && savedGameType !== gameType) return false;
        return true;
    }

    async setNickname(nickname) {
        console.log('[MP] setNickname called:', nickname, 'current:', this.nickname);
        // Always update server to ensure DB sync
        // if (this.nickname === nickname && this.userId) {
        //     return { id: this.userId, nickname: this.nickname };
        // }
        
        // Logged-in users: update via /me endpoint
        if (this.isLoggedIn) {
            const res = await fetch(`${RELAY_URL}/api/auth/me`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ nickname })
            });
            if (res.ok) {
                this.nickname = nickname;
                return { id: this.userId, nickname };
            }
        }
        
        // Anonymous users: use nickname endpoint
        const res = await this.request('POST', '/api/auth/nickname', { nickname });
        this.nickname = res.user.nickname;
        this.nickname = res.user.nickname;
        localStorage.setItem('relay_token', this.token);
        localStorage.setItem('relay_userId', this.userId);
        localStorage.setItem('relay_nickname', this.nickname);
        return res.user;
    }

    // ===== Room Management =====
    async createRoom(gameType, config = {}) {
        await this.ensureAuth();
        const roomConfig = config.gameConfig || {};
        if (config.roomName) roomConfig.roomName = config.roomName;
        const res = await this.request('POST', '/api/rooms', {
            gameType,
            config: roomConfig,
            maxPlayers: config.maxPlayers || 2,
            isPublic: config.isPublic !== false,
            playerState: config.playerState || null,
        });
        this._saveRoom(res.roomId, gameType);
        return res;
    }

    async joinRandom(gameType) {
        await this.ensureAuth();
        const res = await this.request('POST', '/api/match/random', { gameType });
        this._saveRoom(res.roomId, gameType);
        return res;
    }

    async joinRoom(roomId, gameType = null, playerState = null) {
        await this.ensureAuth();
        this.roomId = roomId;
        const body = playerState ? { playerState } : {};
        const res = await this.request('POST', `/api/rooms/${roomId}/join`, body);
        this._saveRoom(roomId, gameType || res.gameType || 'unknown');
        return res;
    }

    async leaveRoom() {
        if (!this.roomId) return { message: 'Not in a room' };
        this.stopListening();
        const roomId = this.roomId;
        this._clearRoom();
        this.lastSeq = 0;
        try {
            return await this.request('POST', `/api/rooms/${roomId}/leave`);
        } catch (e) {
            console.log('Leave room error (ignored):', e.message);
            return { message: 'Left room' };
        }
    }

    async destroyRoom() {
        if (!this.roomId) return { message: 'Not in a room' };
        this.stopListening();
        const roomId = this.roomId;
        this._clearRoom();
        this.lastSeq = 0;
        return await this.request('POST', `/api/rooms/${roomId}/destroy`);
    }

    async getRoomState() {
        if (!this.roomId) throw new Error('Not in a room');
        return await this.request('GET', `/api/rooms/${this.roomId}`);
    }

    async setReady(ready = true, playerData = null) {
        const body = { ready };
        if (playerData !== null) {
            body.playerData = playerData;
        }
        return await this.request('POST', `/api/rooms/${this.roomId}/ready`, body);
    }

    async startGame() {
        return await this.request('POST', `/api/rooms/${this.roomId}/start`);
    }

    async rematch(playerData = null) {
        const body = playerData ? { playerData } : {};
        return await this.request('POST', `/api/rooms/${this.roomId}/rematch`, body);
    }

    // ===== Game Actions (Generic) =====
    async sendAction(action) {
        return await this.request('POST', `/api/rooms/${this.roomId}/action`, action);
    }

    // ===== Real-time Updates =====
    startListening() {
        if (!this.roomId || !this.token) return;

        try {
            const url = `${RELAY_URL}/api/rooms/${this.roomId}/stream?token=${encodeURIComponent(this.token)}&after=${encodeURIComponent(this.lastSeq || 0)}`;
            this.eventSource = new EventSource(url);

            this.eventSource.onopen = () => {
                console.log('SSE connected');
            };

            this.eventSource.onerror = (e) => {
                console.log('SSE error, falling back to polling');
                this.eventSource?.close();
                this.eventSource = null;
                this.startPolling();
            };

            this.eventSource.addEventListener('connected', (e) => {
                console.log('Connected to room');
            });

            const eventTypes = [
                'player_joined', 'player_left', 'player_ready', 'game_started',
                'action', 'game_ended', 'rematch_ready', 'host_changed', 'state_update'
            ];

            eventTypes.forEach(type => {
                this.eventSource.addEventListener(type, (e) => {
                    const data = JSON.parse(e.data);
                    this.handleEvent(type, data);
                });
            });

            this.startCatchupPolling();
            this.startPresence();

        } catch (e) {
            console.log('SSE not available, using polling');
            this.startPolling();
            this.startPresence();
        }
    }

    startPolling() {
        if (this.pollingInterval) return;
        this.startPresence();
        
        this.pollingInterval = setInterval(() => {
            this.catchupEvents().catch(e => this.handlePollingError(e));
        }, 1000);
    }

    startCatchupPolling() {
        if (this.catchupInterval) return;
        this.catchupInterval = setInterval(() => {
            this.catchupEvents().catch(e => this.handlePollingError(e));
        }, 5000);
    }

    async catchupEvents() {
        if (!this.roomId) return;
        const res = await this.request('GET', `/api/rooms/${this.roomId}/events?after=${this.lastSeq}`);
        if (res.events && res.events.length > 0) {
            for (const event of res.events) {
                this.handleEvent(event.type, event);
            }
        }
    }

    startPresence() {
        if (this.presenceInterval || !this.roomId || !this.token) return;
        const ping = () => {
            if (!this.roomId) return;
            this.request('POST', `/api/rooms/${this.roomId}/presence`).catch(e => {
                console.log('Presence ping failed:', e.message || e);
            });
        };
        ping();
        this.presenceInterval = setInterval(ping, 5000);
    }

    stopPresence() {
        if (this.presenceInterval) {
            clearInterval(this.presenceInterval);
            this.presenceInterval = null;
        }
    }

    handlePollingError(e) {
        console.error('Polling error:', e);
        if (e.status === 404) {
            this.stopListening();
            this.roomId = null;
            this.lastSeq = 0;
            if (this.onRoomDestroyed) {
                this.onRoomDestroyed({ reason: 'Room no longer exists' });
            }
            if (this.onEvent) {
                this.onEvent('room_destroyed', { reason: 'Room no longer exists' });
            }
        }
    }

    stopListening() {
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
        if (this.catchupInterval) {
            clearInterval(this.catchupInterval);
            this.catchupInterval = null;
        }
        this.stopPresence();
        this.lastSeq = 0;
    }

    handleEvent(type, data) {
        console.log('Event:', type, data);
        if (data && typeof data.seq === 'number') {
            if (data.seq <= this.lastSeq) return;
            this.lastSeq = data.seq;
        }
        if (this.onEvent) {
            this.onEvent(type, data);
        }
        this.getRoomState().then(state => {
            if (this.onStateChange) {
                this.onStateChange(state);
            }
        }).catch(e => console.error('State refresh error:', e));
    }

    // ===== HTTP Helper =====
    async request(method, path, body = null) {
        const headers = {
            'Content-Type': 'application/json',
        };
        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        const options = { method, headers };
        if (body) {
            options.body = JSON.stringify(body);
        }

        const res = await fetch(`${RELAY_URL}${path}`, options);
        const data = await res.json();

        if (!res.ok) {
            const error = new Error(data.error || 'Request failed');
            error.status = res.status;
            if (this.onError) this.onError(error);
            throw error;
        }

        return data;
    }

    // ===== Utilities =====
    getRoomCode() {
        return this.roomId;
    }

    getMyUserId() {
        return this.userId;
    }

    getMyNickname() {
        return this.nickname;
    }

    isInRoom() {
        return !!this.roomId;
    }
}

// Export for browsers and module systems
if (typeof window !== 'undefined') {
    window.MultiplayerClient = MultiplayerClient;
    window.RELAY_URL = RELAY_URL;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MultiplayerClient, RELAY_URL };
}

// =============================================================================
// MultiplayerWSClient — DO/WebSocket 트랜스포트 (additive, 기존 클래스 불변)
// gostop/index.html 인라인 startWS() 로직을 공용 클래스로 승격.
// 공개 표면은 MultiplayerClient와 동일하므로 게임 렌더 코드 수정 불필요.
// =============================================================================

class MultiplayerWSClient {
    /**
     * @param {object} opts
     * @param {string}  opts.workerBase  - DO 워커 베이스 URL (e.g. 'wss://relay-do-poc.zuhejbeg.workers.dev'). 하드코딩 없음.
     * @param {string}  opts.room        - 방 코드
     * @param {string}  [opts.userId]    - 미전달 시 localStorage '<gameType>_uid' 에서 읽거나 'u-<rand>' 신규 생성
     * @param {string}  [opts.nickname]  - 표시 이름 (없으면 URL 파라미터 생략)
     * @param {string}  [opts.gameType]  - uid 영속화 키 prefix (default: 'mp')
     */
    constructor(opts) {
        const { workerBase, room, userId, nickname, gameType } = opts || {};
        this._workerBase = workerBase;
        this._room = room;
        this._gameType = gameType || 'mp';
        this._nick = nickname || '';

        // 영속 uid: 제공 > localStorage > 신규 생성
        const storageKey = this._gameType + '_uid';
        let uid = userId || '';
        if (!uid) {
            try { uid = localStorage.getItem(storageKey) || ''; } catch (e) {}
        }
        if (!uid) {
            uid = 'u-' + Math.random().toString(36).slice(2, 8);
            try { localStorage.setItem(storageKey, uid); } catch (e) {}
        } else {
            // 외부 제공이어도 동일 키로 persist (재접속 일관성)
            try { localStorage.setItem(storageKey, uid); } catch (e) {}
        }
        this._userId = uid;

        // 공개 콜백 (게임이 할당)
        this.onEvent = null;          // (event) → void
        this.onStateChange = null;    // (view)  → void
        this.onOpen = null;           // ()      → void  (매 연결 open. 첫 연결 상태표시용)
        this.onReconnecting = null;   // (tries) → void
        this.onReconnected = null;    // ()      → void
        this.onPresence = null;       // (count) → void  (선택적)
        this.onPreStartFail = null;   // (kind, code) → void  kind:'close'|'error' — 게임 시작 전 연결 실패 표시용
        this.onNotice = null;         // (d) → void  서버 알림(start_rejected/error)
        this.onRoomClosed = null;     // (d) → void  방 폭파(호스트 로비 이탈 등) — 클라는 로비로 복귀
        this.onRoster = null;         // (d) → void  로비 명단 {players:[{user,nick,ready}],hostUser,connections,started}
        this.onStarted = null;        // (d) → void  게임 시작(started 메시지) — 재대결 재진입 감지용

        // 내부 상태
        this._ws = null;
        this._lastView = null;
        this._started = false;
        this._pendingStart = null;    // {config} | null — 소켓 열리기 전 start() 큐
        this._profile = null;         // 본인 플레이어 데이터(무기 등) — 매 연결마다 재전송
        this._reconnectTimer = null;
        this._reconnectTries = 0;
        this._manualClose = false;

        // WS URL 사전 계산 (connect()마다 재사용)
        // ?g= 로 gameType 전달 → 서버 DO가 게임별 plugin 선택(generic). 'mp'(미지정 기본)는 생략 → 서버가 gostop 기본 처리.
        this._wsUrl = this._workerBase
            + '/room/' + encodeURIComponent(this._room)
            + '?u=' + encodeURIComponent(this._userId)
            + (this._nick ? '&n=' + encodeURIComponent(this._nick) : '')
            + (this._gameType && this._gameType !== 'mp' ? '&g=' + encodeURIComponent(this._gameType) : '');

        // 생성과 동시에 연결 시작
        this.connect();
    }

    // ===== 공개 API (MultiplayerClient와 동일 시그니처) =====

    /** @returns {string} 내 userId */
    getMyUserId() {
        return this._userId;
    }

    /**
     * 액션 전송
     * @param {object} action
     * @returns {Promise<{}>}
     */
    sendAction(action) {
        try {
            this._ws.send(JSON.stringify({ type: 'action', action: action }));
        } catch (e) {
            console.warn('[WSClient] sendAction 실패:', e.message);
        }
        return Promise.resolve({});
    }

    /**
     * 로비 준비상태 토글. DO는 {type:'ready'}를 받아 roster를 갱신·재방송한다.
     * 소켓이 아직 안 열렸으면 무시(로비 진입 후 호출되므로 보통 OPEN).
     * @param {boolean} ready
     */
    setReady(ready) {
        try {
            if (this._ws && this._ws.readyState === 1) {
                this._ws.send(JSON.stringify({ type: 'ready', ready: !!ready }));
            }
        } catch (e) {
            console.warn('[WSClient] setReady 실패:', e.message);
        }
        return Promise.resolve({});
    }

    /**
     * 현재 뷰 스냅샷 반환 (REST 클라이언트와 동일 반환 형태)
     * @returns {Promise<{ myView: object|null }>}
     */
    getRoomState() {
        return Promise.resolve({ myView: this._lastView });
    }

    /**
     * 본인 플레이어 데이터(무기 등) 등록. start 전에 서버가 모으도록 매 연결마다 재전송.
     * PvP(enhance)처럼 시작 요청자가 상대 데이터를 모르는 경우 각 클라가 호출.
     * @param {object} data - 예: { weapon: {...}, nickname }
     */
    sendProfile(data) {
        this._profile = data || null;
        if (this._ws && this._ws.readyState === 1 && this._profile) {
            try { this._ws.send(JSON.stringify({ type: 'profile', data: this._profile })); }
            catch (e) { console.warn('[WSClient] sendProfile 실패:', e.message); }
        }
    }

    /**
     * 게임 시작 요청.
     * 소켓이 아직 열리지 않았으면 pendingStart 큐에 저장 → onopen 시 자동 전송.
     * @param {object} config - 게임별 설정 (e.g. { seats:2, bet:1 })
     */
    start(config) {
        if (!this._ws || this._ws.readyState !== 1 /* OPEN */) {
            // 소켓 열리기 전 → onopen 이후 처리
            this._pendingStart = config || {};
            return;
        }
        this._doStart(config);
    }

    /**
     * 방 나가기. manualClose 플래그를 세워 재접속 루프를 중단.
     * @returns {Promise<{}>}
     */
    leaveRoom() {
        this._manualClose = true;
        if (this._reconnectTimer) {
            clearTimeout(this._reconnectTimer);
            this._reconnectTimer = null;
        }
        try { this._ws && this._ws.close(); } catch (e) {}
        return Promise.resolve({});
    }

    // ===== 내부 메서드 =====

    /** 실제 start 패킷 전송 (소켓이 OPEN인 상태에서만 호출) */
    _doStart(config) {
        try {
            this._ws.send(JSON.stringify({ type: 'start', config: config || {} }));
        } catch (e) {
            console.warn('[WSClient] start 전송 실패:', e.message);
        }
    }

    /** 재접속 스케줄 (backoff: min(1200*tries, 5000)ms) */
    _scheduleReconnect() {
        if (this._reconnectTimer || this._manualClose) return;
        this._reconnectTries++;
        const delay = Math.min(1200 * this._reconnectTries, 5000);
        if (typeof this.onReconnecting === 'function') {
            this.onReconnecting(this._reconnectTries);
        }
        this._reconnectTimer = setTimeout(() => {
            this._reconnectTimer = null;
            this.connect();
        }, delay);
    }

    /**
     * WS 연결 생성 및 이벤트 핸들러 등록.
     * constructor에서 자동 호출. 재접속 시에도 사용.
     */
    connect() {
        const ws = new WebSocket(this._wsUrl);
        this._ws = ws;

        ws.onopen = () => {
            // 매 연결 open 알림 (첫 연결 포함) — 게임이 상태텍스트 갱신용으로 사용
            if (typeof this.onOpen === 'function') {
                this.onOpen();
            }
            // 재접속 성공: tries 리셋 + onReconnected 콜백
            if (this._reconnectTries > 0) {
                this._reconnectTries = 0;
                if (typeof this.onReconnected === 'function') {
                    this.onReconnected();
                }
            }
            // 프로필 재전송(매 연결) — start보다 먼저 서버에 도착해야 함
            if (this._profile) {
                try { ws.send(JSON.stringify({ type: 'profile', data: this._profile })); }
                catch (e) {}
            }
            // pendingStart 처리
            if (this._pendingStart !== null) {
                const cfg = this._pendingStart;
                this._pendingStart = null;
                this._doStart(cfg);
            }
        };

        ws.onmessage = (e) => {
            let d;
            try { d = JSON.parse(e.data); } catch (_) { return; }

            if (d.type === 'state') {
                // 최신 뷰 저장 + onStateChange 알림
                this._lastView = d.view;
                this._started = true;
                if (typeof this.onStateChange === 'function') {
                    this.onStateChange(d.view);
                }
            } else if (d.type === 'started') {
                this._started = true;
                if (typeof this.onStarted === 'function') this.onStarted(d);
            } else if (d.type === 'roster') {
                if (typeof this.onRoster === 'function') this.onRoster(d);
            } else if (d.type === 'event') {
                if (typeof this.onEvent === 'function') {
                    this.onEvent(d.event);
                }
            } else if (d.type === 'presence' || d.type === 'connected') {
                // 접속자 수 콜백 (선택적)
                if (typeof this.onPresence === 'function' && typeof d.connections === 'number') {
                    this.onPresence(d.connections);
                }
            } else if (d.type === 'room_closed') {
                // 서버가 방을 폭파함(호스트 로비 이탈 등). 재접속 루프 중단 + 콜백.
                this._manualClose = true;
                if (typeof this.onRoomClosed === 'function') this.onRoomClosed(d);
            } else if (d.type === 'start_rejected' || d.type === 'error') {
                // 시작 거부(인원 부족 등)·액션 거부 — 선택적 onNotice 콜백으로 전달
                if (typeof this.onNotice === 'function') {
                    this.onNotice(d);
                }
            }
        };

        ws.onclose = (ev) => {
            if (this._manualClose) return;
            if (this._started) {
                // 게임 진행 중 끊김 → 재접속 시도
                this._scheduleReconnect();
            } else {
                console.warn('[WSClient] 연결 끊김 (code', ev && ev.code, ') — 게임 시작 전');
                if (typeof this.onPreStartFail === 'function') {
                    this.onPreStartFail('close', ev && ev.code);
                }
            }
        };

        ws.onerror = () => {
            // onerror 직후 onclose가 항상 fires하므로 로그만 기록
            console.warn('[WSClient] WS 오류 — onclose에서 재접속 처리');
            if (!this._started && typeof this.onPreStartFail === 'function') {
                this.onPreStartFail('error');
            }
        };
    }
}

// =============================================================================
// 코디네이터(레지스트리) 매칭 헬퍼 — DO 로비의 "빠진 고리".
// 빠른매칭(/match)·공개방목록(/rooms)은 CoordinatorDO가 제공한다(HTTP GET).
// DO 워커 베이스(wss://...)에서 https 코드 베이스를 유도해 호출한다. best-effort: 실패=null/[].
// =============================================================================

// wss://host → https://host (coord HTTP 엔드포인트). 기본값 = relay-do-poc 워커.
MultiplayerWSClient.coordHttpBase = function (workerBase) {
    const base = workerBase || 'wss://relay-do-poc.zuhejbeg.workers.dev';
    return base.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://').replace(/\/+$/, '');
};

// 빠른 매칭: 해당 게임의 열린 방(시작 전 + 자리 남음) 중 가장 찬 방 roomId. 없으면 null.
MultiplayerWSClient.quickMatch = async function (gameType, workerBase) {
    try {
        const url = MultiplayerWSClient.coordHttpBase(workerBase) + '/match?g=' + encodeURIComponent(gameType || 'mp');
        const r = await fetch(url, { method: 'GET' });
        if (!r.ok) return null;
        const d = await r.json();
        return (d && d.roomId) || null;
    } catch (e) { return null; }
};

// 공개 방 목록: [{roomId, gameType, players, max}]. 실패 시 [].
MultiplayerWSClient.listRooms = async function (gameType, workerBase) {
    try {
        const base = MultiplayerWSClient.coordHttpBase(workerBase);
        const url = base + '/rooms' + (gameType ? '?g=' + encodeURIComponent(gameType) : '');
        const r = await fetch(url, { method: 'GET' });
        if (!r.ok) return [];
        const d = await r.json();
        return (d && Array.isArray(d.rooms)) ? d.rooms : [];
    } catch (e) { return []; }
};

// 공유 가능한 짧은 방 코드(4자, 혼동문자 제외). 빠른매칭 실패 시 새 방 생성용.
MultiplayerWSClient.genRoomCode = function () {
    const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 4; i++) s += A[Math.floor(Math.random() * A.length)];
    return s;
};

// 진입 결정: ?room= 있으면 그 방. 없으면 빠른매칭 → 없으면 새 방 생성.
// returns { room, created } — created=true면 내가 새로 판 방(공유 코드 노출용).
MultiplayerWSClient.resolveEntryRoom = async function (gameType, explicitRoom, workerBase) {
    const r = (explicitRoom || '').trim();
    if (r) return { room: r.toUpperCase(), created: false };
    const matched = await MultiplayerWSClient.quickMatch(gameType, workerBase);
    if (matched) return { room: String(matched).toUpperCase(), created: false };
    return { room: MultiplayerWSClient.genRoomCode(), created: true };
};

// 브라우저 전역에 노출 (MultiplayerClient와 동일 패턴)
if (typeof window !== 'undefined') {
    window.MultiplayerWSClient = MultiplayerWSClient;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports.MultiplayerWSClient = MultiplayerWSClient;
}
