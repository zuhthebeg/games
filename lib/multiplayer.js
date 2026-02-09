/**
 * Multiplayer Client for Poker
 * relay.cocy.io 연결
 */

const RELAY_URL = 'https://relay.cocy.io';

// Singleton instance
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
            // Verify token is still valid
            try {
                const res = await this.request('GET', '/api/auth/me');
                if (res.id) {
                    this.userId = res.id;
                    this.nickname = res.nickname;
                    return true;
                }
            } catch (e) {
                // Token invalid, clear it
                this.clearAuth();
            }
        }

        // Create anonymous session
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
        // If same nickname and already authenticated, skip
        if (this.nickname === nickname && this.userId) {
            return { id: this.userId, nickname: this.nickname };
        }
        
        const res = await this.request('POST', '/api/auth/register', { nickname });
        this.token = res.token;
        this.userId = res.user.id;
        this.nickname = res.user.nickname;
        localStorage.setItem('relay_token', this.token);
        localStorage.setItem('relay_userId', this.userId);
        localStorage.setItem('relay_nickname', this.nickname);
        return res.user;
    }

    // ===== Room =====
    async createRoom(config = {}) {
        await this.ensureAuth();
        const res = await this.request('POST', '/api/rooms', {
            gameType: 'poker',
            config: {
                startingChips: config.startingChips || 1000,
                bigBlind: config.bigBlind || 20,
            },
            maxPlayers: config.maxPlayers || 8,
            isPublic: config.isPublic || false,
        });
        this.roomId = res.roomId;
        return res;
    }

    async joinRandom(gameType = 'poker') {
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
            const res = await this.request('POST', `/api/rooms/${roomId}/leave`);
            return res;
        } catch (e) {
            // Ignore leave errors (room might be deleted)
            console.log('Leave room error (ignored):', e.message);
            return { message: 'Left room' };
        }
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

    // ===== Game Actions =====
    async sendAction(action) {
        return await this.request('POST', `/api/rooms/${this.roomId}/action`, action);
    }

    async fold() {
        return await this.sendAction({ type: 'fold' });
    }

    async check() {
        return await this.sendAction({ type: 'check' });
    }

    async call() {
        return await this.sendAction({ type: 'call' });
    }

    async raise(amount) {
        return await this.sendAction({ type: 'raise', payload: { amount } });
    }

    async allIn() {
        return await this.sendAction({ type: 'allin' });
    }

    async rematch() {
        return await this.request('POST', `/api/rooms/${this.roomId}/rematch`);
    }

    // ===== Real-time Updates =====
    startListening() {
        if (!this.roomId || !this.token) return;

        // Try SSE first
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

            // Listen for all event types
            const eventTypes = ['player_joined', 'player_left', 'player_ready', 'game_started', 
                               'action', 'fold', 'check', 'call', 'raise', 'allin',
                               'flop', 'turn', 'river', 'win', 'game_ended', 'rematch_ready', 'host_changed'];

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
        // Refresh state after events
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

    isInRoom() {
        return !!this.roomId;
    }

    // Clean up any previous room state
    async cleanup() {
        this.stopListening();
        this.roomId = null;
        this.lastSeq = 0;
    }
}

// Export for use
window.MultiplayerClient = MultiplayerClient;
