/**
 * Multiplayer UI Module
 * 공용 멀티플레이어 UI 컴포넌트
 * 
 * Usage:
 *   const mp = new MultiplayerUI({
 *     gameType: 'gomoku',
 *     gameName: '오목',
 *     container: document.getElementById('app'),
 *     maxPlayers: 2,
 *     onGameStart: (state) => { ... },
 *     onGameEvent: (type, data) => { ... },
 *     onStateChange: (state) => { ... }
 *   });
 *   mp.show();
 */

class MultiplayerUI {
    constructor(options) {
        this.gameType = options.gameType;
        this.gameName = options.gameName || options.gameType;
        this.container = options.container;
        this.maxPlayers = options.maxPlayers || 2;
        this.supportsLocal = options.supportsLocal !== false; // default true
        this.onGameStart = options.onGameStart || (() => {});
        this.onGameEvent = options.onGameEvent || (() => {});
        this.onStateChange = options.onStateChange || (() => {});
        this.onLeave = options.onLeave || (() => {});
        this.getPlayerData = options.getPlayerData || null;  // Optional: returns { weapon, gold, etc. }
        
        this.client = null;
        this.isHost = false;
        this.myReady = false;
        this.currentView = null;
        
        this._injectStyles();
    }

    // ===== Public API =====
    
    async show() {
        // Try reconnection first
        const reconnected = await this._tryReconnect();
        if (reconnected) return;
        
        this._renderModeSelect();
    }

    async _tryReconnect() {
        const client = MultiplayerClient.getInstance();
        if (!client.hasSavedRoom(this.gameType)) return false;

        try {
            this.client = client;
            const state = await client.tryReconnect(this.gameType);
            
            if (!state) {
                this.client = null;
                return false;
            }

            // Update host/ready status from state
            const myId = client.getMyUserId();
            const me = state.players?.find(p => p.id === myId);
            if (me) {
                this.isHost = me.isHost;
                this.myReady = me.isReady;
            }

            // If game is already playing, resume game
            if (state.status === 'playing') {
                this._setupWaitingRoomListeners();
                this.onGameStart(state);
                return true;
            }

            // Otherwise show waiting room
            this._renderWaitingRoom(client.getRoomCode());
            this._setupWaitingRoomListeners();
            this._refreshWaitingRoom();
            this._showToast('방에 재연결되었습니다');
            return true;
        } catch (e) {
            console.error('Reconnect failed:', e);
            this.client = null;
            return false;
        }
    }

    hide() {
        if (this.container) {
            this.container.innerHTML = '';
        }
    }

    getClient() {
        return this.client;
    }

    async sendAction(action) {
        if (!this.client) throw new Error('Not connected');
        return await this.client.sendAction(action);
    }

    async getState() {
        if (!this.client) throw new Error('Not connected');
        return await this.client.getRoomState();
    }

    showResult(options) {
        this._renderResult(options);
    }

    goToWaitingRoom() {
        this.myReady = false;  // Reset ready state for rematch
        this._renderWaitingRoom(this.client.getRoomCode());
        this._setupWaitingRoomListeners();
        this._refreshWaitingRoom();
    }

    // ===== Private: Styles =====
    
    _injectStyles() {
        if (document.getElementById('mp-ui-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'mp-ui-styles';
        style.textContent = `
            .mp-ui {
                --mp-bg: #1a1a2e;
                --mp-card: #16213e;
                --mp-accent: #4ecca3;
                --mp-danger: #ff6b6b;
                --mp-text: #eee;
                --mp-muted: #9ca3af;
                --mp-border: rgba(255,255,255,0.1);
                
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                color: var(--mp-text);
                min-height: 100%;
            }
            
            .mp-ui * { box-sizing: border-box; }
            
            .mp-screen {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 20px;
                min-height: 100vh;
                text-align: center;
            }
            
            .mp-title {
                font-size: 1.8rem;
                font-weight: 700;
                margin-bottom: 8px;
            }
            
            .mp-subtitle {
                color: var(--mp-muted);
                margin-bottom: 30px;
            }
            
            .mp-card {
                background: var(--mp-card);
                border-radius: 16px;
                padding: 24px;
                width: 100%;
                max-width: 380px;
                margin-bottom: 16px;
            }
            
            .mp-btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                padding: 12px 24px;
                border-radius: 10px;
                border: none;
                font-size: 1rem;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s;
                background: rgba(255,255,255,0.1);
                color: var(--mp-text);
                width: 100%;
            }
            
            .mp-btn:hover:not(:disabled) { 
                background: rgba(255,255,255,0.15); 
                transform: translateY(-1px);
            }
            
            .mp-btn:disabled { opacity: 0.5; cursor: not-allowed; }
            
            .mp-btn.primary { 
                background: var(--mp-accent); 
                color: #fff; 
                text-shadow: 0 1px 2px rgba(0,0,0,0.3);
            }
            .mp-btn.primary:hover:not(:disabled) { 
                background: #3db892; 
            }
            
            .mp-btn.danger { 
                background: var(--mp-danger); 
                color: #fff; 
            }
            
            .mp-btn.outline {
                background: transparent;
                border: 1px solid var(--mp-border);
            }
            
            .mp-btn.loading {
                pointer-events: none;
                opacity: 0.7;
            }
            
            .mp-btn.loading::after {
                content: '';
                width: 16px;
                height: 16px;
                border: 2px solid transparent;
                border-top-color: currentColor;
                border-radius: 50%;
                animation: mp-spin 0.8s linear infinite;
            }
            
            @keyframes mp-spin { to { transform: rotate(360deg); } }
            
            .mp-btn-group {
                display: flex;
                flex-direction: column;
                gap: 10px;
            }
            
            .mp-btn-row {
                display: flex;
                gap: 10px;
            }
            
            .mp-btn-row .mp-btn { flex: 1; }
            
            .mp-input {
                width: 100%;
                padding: 14px 16px;
                border-radius: 10px;
                border: 1px solid var(--mp-border);
                background: rgba(0,0,0,0.2);
                color: var(--mp-text);
                font-size: 1rem;
                outline: none;
                transition: border-color 0.2s;
            }
            
            .mp-input:focus { border-color: var(--mp-accent); }
            .mp-input::placeholder { color: var(--mp-muted); }
            
            .mp-field {
                margin-bottom: 16px;
                text-align: left;
            }
            
            .mp-label {
                display: block;
                font-size: 0.85rem;
                color: var(--mp-muted);
                margin-bottom: 6px;
            }
            
            .mp-checkbox {
                display: flex;
                align-items: center;
                gap: 10px;
                cursor: pointer;
                font-size: 0.95rem;
            }
            
            .mp-checkbox input {
                width: 18px;
                height: 18px;
                accent-color: var(--mp-accent);
            }
            
            .mp-room-code {
                font-size: 2.5rem;
                font-weight: 700;
                letter-spacing: 6px;
                color: var(--mp-accent);
                margin: 16px 0;
            }
            
            .mp-qr {
                margin: 16px 0;
            }
            
            .mp-qr img {
                border-radius: 8px;
                background: #fff;
                padding: 8px;
            }
            
            .mp-player-list {
                text-align: left;
            }
            
            .mp-player {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px;
                border-bottom: 1px solid var(--mp-border);
            }
            
            .mp-player:last-child { border-bottom: none; }
            
            .mp-player-name {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            .mp-player-name .crown { color: #ffd700; }
            
            .mp-badge {
                font-size: 0.8rem;
                padding: 4px 10px;
                border-radius: 20px;
                background: rgba(255,255,255,0.1);
            }
            
            .mp-badge.ready { background: var(--mp-accent); color: #000; }
            .mp-badge.host { background: #ffd700; color: #000; }
            
            .mp-status {
                color: var(--mp-muted);
                margin-top: 16px;
                font-size: 0.9rem;
            }
            
            .mp-divider {
                display: flex;
                align-items: center;
                gap: 16px;
                color: var(--mp-muted);
                margin: 20px 0;
            }
            
            .mp-divider::before,
            .mp-divider::after {
                content: '';
                flex: 1;
                height: 1px;
                background: var(--mp-border);
            }
            
            .mp-join-row {
                display: flex;
                gap: 10px;
            }
            
            .mp-join-row .mp-input {
                flex: 1;
                text-transform: uppercase;
            }
            
            .mp-join-row .mp-btn {
                width: auto;
                padding: 14px 20px;
            }
            
            .mp-result-overlay {
                position: fixed;
                inset: 0;
                background: rgba(0,0,0,0.85);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 1000;
                animation: mp-fade-in 0.3s;
            }
            
            @keyframes mp-fade-in {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            
            .mp-result-content {
                background: var(--mp-card);
                border-radius: 20px;
                padding: 32px;
                text-align: center;
                max-width: 350px;
                width: 90%;
                animation: mp-slide-up 0.3s;
            }
            
            @keyframes mp-slide-up {
                from { transform: translateY(20px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }
            
            .mp-result-title {
                font-size: 2.2rem;
                font-weight: 700;
                margin-bottom: 12px;
            }
            
            .mp-result-title.win { color: var(--mp-accent); }
            .mp-result-title.lose { color: var(--mp-danger); }
            
            .mp-result-detail {
                color: var(--mp-muted);
                margin-bottom: 24px;
                white-space: pre-line;
            }
            
            .mp-result-content .mp-btn {
                font-size: 1.1rem;
                padding: 14px 28px;
                font-weight: 700;
                color: #fff !important;
            }
            
            .mp-result-content .mp-btn.primary {
                background: linear-gradient(135deg, #4ecca3, #2d9a7a) !important;
                color: #fff !important;
                text-shadow: 0 2px 4px rgba(0,0,0,0.5);
                box-shadow: 0 4px 15px rgba(78, 204, 163, 0.4);
                border: none;
            }
            
            .mp-result-content .mp-btn.outline {
                background: rgba(255,255,255,0.1) !important;
                border: 2px solid rgba(255,255,255,0.5);
                color: #fff !important;
                text-shadow: 0 1px 2px rgba(0,0,0,0.3);
            }
            
            .mp-toast {
                position: fixed;
                bottom: 24px;
                left: 50%;
                transform: translateX(-50%);
                background: #333;
                color: #fff;
                padding: 12px 24px;
                border-radius: 10px;
                z-index: 2000;
                animation: mp-toast 0.3s;
            }
            
            @keyframes mp-toast {
                from { transform: translateX(-50%) translateY(10px); opacity: 0; }
                to { transform: translateX(-50%) translateY(0); opacity: 1; }
            }
            
            .mp-back-btn {
                position: absolute;
                top: 20px;
                left: 20px;
                background: none;
                border: none;
                color: var(--mp-muted);
                font-size: 1rem;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 6px;
            }
            
            .mp-back-btn:hover { color: var(--mp-text); }
        `;
        document.head.appendChild(style);
    }

    // ===== Private: Views =====
    
    _renderModeSelect() {
        this.currentView = 'mode';
        
        // If only multiplayer is supported, go directly to lobby
        if (!this.supportsLocal) {
            this._renderLobby();
            return;
        }
        
        this.container.innerHTML = `
            <div class="mp-ui">
                <div class="mp-screen">
                    <div class="mp-title">${this.gameName}</div>
                    <p class="mp-subtitle">게임 모드 선택</p>
                    
                    <div class="mp-card">
                        <div class="mp-btn-group">
                            <button class="mp-btn primary" data-action="lobby">
                                👥 멀티플레이어
                            </button>
                            <button class="mp-btn outline" data-action="local">
                                🎮 로컬 대전
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        this.container.querySelector('[data-action="lobby"]').onclick = () => this._renderLobby();
        this.container.querySelector('[data-action="local"]').onclick = () => {
            this.onGameStart({ mode: 'local' });
        };
    }

    _renderLobby() {
        this.currentView = 'lobby';
        
        const isLoggedIn = typeof SharedWallet !== 'undefined' && SharedWallet.isLoggedIn;
        const roomNamePlaceholders = ['덤벼!', '한판 뜨자', '고수만 오세요', '초보 환영', '올 사람?', '가보자고!'];
        const randomPlaceholder = roomNamePlaceholders[Math.floor(Math.random() * roomNamePlaceholders.length)];
        
        this.container.innerHTML = `
            <div class="mp-ui">
                <div class="mp-screen">
                    <button class="mp-back-btn" data-action="back">← 뒤로</button>
                    
                    <div class="mp-title">👥 멀티플레이어</div>
                    <p class="mp-subtitle">${this.gameName}</p>
                    
                    <!-- 탭 -->
                    <div class="mp-tabs" style="display:flex;gap:0;margin-bottom:16px;border-radius:10px;overflow:hidden;border:1px solid #334155;">
                        <button class="mp-tab active" data-tab="rooms" style="flex:1;padding:10px;background:#1e293b;color:#fff;border:none;cursor:pointer;font-size:0.9rem;font-weight:600;">🏠 방 목록</button>
                        <button class="mp-tab" data-tab="create" style="flex:1;padding:10px;background:#0f172a;color:#64748b;border:none;cursor:pointer;font-size:0.9rem;">➕ 방 만들기</button>
                        <button class="mp-tab" data-tab="join" style="flex:1;padding:10px;background:#0f172a;color:#64748b;border:none;cursor:pointer;font-size:0.9rem;">🔗 코드 입장</button>
                    </div>
                    
                    <!-- 방 목록 탭 -->
                    <div class="mp-tab-content" data-content="rooms">
                        <div id="mp-room-list" style="min-height:120px;">
                            <div style="text-align:center;color:#64748b;padding:30px;">로딩 중...</div>
                        </div>
                        <button class="mp-btn" data-action="random" style="width:100%;margin-top:12px;">🎲 랜덤 매칭</button>
                    </div>
                    
                    <!-- 방 만들기 탭 -->
                    <div class="mp-tab-content" data-content="create" style="display:none;">
                        ${isLoggedIn ? `
                            <div class="mp-card">
                                <div class="mp-field">
                                    <label class="mp-label">방 이름</label>
                                    <input type="text" class="mp-input" id="mp-room-name" 
                                           placeholder="${randomPlaceholder}" maxlength="20">
                                </div>
                                <label class="mp-checkbox">
                                    <input type="checkbox" id="mp-public" checked>
                                    공개 방 (랜덤 매칭 허용)
                                </label>
                                <button class="mp-btn primary" data-action="create" style="width:100%;margin-top:12px;">
                                    🏠 방 만들기
                                </button>
                            </div>
                        ` : `
                            <div class="mp-card" style="text-align:center;padding:30px;">
                                <p style="color:#94a3b8;margin-bottom:16px;">로그인 후 방을 만들 수 있습니다</p>
                                <button class="mp-btn primary" onclick="SharedWallet.showLogin()">🔑 로그인</button>
                            </div>
                        `}
                    </div>
                    
                    <!-- 코드 입장 탭 -->
                    <div class="mp-tab-content" data-content="join" style="display:none;">
                        <div class="mp-card">
                            <div class="mp-field">
                                <label class="mp-label">방 코드</label>
                                <div style="display:flex;gap:8px;">
                                    <input type="text" class="mp-input" id="mp-room-code" 
                                           placeholder="6자리 코드" maxlength="6" style="flex:1;">
                                    <button class="mp-btn" data-action="qr-scan" style="padding:8px 14px;font-size:1.2rem;" title="QR 스캔">📷</button>
                                </div>
                            </div>
                            <button class="mp-btn primary" data-action="join" style="width:100%;margin-top:12px;">입장</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // 탭 전환
        this.container.querySelectorAll('.mp-tab').forEach(tab => {
            tab.onclick = () => {
                this.container.querySelectorAll('.mp-tab').forEach(t => {
                    t.style.background = '#0f172a'; t.style.color = '#64748b'; t.classList.remove('active');
                });
                tab.style.background = '#1e293b'; tab.style.color = '#fff'; tab.classList.add('active');
                this.container.querySelectorAll('.mp-tab-content').forEach(c => c.style.display = 'none');
                this.container.querySelector(`[data-content="${tab.dataset.tab}"]`).style.display = 'block';
                if (tab.dataset.tab === 'rooms') this._loadRoomList();
            };
        });
        
        const backBtn = this.container.querySelector('[data-action="back"]');
        if (backBtn) backBtn.onclick = () => {
            if (this.supportsLocal) this._renderModeSelect(); else this.onLeave();
        };
        
        const createBtn = this.container.querySelector('[data-action="create"]');
        if (createBtn) createBtn.onclick = (e) => this._handleCreate(e.target);
        
        const randomBtn = this.container.querySelector('[data-action="random"]');
        if (randomBtn) randomBtn.onclick = (e) => this._handleRandom(e.target);
        
        const joinBtn = this.container.querySelector('[data-action="join"]');
        if (joinBtn) joinBtn.onclick = (e) => this._handleJoin(e.target);
        
        const qrBtn = this.container.querySelector('[data-action="qr-scan"]');
        if (qrBtn) qrBtn.onclick = () => this._openQRScanner();
        
        // 방 목록 로드
        this._loadRoomList();
    }
    
    // 방 목록 로드
    async _loadRoomList() {
        const listEl = document.getElementById('mp-room-list');
        if (!listEl) return;
        
        try {
            const res = await fetch(`https://relay.cocy.io/api/rooms?gameType=${this.gameType}&status=waiting`);
            if (!res.ok) throw new Error('Failed to load');
            const data = await res.json();
            const rooms = data.rooms || [];
            
            if (rooms.length === 0) {
                listEl.innerHTML = `<div style="text-align:center;color:#64748b;padding:30px;">
                    <div style="font-size:2rem;margin-bottom:8px;">🏜️</div>
                    대기 중인 방이 없습니다<br>
                    <span style="font-size:0.85rem;">방을 만들거나 랜덤 매칭을 시도해보세요</span>
                </div>`;
                return;
            }
            
            listEl.innerHTML = rooms.map(r => {
                const playerCount = r.player_count || 0;
                const maxP = r.max_players || this.maxPlayers;
                const cfg = r.config ? (typeof r.config === 'string' ? JSON.parse(r.config) : r.config) : {};
                const roomName = cfg.roomName || '대전 방';
                return `<div class="mp-room-item" data-room-id="${r.id}" style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:#1e293b;border-radius:10px;margin-bottom:8px;cursor:pointer;border:1px solid #334155;transition:border-color 0.2s;">
                    <div>
                        <div style="font-weight:600;color:#fff;">${roomName}</div>
                        <div style="font-size:0.8rem;color:#64748b;margin-top:2px;">👥 ${playerCount}/${maxP}</div>
                    </div>
                    <button class="mp-btn" style="padding:6px 16px;font-size:0.85rem;">입장</button>
                </div>`;
            }).join('');
            
            listEl.querySelectorAll('.mp-room-item').forEach(item => {
                item.onclick = () => {
                    const code = item.dataset.roomId;
                    document.getElementById('mp-room-code')?.setAttribute('value', code);
                    this._handleJoinDirect(code, item.querySelector('.mp-btn'));
                };
            });
        } catch (e) {
            listEl.innerHTML = `<div style="text-align:center;color:#ef4444;padding:20px;">방 목록 로드 실패</div>`;
        }
    }
    
    // 방 목록에서 직접 입장
    async _handleJoinDirect(roomCode, btn) {
        const nickname = this._getLoginNickname();
        if (!nickname) {
            this._showToast('로그인이 필요합니다');
            if (typeof SharedWallet !== 'undefined') SharedWallet.showLogin();
            return;
        }
        this._setLoading(btn, true);
        try {
            this.client = MultiplayerClient.getInstance();
            await this.client.ensureAuth();
            await this.client.setNickname(nickname);
            const playerState = this.getPlayerData ? this.getPlayerData() : null;
            await this.client.joinRoom(roomCode, this.gameType, playerState);
            this._renderWaitingRoom(roomCode);
            this._setupWaitingRoomListeners();
            this._refreshWaitingRoom();
        } catch (e) {
            this._showToast('입장 실패: ' + e.message);
        } finally {
            this._setLoading(btn, false);
        }
    }
    
    // 로그인 유저 닉네임 가져오기
    _getLoginNickname() {
        if (typeof SharedWallet !== 'undefined' && SharedWallet.isLoggedIn && SharedWallet.user?.nickname) {
            return SharedWallet.user.nickname;
        }
        return null;
    }
    
    // QR 스캐너
    _openQRScanner() {
        const overlay = document.createElement('div');
        overlay.id = 'mp-qr-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:10001;display:flex;flex-direction:column;align-items:center;justify-content:center;';
        overlay.innerHTML = `
            <div style="color:#fff;font-size:1.1rem;margin-bottom:16px;">📷 QR 코드를 스캔하세요</div>
            <video id="mp-qr-video" style="width:280px;height:280px;border-radius:16px;border:3px solid #4ecca3;object-fit:cover;" autoplay playsinline></video>
            <div id="mp-qr-status" style="color:#94a3b8;margin-top:12px;font-size:0.9rem;">카메라 시작 중...</div>
            <button id="mp-qr-close" style="margin-top:20px;background:#ef4444;border:none;color:#fff;padding:10px 24px;border-radius:10px;cursor:pointer;">닫기</button>
        `;
        document.body.appendChild(overlay);
        
        const video = document.getElementById('mp-qr-video');
        const statusEl = document.getElementById('mp-qr-status');
        let stream = null;
        let scanning = true;
        
        const close = () => {
            scanning = false;
            if (stream) stream.getTracks().forEach(t => t.stop());
            overlay.remove();
        };
        
        document.getElementById('mp-qr-close').onclick = close;
        overlay.onclick = (e) => { if (e.target === overlay) close(); };
        
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
            .then(s => {
                stream = s;
                video.srcObject = s;
                statusEl.textContent = '카메라 활성 — QR 코드를 비추세요';
                
                // QR 스캔 루프 (BarcodeDetector API 사용)
                if ('BarcodeDetector' in window) {
                    const detector = new BarcodeDetector({ formats: ['qr_code'] });
                    const scanLoop = async () => {
                        if (!scanning) return;
                        try {
                            const codes = await detector.detect(video);
                            if (codes.length > 0) {
                                const url = codes[0].rawValue;
                                const match = url.match(/[?&]room=([A-Za-z0-9]+)/);
                                if (match) {
                                    close();
                                    const codeInput = document.getElementById('mp-room-code');
                                    if (codeInput) codeInput.value = match[1];
                                    this._showToast('QR 인식: ' + match[1]);
                                    // 자동 입장
                                    this._handleJoinDirect(match[1], null);
                                    return;
                                }
                            }
                        } catch {}
                        requestAnimationFrame(scanLoop);
                    };
                    scanLoop();
                } else {
                    statusEl.textContent = '이 브라우저에서 QR 스캔을 지원하지 않습니다';
                }
            })
            .catch(e => {
                statusEl.textContent = '카메라 접근 실패: ' + e.message;
            });
    }

    _renderWaitingRoom(roomCode) {
        this.currentView = 'waiting';
        const baseUrl = window.location.origin + window.location.pathname.replace(/\/$/, '');
        const joinUrl = `${baseUrl}/?room=${roomCode}`;
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(joinUrl)}`;
        
        this.container.innerHTML = `
            <div class="mp-ui">
                <div class="mp-screen">
                    <div class="mp-title">대기실</div>
                    <div class="mp-room-code">${roomCode}</div>
                    
                    <div class="mp-qr">
                        <img src="${qrUrl}" alt="QR Code">
                    </div>
                    
                    <div class="mp-btn-row" style="max-width:300px;margin-bottom:20px;">
                        <button class="mp-btn outline" data-action="copy">📋 복사</button>
                        <button class="mp-btn outline" data-action="share">🔗 공유</button>
                    </div>
                    
                    <div class="mp-card mp-player-list" id="mp-player-list">
                        <!-- Players will be rendered here -->
                    </div>
                    
                    <div class="mp-btn-row" style="max-width:380px;">
                        <button class="mp-btn" id="mp-ready-btn" data-action="ready" style="display:none;">
                            준비
                        </button>
                        <button class="mp-btn primary" id="mp-start-btn" data-action="start" style="display:none;" disabled>
                            게임 시작
                        </button>
                    </div>
                    
                    <div class="mp-btn-row" style="max-width:380px;margin-top:10px;">
                        <button class="mp-btn outline" data-action="leave">나가기</button>
                        <button class="mp-btn danger" id="mp-destroy-btn" data-action="destroy" style="display:none;">
                            🗑️ 방 폭파
                        </button>
                    </div>
                    
                    <p class="mp-status" id="mp-status">대기 중...</p>
                </div>
            </div>
        `;
        
        this.container.querySelector('[data-action="copy"]').onclick = () => this._copyCode(roomCode);
        this.container.querySelector('[data-action="share"]').onclick = () => this._shareLink(roomCode);
        this.container.querySelector('[data-action="ready"]').onclick = (e) => this._handleReady(e.target);
        this.container.querySelector('[data-action="start"]').onclick = (e) => this._handleStart(e.target);
        this.container.querySelector('[data-action="leave"]').onclick = (e) => this._handleLeave(e.target);
        this.container.querySelector('[data-action="destroy"]').onclick = (e) => this._handleDestroy(e.target);
    }

    _renderResult(options) {
        const overlay = document.createElement('div');
        overlay.className = 'mp-result-overlay';
        overlay.id = 'mp-result-overlay';
        
        const titleClass = options.isWin ? 'win' : (options.isWin === false ? 'lose' : '');
        const showRematch = options.showRematch !== false;
        
        overlay.innerHTML = `
            <div class="mp-result-content">
                <div class="mp-result-title ${titleClass}">${options.title}</div>
                <p class="mp-result-detail">${options.detail || ''}</p>
                <div class="mp-btn-group">
                    ${showRematch ? '<button class="mp-btn primary" data-action="rematch">🔄 리매치</button>' : ''}
                    <button class="mp-btn outline" data-action="exit">나가기</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
        
        if (showRematch) {
            overlay.querySelector('[data-action="rematch"]').onclick = (e) => this._handleRematch(e.target);
        }
        overlay.querySelector('[data-action="exit"]').onclick = () => this._handleExit();
    }

    _hideResult() {
        const overlay = document.getElementById('mp-result-overlay');
        if (overlay) overlay.remove();
    }

    // ===== Private: Handlers =====
    
    async _handleCreate(btn) {
        // 로그인 유저만 방 만들기 가능
        const nickname = this._getLoginNickname();
        if (!nickname) {
            this._showToast('로그인이 필요합니다');
            if (typeof SharedWallet !== 'undefined') SharedWallet.showLogin();
            return;
        }
        
        this._setLoading(btn, true);
        
        try {
            this.client = MultiplayerClient.getInstance();
            await this.client.ensureAuth();
            await this.client.setNickname(nickname);
            
            const isPublic = document.getElementById('mp-public')?.checked ?? true;
            const roomName = document.getElementById('mp-room-name')?.value.trim() || '';
            const playerState = this.getPlayerData ? this.getPlayerData() : null;
            const room = await this.client.createRoom(this.gameType, {
                maxPlayers: this.maxPlayers,
                isPublic,
                playerState,
                roomName
            });
            
            this.isHost = true;
            this._renderWaitingRoom(room.roomId);
            this._setupWaitingRoomListeners();
            this._refreshWaitingRoom();
        } catch (e) {
            this._showToast('방 생성 실패: ' + e.message);
        } finally {
            this._setLoading(btn, false);
        }
    }

    async _handleRandom(btn) {
        const nickname = this._getLoginNickname() || ('게스트' + Math.floor(Math.random()*1000));
        this._setLoading(btn, true);
        
        try {
            this.client = MultiplayerClient.getInstance();
            await this.client.ensureAuth();
            await this.client.setNickname(nickname);
            
            const result = await this.client.joinRandom(this.gameType);
            this.isHost = false;
            this._renderWaitingRoom(result.roomId);
            this._setupWaitingRoomListeners();
            this._refreshWaitingRoom();
        } catch (e) {
            if (e.message.includes('공개 방이 없')) {
                this._showToast('참가 가능한 방이 없습니다. 방을 만들어보세요!');
            } else {
                this._showToast('매칭 실패: ' + e.message);
            }
        } finally {
            this._setLoading(btn, false);
        }
    }

    async _handleJoin(btn) {
        const code = document.getElementById('mp-room-code').value.trim().toUpperCase();
        if (!code || code.length !== 6) {
            this._showToast('6자리 방 코드를 입력하세요');
            return;
        }
        
        const nickname = this._getLoginNickname() || ('게스트' + Math.floor(Math.random()*1000));
        this._setLoading(btn, true);
        
        try {
            this.client = MultiplayerClient.getInstance();
            await this.client.ensureAuth();
            await this.client.setNickname(nickname);
            
            // Send player data (weapon, gold) when joining
            const playerState = this.getPlayerData ? this.getPlayerData() : null;
            await this.client.joinRoom(code, this.gameType, playerState);
            this.isHost = false;
            this._renderWaitingRoom(code);
            this._setupWaitingRoomListeners();
            this._refreshWaitingRoom();
        } catch (e) {
            this._showToast('입장 실패: ' + e.message);
        } finally {
            this._setLoading(btn, false);
        }
    }

    async _handleReady(btn) {
        this._setLoading(btn, true);
        
        try {
            const newReady = !this.myReady;
            
            // Get player data if callback is provided and player is getting ready
            let playerData = null;
            if (newReady && this.getPlayerData) {
                playerData = this.getPlayerData();
            }
            
            await this.client.setReady(newReady, playerData);
            this.myReady = newReady;
            btn.textContent = this.myReady ? '준비 취소' : '준비';
            btn.classList.toggle('primary', this.myReady);
        } catch (e) {
            this._showToast('실패: ' + e.message);
        } finally {
            this._setLoading(btn, false);
        }
    }

    async _handleStart(btn) {
        if (btn.disabled) return;
        this._setLoading(btn, true);
        
        try {
            // Host sends their player data before starting
            if (this.getPlayerData) {
                const playerData = this.getPlayerData();
                await this.client.setReady(true, playerData);
            }
            
            await this.client.startGame();
        } catch (e) {
            this._showToast('시작 실패: ' + e.message);
            this._setLoading(btn, false);
        }
    }

    async _handleLeave(btn) {
        this._setLoading(btn, true);
        
        try {
            await this.client.leaveRoom();
            MultiplayerClient.resetInstance();
            this.client = null;
            this.isHost = false;
            this.myReady = false;
            this._renderLobby();
        } catch (e) {
            console.error('Leave error:', e);
        }
    }

    async _handleDestroy(btn) {
        if (!confirm('정말 방을 폭파하시겠습니까?')) return;
        
        this._setLoading(btn, true);
        
        try {
            await this.client.destroyRoom();
            MultiplayerClient.resetInstance();
            this.client = null;
            this.isHost = false;
            this._renderLobby();
            this._showToast('방 폭파 완료');
        } catch (e) {
            this._showToast('실패: ' + e.message);
        } finally {
            this._setLoading(btn, false);
        }
    }

    async _handleRematch(btn) {
        this._setLoading(btn, true);
        console.log('[MP-UI] _handleRematch started, roomId:', this.client?.roomId);
        
        try {
            // 리매치 시 최신 무기 데이터 전송 (무기 파괴 후 새 무기 반영)
            const playerData = this.getPlayerData ? this.getPlayerData() : null;
            console.log('[MP-UI] rematch playerData:', playerData);
            
            const result = await this.client.rematch(playerData);
            console.log('[MP-UI] rematch response:', result);
            this._hideResult();
            this.goToWaitingRoom();
        } catch (e) {
            console.error('[MP-UI] rematch error:', e);
            this._showToast('리매치 요청 실패: ' + e.message);
            this._setLoading(btn, false);
        }
    }

    _handleExit() {
        this._hideResult();
        
        if (this.client) {
            this.client.leaveRoom().catch(() => {});
            this.client._clearRoom();
            MultiplayerClient.resetInstance();
            this.client = null;
        }
        
        this.isHost = false;
        this.myReady = false;
        this.onLeave();
        this._renderModeSelect();
    }

    // ===== Private: Waiting Room =====
    
    _setupWaitingRoomListeners() {
        if (!this.client) return;
        
        this.client.onStateChange = (state) => this._updateWaitingRoom(state);
        this.client.onEvent = (type, data) => this._handleEvent(type, data);
        this.client.startListening();
    }

    async _refreshWaitingRoom() {
        try {
            const state = await this.client.getRoomState();
            this._updateWaitingRoom(state);
        } catch (e) {
            console.error('Refresh error:', e);
        }
    }

    _updateWaitingRoom(state) {
        if (!state || !state.players) return;
        if (this.currentView !== 'waiting') return;
        
        const myId = this.client.getMyUserId();
        const me = state.players.find(p => p.id === myId);
        
        if (me) {
            this.isHost = me.isHost;
            this.myReady = me.isReady;
        }
        
        // Update buttons
        const readyBtn = document.getElementById('mp-ready-btn');
        const startBtn = document.getElementById('mp-start-btn');
        const destroyBtn = document.getElementById('mp-destroy-btn');
        
        if (readyBtn) {
            readyBtn.style.display = this.isHost ? 'none' : '';
            readyBtn.textContent = this.myReady ? '준비 취소' : '준비';
            readyBtn.classList.toggle('primary', this.myReady);
        }
        
        if (startBtn) {
            startBtn.style.display = this.isHost ? '' : 'none';
        }
        
        if (destroyBtn) {
            destroyBtn.style.display = this.isHost ? '' : 'none';
        }
        
        // Render players
        const playerList = document.getElementById('mp-player-list');
        if (playerList) {
            playerList.innerHTML = state.players.map(p => `
                <div class="mp-player">
                    <div class="mp-player-name">
                        ${p.isHost ? '<span class="crown">👑</span>' : ''}
                        <span>${p.nickname || 'Player'}</span>
                        ${p.id === myId ? '<span style="color:var(--mp-muted)">(나)</span>' : ''}
                    </div>
                    <span class="mp-badge ${p.isReady ? 'ready' : ''} ${p.isHost ? 'host' : ''}">
                        ${p.isHost ? '방장' : (p.isReady ? '준비완료' : '대기중')}
                    </span>
                </div>
            `).join('');
        }
        
        // Update start button and status
        const statusEl = document.getElementById('mp-status');
        
        if (this.isHost && startBtn) {
            const others = state.players.filter(p => !p.isHost);
            const canStart = state.players.length >= 2 && others.every(p => p.isReady);
            startBtn.disabled = !canStart;
            
            if (statusEl) {
                statusEl.textContent = canStart ? '게임 시작 가능!' : '상대를 기다리는 중...';
            }
        } else if (statusEl) {
            statusEl.textContent = this.myReady ? '방장이 시작하기를 기다리는 중...' : '준비 버튼을 눌러주세요';
        }
        
        // Game started
        if (state.status === 'playing') {
            this.onGameStart(state);
        }
    }

    _handleEvent(type, data) {
        console.log('[MP-UI] _handleEvent:', type, data);
        
        if (type === 'room_destroyed') {
            console.log('[MP-UI] room_destroyed - resetting client');
            MultiplayerClient.resetInstance();
            this.client = null;
            this.isHost = false;
            this._showToast('방이 폭파되었습니다');
            this._renderLobby();
        } else if (type === 'rematch_ready') {
            const myId = this.client?.getMyUserId();
            if (data.userId !== myId) {
                this._showToast('🔄 상대가 리매치를 요청했습니다!');
            }
            // 리매치 요청 시 바로 대기실로 이동
            this._hideResult();
            this.goToWaitingRoom();
        }
        
        this.onGameEvent(type, data);
    }

    // ===== Private: Utilities =====
    
    _getNickname(allowRandom = false) {
        const input = document.getElementById('mp-nickname');
        let nickname = input?.value.trim() || '';
        
        // 로그인 상태면 JWT에서 가져온 닉네임 우선 사용
        if (!nickname || nickname.length < 2) {
            const relayNickname = localStorage.getItem('relay_nickname');
            if (relayNickname && relayNickname.length >= 2) {
                nickname = relayNickname;
                console.log('[MP-UI] Using relay_nickname:', nickname);
            }
        }
        
        // JWT 토큰에서 닉네임 추출 시도
        if (!nickname || nickname.length < 2) {
            const accessToken = localStorage.getItem('accessToken');
            if (accessToken) {
                try {
                    const parts = accessToken.split('.');
                    if (parts.length === 3) {
                        const payload = JSON.parse(decodeURIComponent(atob(parts[1].replace(/-/g,"+").replace(/_/g,"/")).split("").map(c=>"%"+("00"+c.charCodeAt(0).toString(16)).slice(-2)).join("")));
                        if (payload.nickname && payload.nickname.length >= 2) {
                            nickname = payload.nickname;
                            console.log('[MP-UI] Using JWT nickname:', nickname);
                        } else if (payload.email) {
                            nickname = payload.email.split('@')[0];
                            console.log('[MP-UI] Using email prefix as nickname:', nickname);
                        }
                    }
                } catch (e) {
                    console.log('[MP-UI] JWT parse failed:', e);
                }
            }
        }
        
        // 여전히 없으면 랜덤 생성
        if (!nickname || nickname.length < 2) {
            if (allowRandom) {
                nickname = 'Player_' + Math.random().toString(36).substr(2, 4);
                console.log('[MP-UI] Generated random nickname:', nickname);
            } else {
                this._showToast('닉네임을 2자 이상 입력하세요');
                return null;
            }
        }
        
        localStorage.setItem(`${this.gameType}_nickname`, nickname);
        return nickname;
    }

    _setLoading(btn, loading) {
        if (!btn) return;
        btn.classList.toggle('loading', loading);
        if (loading) {
            btn.dataset.originalText = btn.textContent;
            btn.textContent = '';
        } else if (btn.dataset.originalText) {
            btn.textContent = btn.dataset.originalText;
        }
    }

    _copyCode(code) {
        navigator.clipboard.writeText(code)
            .then(() => this._showToast('코드 복사됨!'))
            .catch(() => prompt('코드:', code));
    }

    _shareLink(code) {
        const url = `${window.location.origin}${window.location.pathname}?room=${code}`;
        
        if (navigator.share) {
            navigator.share({
                title: `${this.gameName} 대결`,
                text: `${this.gameName} 한 판 하자! 방 코드: ${code}`,
                url
            }).catch(() => {});
        } else {
            navigator.clipboard.writeText(url)
                .then(() => this._showToast('링크 복사됨!'))
                .catch(() => prompt('링크:', url));
        }
    }

    _showToast(msg) {
        const existing = document.querySelector('.mp-toast');
        if (existing) existing.remove();
        
        const toast = document.createElement('div');
        toast.className = 'mp-toast';
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2500);
    }

    // ===== Static: URL Check =====
    
    static checkUrlRoom() {
        const params = new URLSearchParams(window.location.search);
        const roomCode = params.get('room');
        if (roomCode) {
            window.history.replaceState({}, '', window.location.pathname);
            return roomCode;
        }
        return null;
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MultiplayerUI };
}
