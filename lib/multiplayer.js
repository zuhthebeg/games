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
        this.roomId = null;
        this.eventSource = null;
        this.lastSeq = 0;
        this.onEvent = null;
        this.onStateChange = null;
        this.onError = null;
        this.onRoomDestroyed = null;
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
        if (this.token && this.userId) {
            try {
                const res = await this.request('GET', '/api/auth/me');
                if (res.id) {
                    this.userId = res.id;
                    this.nickname = res.nickname;
                    return true;
                }
            } catch (e) {
                this.clearAuth();
            }
        }

        const res = await this.request('POST', '/api/auth/anonymous');
        this.token = res.token;
        this.userId = res.user.id;
        localStorage.setItem('relay_token', this.token);
        localStorage.setItem('relay_userId', this.userId);
        return true;
    }

    clearAuth() {
        this.token = null;
        this.userId = null;
        this.nickname = null;
        localStorage.removeItem('relay_token');
        localStorage.removeItem('relay_userId');
        localStorage.removeItem('relay_nickname');
    }

    async setNickname(nickname) {
        if (this.nickname === nickname && this.userId) {
            return { id: this.userId, nickname: this.nickname };
        }
        
        // Use nickname endpoint for anonymous users
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
        });
        this.roomId = res.roomId;
        return res;
    }

    async joinRandom(gameType) {
        await this.ensureAuth();
        const res = await this.request('POST', '/api/match/random', { gameType });
        this.roomId = res.roomId;
        return res;
    }

    async joinRoom(roomId) {
        await this.ensureAuth();
        this.roomId = roomId;
        const res = await this.request('POST', `/api/rooms/${roomId}/join`);
        return res;
    }

    async leaveRoom() {
        if (!this.roomId) return { message: 'Not in a room' };
        this.stopListening();
        const roomId = this.roomId;
        this.roomId = null;
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
        this.roomId = null;
        this.lastSeq = 0;
        return await this.request('POST', `/api/rooms/${roomId}/destroy`);
    }

    async getRoomState() {
        if (!this.roomId) throw new Error('Not in a room');
        return await this.request('GET', `/api/rooms/${this.roomId}`);
    }

    async setReady(ready = true) {
        return await this.request('POST', `/api/rooms/${this.roomId}/ready`, { ready });
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
