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
        const mainAccessToken = localStorage.getItem('accessToken');
        if (mainAccessToken) {
            try {
                // JWT에서 직접 닉네임 추출 시도
                const parts = mainAccessToken.split('.');
                if (parts.length === 3) {
                    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
                    if (payload.sub) {
                        this.token = mainAccessToken;
                        this.userId = payload.sub;
                        this.nickname = payload.nickname || payload.email?.split('@')[0] || null;
                        this.isLoggedIn = true;
                        // localStorage에도 저장
                        localStorage.setItem('relay_token', this.token);
                        localStorage.setItem('relay_userId', this.userId);
                        if (this.nickname) localStorage.setItem('relay_nickname', this.nickname);
                        localStorage.setItem('cocy_user_id', this.userId);
                        console.log('[MP] Logged in user:', this.userId, 'nickname:', this.nickname);
                        return true;
                    }
                }
                
                // JWT 파싱 실패시 서버 확인
                const res = await fetch(`${RELAY_URL}/api/auth/me`, {
                    headers: { 'Authorization': `Bearer ${mainAccessToken}` }
                });
                if (res.ok) {
                    const user = await res.json();
                    this.token = mainAccessToken;
                    this.userId = user.id;
                    this.nickname = user.nickname;
                    this.isLoggedIn = true;
                    localStorage.setItem('relay_nickname', this.nickname || '');
                    localStorage.setItem('cocy_user_id', this.userId);
                    return true;
                }
            } catch (e) {
                console.log('Main auth check failed, falling back to anonymous');
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
        const res = await this.request('POST', '/api/rooms', {
            gameType,
            config: config.gameConfig || {},
            maxPlayers: config.maxPlayers || 2,
            isPublic: config.isPublic !== false,
            playerState: config.playerState || null,  // weapon, gold for enhance game
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

    async rematch() {
        return await this.request('POST', `/api/rooms/${this.roomId}/rematch`);
    }

    // ===== Game Actions (Generic) =====
    async sendAction(action) {
        return await this.request('POST', `/api/rooms/${this.roomId}/action`, action);
    }

    // ===== Real-time Updates =====
    startListening() {
        if (!this.roomId || !this.token) return;

        try {
            const url = `${RELAY_URL}/api/rooms/${this.roomId}/stream?token=${encodeURIComponent(this.token)}`;
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

        } catch (e) {
            console.log('SSE not available, using polling');
            this.startPolling();
        }
    }

    startPolling() {
        if (this.pollingInterval) return;
        
        this.pollingInterval = setInterval(async () => {
            try {
                const res = await this.request('GET', `/api/rooms/${this.roomId}/events?after=${this.lastSeq}`);
                if (res.events && res.events.length > 0) {
                    for (const event of res.events) {
                        this.handleEvent(event.type, event);
                        this.lastSeq = event.seq;
                    }
                }
            } catch (e) {
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
        }, 1000);
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
        this.lastSeq = 0;
    }

    handleEvent(type, data) {
        console.log('Event:', type, data);
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

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MultiplayerClient, RELAY_URL };
}
