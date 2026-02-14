/**
 * 공용 재화 시스템 (Shared Wallet)
 * 모든 게임에서 import해서 사용
 * 
 * Usage:
 *   <script src="/lib/shared-wallet.js"></script>
 *   await SharedWallet.init();
 *   SharedWallet.addGold(100);
 *   SharedWallet.removeGold(50);
 */

const SharedWallet = {
    gold: 0,
    isLoggedIn: false,
    user: null,
    cloudSyncEnabled: false,
    _initialized: false,
    _listeners: [],
    _showUI: true,  // UI 표시 여부
    
    AUTH_API: 'https://relay.cocy.io/api/auth',
    DATA_API: 'https://relay.cocy.io/api/user/data',
    
    // 초기화 (options: { showUI: false } 로 UI 숨김 가능)
    async init(options = {}) {
        if (this._initialized) return this;
        this._initialized = true;
        
        // UI 표시 설정
        if (options.showUI === false) {
            this._showUI = false;
        }
        
        // 로컬 데이터 로드
        this._loadLocal();
        
        // 인증 체크
        await this._checkAuth();
        
        // UI 자동 삽입 (showUI가 true일 때만)
        if (this._showUI) {
            this._injectUI();
        }
        
        return this;
    },
    
    // 로컬 스토리지에서 로드
    _loadLocal() {
        try {
            const data = localStorage.getItem('enhance_game_v3');
            if (data) {
                const parsed = JSON.parse(data);
                this.gold = parsed.gold || 0;
            }
        } catch (e) {
            console.log('SharedWallet: Local load failed', e);
        }
    },
    
    // 로컬 + 클라우드 저장
    async _save() {
        // 로컬 저장
        try {
            const data = localStorage.getItem('enhance_game_v3');
            const parsed = data ? JSON.parse(data) : {};
            parsed.gold = this.gold;
            localStorage.setItem('enhance_game_v3', JSON.stringify(parsed));
        } catch (e) {
            console.log('SharedWallet: Local save failed', e);
        }
        
        // 클라우드 저장
        if (this.cloudSyncEnabled) {
            const token = localStorage.getItem('cocy_auth_token');
            if (token) {
                try {
                    await fetch(this.DATA_API, {
                        method: 'PUT',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ gold: this.gold })
                    });
                } catch (e) {
                    console.log('SharedWallet: Cloud save failed', e);
                }
            }
        }
        
        this._notifyListeners();
    },
    
    // 메인 도메인에서 토큰 동기화 (cross-domain)
    async _syncAuthFromMain() {
        // 이미 토큰 있으면 스킵
        if (localStorage.getItem('cocy_auth_token')) return;
        
        // 현재 도메인이 cocy.io면 스킵
        if (window.location.hostname === 'cocy.io' || window.location.hostname === 'www.cocy.io') return;
        
        return new Promise((resolve) => {
            const iframe = document.createElement('iframe');
            iframe.style.display = 'none';
            iframe.src = 'https://cocy.io/auth-bridge.html';
            
            const timeout = setTimeout(() => {
                iframe.remove();
                resolve();
            }, 3000);
            
            const handler = (event) => {
                if (event.origin !== 'https://cocy.io') return;
                
                if (event.data.type === 'AUTH_BRIDGE_READY') {
                    iframe.contentWindow.postMessage({ type: 'GET_AUTH_TOKEN' }, 'https://cocy.io');
                }
                
                if (event.data.type === 'AUTH_TOKEN_RESPONSE') {
                    clearTimeout(timeout);
                    window.removeEventListener('message', handler);
                    
                    if (event.data.accessToken) {
                        localStorage.setItem('cocy_auth_token', event.data.accessToken);
                        if (event.data.refreshToken) {
                            localStorage.setItem('cocy_refresh_token', event.data.refreshToken);
                        }
                    }
                    
                    iframe.remove();
                    resolve();
                }
            };
            
            window.addEventListener('message', handler);
            document.body.appendChild(iframe);
        });
    },
    
    // 인증 체크
    async _checkAuth() {
        // 먼저 메인 도메인에서 토큰 동기화 시도
        await this._syncAuthFromMain();
        
        const token = localStorage.getItem('cocy_auth_token');
        if (!token) {
            this.isLoggedIn = false;
            this.user = null;
            return;
        }
        
        try {
            // 토큰 파싱
            const parts = token.split('.');
            if (parts.length !== 3) throw new Error('Invalid token');
            
            const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
            
            // 만료 확인
            if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
                const refreshed = await this._refreshToken();
                if (!refreshed) {
                    this.logout();
                    return;
                }
            }
            
            // 로그인 유저 확인 (sub 필드가 있으면 로그인)
            if (payload.sub) {
                this.isLoggedIn = true;
                this.cloudSyncEnabled = true;
                
                // 유저 정보 가져오기
                const [userRes, dataRes] = await Promise.all([
                    fetch(`${this.AUTH_API}/me`, { headers: { Authorization: `Bearer ${token}` } }),
                    fetch(this.DATA_API, { headers: { Authorization: `Bearer ${token}` } })
                ]);
                
                if (userRes.ok) {
                    this.user = await userRes.json();
                }
                
                if (dataRes.ok) {
                    const data = await dataRes.json();
                    if (data.gold !== undefined) {
                        this.gold = data.gold;
                    }
                }
            }
        } catch (e) {
            console.log('SharedWallet: Auth check failed', e);
            this.isLoggedIn = false;
        }
    },
    
    // 토큰 리프레시
    async _refreshToken() {
        const refreshToken = localStorage.getItem('cocy_refresh_token');
        if (!refreshToken) return false;
        
        try {
            const res = await fetch(`${this.AUTH_API}/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken })
            });
            
            if (res.ok) {
                const data = await res.json();
                localStorage.setItem('cocy_auth_token', data.accessToken);
                if (data.refreshToken) {
                    localStorage.setItem('cocy_refresh_token', data.refreshToken);
                }
                return true;
            }
        } catch (e) {
            console.log('SharedWallet: Token refresh failed', e);
        }
        return false;
    },
    
    // 로그아웃
    logout() {
        localStorage.removeItem('cocy_auth_token');
        localStorage.removeItem('cocy_refresh_token');
        this.isLoggedIn = false;
        this.cloudSyncEnabled = false;
        this.user = null;
        this._notifyListeners();
        this._updateUI();
    },
    
    // 로그인 모달 표시
    showLogin() {
        let modal = document.getElementById('sw-login-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'sw-login-modal';
            modal.innerHTML = `
                <div style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);z-index:10000;display:flex;justify-content:center;align-items:center;">
                    <div style="background:#1e293b;border-radius:20px;padding:30px;max-width:400px;width:90%;text-align:center;color:#fff;">
                        <h2 style="margin-bottom:20px;">🔑 로그인</h2>
                        <form id="sw-login-form">
                            <input type="email" id="sw-email" placeholder="이메일" required style="width:100%;padding:12px;margin-bottom:10px;border:2px solid #334155;border-radius:10px;font-size:1rem;background:#0f172a;color:#fff;">
                            <input type="password" id="sw-password" placeholder="비밀번호" required style="width:100%;padding:12px;margin-bottom:20px;border:2px solid #334155;border-radius:10px;font-size:1rem;background:#0f172a;color:#fff;">
                            <button type="submit" style="width:100%;padding:14px;background:linear-gradient(135deg,#ec4899,#8b5cf6);border:none;border-radius:10px;color:white;font-size:1rem;font-weight:600;cursor:pointer;">로그인</button>
                        </form>
                        <p style="margin-top:15px;color:#94a3b8;font-size:0.9rem;">
                            계정이 없으신가요? <a href="https://cocy.io/#auth" target="_blank" style="color:#ec4899;">회원가입</a>
                        </p>
                        <button onclick="SharedWallet._closeLogin()" style="margin-top:15px;background:none;border:none;color:#94a3b8;cursor:pointer;">닫기</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            
            document.getElementById('sw-login-form').onsubmit = async (e) => {
                e.preventDefault();
                await SharedWallet._handleLogin();
            };
        }
        modal.style.display = 'block';
    },
    
    _closeLogin() {
        const modal = document.getElementById('sw-login-modal');
        if (modal) modal.style.display = 'none';
    },
    
    async _handleLogin() {
        const email = document.getElementById('sw-email').value;
        const password = document.getElementById('sw-password').value;
        
        try {
            const res = await fetch(`${this.AUTH_API}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            
            if (res.ok) {
                const data = await res.json();
                localStorage.setItem('cocy_auth_token', data.accessToken);
                localStorage.setItem('cocy_refresh_token', data.refreshToken);
                this._closeLogin();
                await this._checkAuth();
                this._updateUI();
                this._notifyListeners();
                alert('로그인 성공! 🎉');
            } else {
                const err = await res.json();
                alert(err.error || '로그인 실패');
            }
        } catch (e) {
            alert('로그인 오류: ' + e.message);
        }
    },
    
    // UI 삽입
    _injectUI() {
        // 이미 있으면 스킵
        if (document.getElementById('sw-bar')) return;
        
        const bar = document.createElement('div');
        bar.id = 'sw-bar';
        bar.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            z-index: 9999;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            background: rgba(0,0,0,0.85);
            padding: 6px 12px;
            padding-top: calc(6px + env(safe-area-inset-top));
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            font-size: 13px;
            color: #fff;
            backdrop-filter: blur(10px);
            height: 40px;
            box-sizing: content-box;
        `;
        document.body.appendChild(bar);
        this._updateUI();
    },
    
    _updateUI() {
        const bar = document.getElementById('sw-bar');
        if (!bar) return;
        
        // 현재 게임 이름 추출 (URL path에서)
        const path = location.pathname.split('/').filter(Boolean);
        const gameName = path[0] || 'COCY';
        
        const homeBtn = `<a href="/" style="display:flex;align-items:center;gap:6px;text-decoration:none;color:#fff;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            <span style="font-weight:700;font-size:12px;">${gameName.toUpperCase()}</span>
        </a>`;
        
        if (this.isLoggedIn) {
            const nickname = this.user?.nickname || this.user?.email?.split('@')[0] || '유저';
            bar.innerHTML = `
                ${homeBtn}
                <div style="display:flex;align-items:center;gap:8px;">
                    <span style="color:#ffd700;font-weight:600;">💰 ${this.gold.toLocaleString()}G</span>
                    <span style="color:#64748b;">|</span>
                    <span style="font-size:12px;">👤 ${nickname}</span>
                    <span style="color:#4ecca3;font-size:10px;">☁️</span>
                    <button onclick="SharedWallet.logout()" style="background:rgba(255,255,255,0.1);border:none;color:#fff;padding:3px 8px;border-radius:8px;cursor:pointer;font-size:11px;">로그아웃</button>
                </div>
            `;
        } else {
            bar.innerHTML = `
                ${homeBtn}
                <div style="display:flex;align-items:center;gap:8px;">
                    <span style="color:#ffd700;font-weight:600;">💰 ${this.gold.toLocaleString()}G</span>
                    <button onclick="SharedWallet.showLogin()" style="background:linear-gradient(135deg,#ec4899,#8b5cf6);border:none;color:#fff;padding:4px 10px;border-radius:8px;cursor:pointer;font-size:11px;font-weight:600;">로그인</button>
                </div>
            `;
        }
    },
    
    // 골드 추가
    addGold(amount) {
        this.gold += amount;
        this._save();
        this._updateUI();
        return this.gold;
    },
    
    // 골드 차감
    removeGold(amount) {
        this.gold = Math.max(0, this.gold - amount);
        this._save();
        this._updateUI();
        return this.gold;
    },
    
    // 골드 설정
    setGold(amount) {
        this.gold = Math.max(0, amount);
        this._save();
        this._updateUI();
        return this.gold;
    },
    
    // 변경 리스너
    onChange(callback) {
        this._listeners.push(callback);
    },
    
    _notifyListeners() {
        this._listeners.forEach(cb => cb({
            gold: this.gold,
            isLoggedIn: this.isLoggedIn,
            user: this.user
        }));
    }
};

// 자동 초기화 - data-no-ui 속성이 있으면 UI 표시 안함
(function() {
    const scripts = document.querySelectorAll('script[src*="shared-wallet"]');
    let showUI = true;
    scripts.forEach(s => {
        if (s.dataset.noUi === 'true' || s.dataset.noUi === '') {
            showUI = false;
        }
    });
    
    const doInit = () => SharedWallet.init({ showUI });
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', doInit);
    } else {
        doInit();
    }
})();
