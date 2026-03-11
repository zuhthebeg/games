/**
 * 공용 상단 바 + 재화 시스템 (Shared Wallet)
 * v20260214 - 홈버튼 + 게임명 + 골드 + 로그인
 * 
 * Usage:
 *   <script src="/lib/shared-wallet.js?v=20260214"></script>
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
    _gameData: {},  // 게임별 커스텀 데이터 (cloud sync)


    _getConfig() {
        const defaults = {
            showHomeInStandalone: false,
            labels: { login: '로그인', logout: '로그아웃' }
        };
        const cfg = (typeof window !== 'undefined' && window.SharedWalletConfig) ? window.SharedWalletConfig : {};
        return {
            ...defaults,
            ...cfg,
            labels: { ...defaults.labels, ...(cfg.labels || {}) }
        };
    },

    _normalizeNickname(nick) {
        if (!nick || typeof nick !== 'string') return null;
        if (/[ìëêãåæ]/.test(nick)) {
            try {
                const fixed = decodeURIComponent(escape(nick));
                if (fixed && fixed !== nick) return fixed;
            } catch {}
            return null;
        }
        return nick.trim() || null;
    },
    
    AUTH_API: 'https://relay.cocy.io/api/auth',
    DATA_API: 'https://relay.cocy.io/api/user/data',
    GUEST_TOKEN_KEY: 'cocy_guest_token',
    GOOGLE_CLIENT_ID: '402340265805-ogo2c09qujqk6gape9oea7sfh8lsegln.apps.googleusercontent.com',

    // 초기화 (options: { showUI: false, autoGuest: true } )
    async init(options = {}) {
        if (this._initialized) return this;
        this._initialized = true;
        
        // UI 표시 설정
        if (options.showUI === false) {
            this._showUI = false;
        }
        
        // 로컬 데이터 로드
        this._loadLocal();
        
        // 자동 게스트 로그인 (옵트인, 토큰 없을 때만)
        if (options.autoGuest !== false && !localStorage.getItem('cocy_auth_token')) {
            await this._ensureGuestToken();
        }

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
                        body: JSON.stringify({ gold: this.gold, ...this._gameData })
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
            
            const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            const jsonStr = decodeURIComponent(atob(b64).split("").map(c => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join(""));
            const payload = JSON.parse(jsonStr);

            // payload 기반 기본 유저 정보( /me 실패 시 유저 표시 깨짐 방지 )
            if (!this.user) {
                this.user = {
                    nickname: this._normalizeNickname(payload.nickname) || null,
                    email: payload.email || null
                };
            }
            
            // 만료 확인
            if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
                const refreshed = await this._refreshToken();
                if (!refreshed) {
                    this.logout();
                    return;
                }
            }
            
            // sub 또는 userId 필드가 있으면 (로그인 or 게스트 모두) 클라우드 동기화 활성화
            const tokenUserId = payload.sub || payload.userId;
            if (tokenUserId) {
                this.isLoggedIn = !payload.isAnonymous;  // 실제 로그인 여부
                this.cloudSyncEnabled = true;             // 게스트도 서버 sync
                
                // 로그인 유저만 /me 호출 (게스트는 unsigned 토큰이라 401)
                if (!payload.isAnonymous) {
                    const userRes = await fetch(`${this.AUTH_API}/me?_t=${Date.now()}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
                    if (userRes.ok) {
                        this.user = await userRes.json();
                        if (this.user) {
                            const fixedNick = this._normalizeNickname(this.user.nickname);
                            this.user.nickname = fixedNick || null;
                        }
                    }
                } else {
                    this.user = { nickname: '게스트', isAnonymous: true };
                }

                // 게임 데이터 로드 (게스트/로그인 모두)
                const dataRes = await fetch(this.DATA_API + '?_t=' + Date.now(), { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
                if (dataRes.ok) {
                    const data = await dataRes.json();
                    if (data.gold !== undefined) {
                        this.gold = data.gold;
                    }
                    const { gold: _g, ...gd } = data;
                    if (Object.keys(gd).length > 0) this._gameData = gd;
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
    // 프로필 드롭다운 토글
    _toggleProfileMenu(e) {
        e.stopPropagation();
        const menu = document.getElementById('sw-profile-menu');
        if (!menu) return;
        const isOpen = menu.style.display !== 'none';
        menu.style.display = isOpen ? 'none' : 'block';
        if (!isOpen) {
            const close = (ev) => {
                if (!document.getElementById('sw-profile-menu')?.contains(ev.target) &&
                    ev.target.id !== 'sw-profile-btn') {
                    if (menu) menu.style.display = 'none';
                }
                document.removeEventListener('click', close);
            };
            setTimeout(() => document.addEventListener('click', close), 0);
        }
    },

    // 닉네임 변경 모달
    showNicknameEdit() {
        const menu = document.getElementById('sw-profile-menu');
        if (menu) menu.style.display = 'none';

        // 기존 모달 제거
        document.getElementById('sw-nickname-modal')?.remove();

        const modal = document.createElement('div');
        modal.id = 'sw-nickname-modal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;';
        modal.innerHTML = `
            <div style="background:#1e293b;border:1px solid rgba(255,255,255,0.12);border-radius:16px;padding:24px;width:100%;max-width:320px;">
                <h3 style="margin:0 0 6px;font-size:15px;color:#f1f5f9;">닉네임 변경</h3>
                <p style="margin:0 0 16px;font-size:12px;color:#64748b;">2~12자, 현재: <strong style="color:#94a3b8;">${this._normalizeNickname(this.user?.nickname) || '없음'}</strong></p>
                <input id="sw-new-nickname" type="text" maxlength="12" placeholder="새 닉네임 입력"
                    style="width:100%;box-sizing:border-box;background:#0f172a;border:1px solid rgba(255,255,255,0.15);border-radius:10px;color:#f1f5f9;padding:10px 12px;font-size:14px;outline:none;margin-bottom:8px;"
                    onkeydown="if(event.key==='Enter')SharedWallet._submitNickname()">
                <div id="sw-nick-err" style="font-size:11px;color:#f87171;min-height:16px;margin-bottom:10px;"></div>
                <div style="display:flex;gap:8px;">
                    <button onclick="document.getElementById('sw-nickname-modal').remove()"
                        style="flex:1;padding:10px;background:rgba(255,255,255,0.07);border:none;border-radius:10px;color:#94a3b8;cursor:pointer;font-size:13px;">취소</button>
                    <button onclick="SharedWallet._submitNickname()"
                        style="flex:1;padding:10px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border:none;border-radius:10px;color:#fff;cursor:pointer;font-size:13px;font-weight:600;">변경하기</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
        setTimeout(() => document.getElementById('sw-new-nickname')?.focus(), 50);
    },

    async _submitNickname() {
        const input = document.getElementById('sw-new-nickname');
        const errEl = document.getElementById('sw-nick-err');
        const nickname = input?.value?.trim();
        if (!nickname || nickname.length < 2 || nickname.length > 12) {
            if (errEl) errEl.textContent = '2~12자로 입력해주세요';
            return;
        }
        const token = localStorage.getItem('cocy_auth_token');
        if (!token) return;
        if (errEl) errEl.textContent = '';
        const btn = document.querySelector('#sw-nickname-modal button:last-child');
        if (btn) btn.textContent = '변경 중...';
        try {
            const res = await fetch(`${this.AUTH_API}/nickname`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ nickname })
            });
            const data = await res.json();
            if (!res.ok) {
                if (errEl) errEl.textContent = data.error || '변경 실패';
                if (btn) btn.textContent = '변경하기';
                return;
            }
            this.user.nickname = nickname;
            document.getElementById('sw-nickname-modal')?.remove();
            this._updateUI(); this._notifyListeners();
        } catch (e) {
            if (errEl) errEl.textContent = '서버 오류';
            if (btn) btn.textContent = '변경하기';
        }
    },

    logout() {
        // 로그인 토큰만 제거, 게스트 토큰은 보존
        localStorage.removeItem('cocy_auth_token');
        localStorage.removeItem('cocy_refresh_token');
        localStorage.removeItem('cocy_user_id');

        // 로컬 게임 데이터 완전 삭제 (다른 계정 데이터 오염 방지)
        localStorage.removeItem('enhance_game_v3');

        // 게스트 토큰 복귀
        const guestToken = localStorage.getItem(this.GUEST_TOKEN_KEY);
        if (guestToken) {
            localStorage.setItem('cocy_auth_token', guestToken);
        }

        // 페이지 리로드 (가장 깔끔 — 리로드 시 게스트 or 새 게스트로 재시작)
        location.reload();
    },

    // 게스트 토큰 확보 (없으면 anonymous 계정 생성)
    async _ensureGuestToken() {
        try {
            const res = await fetch(`${this.AUTH_API}/anonymous`, { method: 'POST' });
            if (!res.ok) return;
            const data = await res.json();
            const token = data.token;
            if (!token) return;
            localStorage.setItem('cocy_auth_token', token);
            localStorage.setItem(this.GUEST_TOKEN_KEY, token);  // 게스트 토큰 별도 보관
        } catch (e) {
            console.log('SharedWallet: Guest token failed', e);
        }
    },
    
    // 로그인 모달 표시
    showLogin() {
        const loginLabel = this._getConfig().labels.login;

        let modal = document.getElementById('sw-login-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'sw-login-modal';
            modal.innerHTML = `
                <div style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);z-index:10000;display:flex;justify-content:center;align-items:center;">
                    <div style="background:#1e293b;border-radius:20px;padding:30px;max-width:400px;width:90%;text-align:center;color:#fff;">
                        <h2 style="margin-bottom:20px;">🔑 로그인</h2>
                        <div id="sw-google-btn" style="display:flex;justify-content:center;margin-bottom:16px;"></div>
                        <div style="display:flex;align-items:center;margin-bottom:16px;">
                            <hr style="flex:1;border:none;border-top:1px solid #334155;">
                            <span style="padding:0 12px;color:#64748b;font-size:0.8rem;">또는</span>
                            <hr style="flex:1;border:none;border-top:1px solid #334155;">
                        </div>
                        <form id="sw-login-form">
                            <input type="email" id="sw-email" placeholder="이메일" required style="width:100%;padding:12px;margin-bottom:10px;border:2px solid #334155;border-radius:10px;font-size:1rem;background:#0f172a;color:#fff;">
                            <input type="password" id="sw-password" placeholder="비밀번호" required style="width:100%;padding:12px;margin-bottom:20px;border:2px solid #334155;border-radius:10px;font-size:1rem;background:#0f172a;color:#fff;">
                            <button type="submit" id="sw-login-btn" style="width:100%;padding:14px;background:linear-gradient(135deg,#ec4899,#8b5cf6);border:none;border-radius:10px;color:white;font-size:1rem;font-weight:600;cursor:pointer;">${loginLabel}</button>
                            <div id="sw-login-result" style="margin-top:10px;display:none;"></div>
                        </form>
                        <p style="margin-top:15px;color:#94a3b8;font-size:0.9rem;">
                            계정이 없으신가요? <a href="#" onclick="event.preventDefault();SharedWallet.showRegister()" style="color:#ec4899;">회원가입</a>
                        </p>
                        <p style="margin-top:8px;">
                            <a href="#" onclick="event.preventDefault();SharedWallet.showForgotPassword()" style="color:#94a3b8;font-size:0.85rem;text-decoration:underline;">비밀번호를 잊으셨나요?</a>
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
        // Google Sign-In 렌더링
        this._renderGoogleButton();
    },

    // Google Sign-In 버튼 렌더링
    _renderGoogleButton() {
        const container = document.getElementById('sw-google-btn');
        if (!container) return;
        container.innerHTML = '';

        const renderBtn = () => {
            if (!window.google?.accounts?.id) return;
            google.accounts.id.initialize({
                client_id: this.GOOGLE_CLIENT_ID,
                callback: (response) => this._handleGoogleCredential(response.credential),
            });
            google.accounts.id.renderButton(container, {
                type: 'standard',
                theme: 'filled_black',
                size: 'large',
                width: 300,
                text: 'signin_with',
                logo_alignment: 'center',
            });
        };

        if (window.google?.accounts?.id) {
            renderBtn();
        } else {
            // GSI 스크립트 로드
            if (!document.getElementById('sw-gsi-script')) {
                const s = document.createElement('script');
                s.id = 'sw-gsi-script';
                s.src = 'https://accounts.google.com/gsi/client';
                s.onload = renderBtn;
                document.head.appendChild(s);
            }
        }
    },

    // Google credential → 서버 인증 → 로그인
    async _handleGoogleCredential(credential) {
        try {
            const res = await fetch(`${this.AUTH_API}/google/signin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ credential }),
            });
            if (!res.ok) {
                const err = await res.json();
                alert('Google 로그인 실패: ' + (err.error || '알 수 없는 오류'));
                return;
            }
            const data = await res.json();
            localStorage.setItem('cocy_auth_token', data.token);
            localStorage.removeItem('cocy_user_id');  // anon 캐시 제거
            this._closeLogin();
            location.reload();
        } catch (e) {
            alert('Google 로그인 실패: ' + e.message);
        }
    },
    
    _closeLogin() {
        const modal = document.getElementById('sw-login-modal');
        if (modal) modal.style.display = 'none';
    },
    
    // 회원가입 모달
    showRegister() {
        this._closeLogin();
        let modal = document.getElementById('sw-register-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'sw-register-modal';
            document.body.appendChild(modal);
        }
        modal.innerHTML = `
            <div style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);z-index:10000;display:flex;justify-content:center;align-items:center;">
                <div style="background:#1e293b;border-radius:20px;padding:30px;max-width:400px;width:90%;text-align:center;color:#fff;">
                    <h2 style="margin-bottom:20px;">📝 회원가입</h2>
                    <form id="sw-register-form">
                        <input type="email" id="sw-reg-email" placeholder="이메일" required style="width:100%;padding:12px;margin-bottom:10px;border:2px solid #334155;border-radius:10px;font-size:1rem;background:#0f172a;color:#fff;">
                        <input type="text" id="sw-reg-nickname" placeholder="닉네임" required minlength="2" maxlength="12" style="width:100%;padding:12px;margin-bottom:10px;border:2px solid #334155;border-radius:10px;font-size:1rem;background:#0f172a;color:#fff;">
                        <input type="password" id="sw-reg-password" placeholder="비밀번호 (8자 이상)" required minlength="8" style="width:100%;padding:12px;margin-bottom:10px;border:2px solid #334155;border-radius:10px;font-size:1rem;background:#0f172a;color:#fff;">
                        <input type="password" id="sw-reg-password2" placeholder="비밀번호 확인" required minlength="8" style="width:100%;padding:12px;margin-bottom:15px;border:2px solid #334155;border-radius:10px;font-size:1rem;background:#0f172a;color:#fff;">
                        <button type="submit" id="sw-reg-btn" style="width:100%;padding:14px;background:linear-gradient(135deg,#ec4899,#8b5cf6);border:none;border-radius:10px;color:white;font-size:1rem;font-weight:600;cursor:pointer;">가입하기</button>
                    </form>
                    <div id="sw-reg-result" style="margin-top:15px;display:none;"></div>
                    <p style="margin-top:15px;">
                        <a href="#" onclick="event.preventDefault();SharedWallet._closeRegister();SharedWallet.showLogin()" style="color:#94a3b8;font-size:0.85rem;">← 로그인으로 돌아가기</a>
                    </p>
                    <button onclick="SharedWallet._closeRegister()" style="margin-top:10px;background:none;border:none;color:#94a3b8;cursor:pointer;">닫기</button>
                </div>
            </div>
        `;
        modal.style.display = 'block';
        
        document.getElementById('sw-register-form').onsubmit = async (e) => {
            e.preventDefault();
            const email = document.getElementById('sw-reg-email').value;
            const nickname = document.getElementById('sw-reg-nickname').value;
            const password = document.getElementById('sw-reg-password').value;
            const password2 = document.getElementById('sw-reg-password2').value;
            const btn = document.getElementById('sw-reg-btn');
            const result = document.getElementById('sw-reg-result');
            
            if (password !== password2) {
                result.style.display = 'block';
                result.innerHTML = '<p style="color:#ff6b6b;">❌ 비밀번호가 일치하지 않습니다</p>';
                return;
            }
            
            btn.disabled = true;
            btn.textContent = '가입 중...';
            
            try {
                const res = await fetch(`${SharedWallet.AUTH_API}/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, nickname, password })
                });
                const data = await res.json();
                
                if (res.ok) {
                    localStorage.setItem('cocy_auth_token', data.accessToken);
                    localStorage.setItem('cocy_refresh_token', data.refreshToken);
                    result.style.display = 'block';
                    result.innerHTML = '<p style="color:#4ecca3;">✅ 가입 완료! 환영합니다 🎉</p>';
                    setTimeout(() => {
                        SharedWallet._closeRegister();
                        SharedWallet._checkAuth();
                        SharedWallet._updateUI();
                        SharedWallet._notifyListeners();
                        location.reload();
                    }, 1500);
                } else {
                    result.style.display = 'block';
                    result.innerHTML = `<p style="color:#ff6b6b;">❌ ${data.error || '가입 실패'}</p>`;
                    btn.disabled = false;
                    btn.textContent = '가입하기';
                }
            } catch (err) {
                result.style.display = 'block';
                result.innerHTML = `<p style="color:#ff6b6b;">❌ 네트워크 오류: ${err.message}</p>`;
                btn.disabled = false;
                btn.textContent = '가입하기';
            }
        };
    },
    
    _closeRegister() {
        const modal = document.getElementById('sw-register-modal');
        if (modal) modal.style.display = 'none';
    },
    
    // 비밀번호 찾기 모달 (이메일+닉네임 확인 → 직접 재설정)
    showForgotPassword() {
        this._closeLogin();
        let modal = document.getElementById('sw-forgot-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'sw-forgot-modal';
            document.body.appendChild(modal);
        }
        modal.innerHTML = `
            <div style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);z-index:10000;display:flex;justify-content:center;align-items:center;">
                <div style="background:#1e293b;border-radius:20px;padding:30px;max-width:400px;width:90%;text-align:center;color:#fff;">
                    <h2 style="margin-bottom:8px;">🔐 비밀번호 재설정</h2>
                    <p style="color:#94a3b8;font-size:0.85rem;margin-bottom:20px;">가입할 때 사용한 이메일과 닉네임을 입력하세요.</p>
                    <form id="sw-forgot-form">
                        <input type="email" id="sw-forgot-email" placeholder="가입 이메일" required style="width:100%;padding:12px;margin-bottom:10px;border:2px solid #334155;border-radius:10px;font-size:1rem;background:#0f172a;color:#fff;">
                        <input type="text" id="sw-forgot-nickname" placeholder="닉네임" required style="width:100%;padding:12px;margin-bottom:10px;border:2px solid #334155;border-radius:10px;font-size:1rem;background:#0f172a;color:#fff;">
                        <input type="password" id="sw-forgot-newpw" placeholder="새 비밀번호 (8자 이상)" required minlength="8" style="width:100%;padding:12px;margin-bottom:10px;border:2px solid #334155;border-radius:10px;font-size:1rem;background:#0f172a;color:#fff;">
                        <input type="password" id="sw-forgot-newpw2" placeholder="새 비밀번호 확인" required minlength="8" style="width:100%;padding:12px;margin-bottom:15px;border:2px solid #334155;border-radius:10px;font-size:1rem;background:#0f172a;color:#fff;">
                        <button type="submit" id="sw-forgot-btn" style="width:100%;padding:14px;background:linear-gradient(135deg,#3b82f6,#8b5cf6);border:none;border-radius:10px;color:white;font-size:1rem;font-weight:600;cursor:pointer;">비밀번호 변경</button>
                    </form>
                    <div id="sw-forgot-result" style="margin-top:15px;display:none;"></div>
                    <p style="margin-top:15px;">
                        <a href="#" onclick="event.preventDefault();SharedWallet._closeForgot();SharedWallet.showLogin()" style="color:#94a3b8;font-size:0.85rem;">← 로그인으로 돌아가기</a>
                    </p>
                    <button onclick="SharedWallet._closeForgot()" style="margin-top:10px;background:none;border:none;color:#94a3b8;cursor:pointer;">닫기</button>
                </div>
            </div>
        `;
        modal.style.display = 'block';
        
        document.getElementById('sw-forgot-form').onsubmit = async (e) => {
            e.preventDefault();
            const email = document.getElementById('sw-forgot-email').value;
            const nickname = document.getElementById('sw-forgot-nickname').value;
            const newPw = document.getElementById('sw-forgot-newpw').value;
            const newPw2 = document.getElementById('sw-forgot-newpw2').value;
            const btn = document.getElementById('sw-forgot-btn');
            const result = document.getElementById('sw-forgot-result');
            
            if (newPw !== newPw2) {
                result.style.display = 'block';
                result.innerHTML = '<p style="color:#ff6b6b;">❌ 비밀번호가 일치하지 않습니다</p>';
                return;
            }
            if (newPw.length < 8) {
                result.style.display = 'block';
                result.innerHTML = '<p style="color:#ff6b6b;">❌ 비밀번호는 8자 이상이어야 합니다</p>';
                return;
            }
            
            btn.disabled = true;
            btn.textContent = '변경 중...';
            
            try {
                const res = await fetch(`${SharedWallet.AUTH_API}/reset-direct`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, nickname, newPassword: newPw })
                });
                const data = await res.json();
                
                if (res.ok) {
                    result.style.display = 'block';
                    result.innerHTML = '<p style="color:#4ecca3;">✅ 비밀번호가 변경되었습니다! 다시 로그인해주세요.</p>';
                    document.getElementById('sw-forgot-form').style.display = 'none';
                    setTimeout(() => { SharedWallet._closeForgot(); SharedWallet.showLogin(); }, 2000);
                } else {
                    result.style.display = 'block';
                    result.innerHTML = `<p style="color:#ff6b6b;">❌ ${data.error || '오류가 발생했습니다'}</p>`;
                    btn.disabled = false;
                    btn.textContent = '비밀번호 변경';
                }
            } catch (err) {
                result.style.display = 'block';
                result.innerHTML = `<p style="color:#ff6b6b;">❌ 네트워크 오류: ${err.message}</p>`;
                btn.disabled = false;
                btn.textContent = '비밀번호 변경';
            }
        };
    },
    
    _closeForgot() {
        const modal = document.getElementById('sw-forgot-modal');
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
                // login success - no popup
            } else {
                const err = await res.json();
                const errEl = document.getElementById('sw-login-result');
                if (errEl) { errEl.style.display='block'; errEl.innerHTML='<p style="color:#ff6b6b;">❌ ' + (err.error || '로그인 실패') + '</p>'; }
            }
        } catch (e) {
            const errEl2 = document.getElementById('sw-login-result');
            if (errEl2) { errEl2.style.display='block'; errEl2.innerHTML='<p style="color:#ff6b6b;">❌ 네트워크 오류</p>'; }
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
    
    // 게임 이름 매핑
    _gameNames: {
        'jokerrun': '조커런',
        'poker': '포커',
        'enhance': '강화',
        'minesweeper': '지뢰찾기',
        'billiards': '당구',
        'snake': '스네이크',
        'gomoku': '오목',
        'connect4': '삼인사목',
        'catan': '카탄',
        'blockpuzzle': '블록퍼즐',
        'breakout': '벽돌깨기',
        'rps': '가위바위보',
        'number-guess': '숫자맞추기',
        'tileslider': '타일슬라이더',
        'pikmin': '피크민'
    },
    
    _updateUI() {
        const bar = document.getElementById('sw-bar');
        if (!bar) return;
        
        // 게임 이름 추출
        const path = location.pathname.split('/').filter(Boolean)[0] || '';
        const gameName = this._gameNames[path] || path.toUpperCase() || 'GAMES';
        
        const cfg = this._getConfig();
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true || new URLSearchParams(location.search).get('utm_source') === 'twa' || document.referrer.startsWith('android-app://');

        const shouldShowHome = !(isStandalone && cfg.showHomeInStandalone === false);
        const homeBtn = shouldShowHome ? `<a href="/" style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:8px;background:rgba(255,255,255,0.12);text-decoration:none;color:#fff;flex-shrink:0;transition:background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.2)'" onmouseout="this.style.background='rgba(255,255,255,0.12)'">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        </a>` : '';
        
        const backBtn = `<button onclick="history.back()" style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:8px;background:rgba(255,255,255,0.08);border:none;color:#fff;cursor:pointer;flex-shrink:0;transition:background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.15)'" onmouseout="this.style.background='rgba(255,255,255,0.08)'">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>`;
        
        const gameLabel = `<span style="font-weight:800;font-size:13px;color:#fff;">${gameName}</span>`;

        const loginLabel = cfg.labels.login;
        const logoutLabel = cfg.labels.logout;
        
        if (this.isLoggedIn) {
            const rawNick = this.user?.nickname || null;
            let nickname = this._normalizeNickname(rawNick);
            if (!nickname) nickname = '유저';
            bar.innerHTML = `
                <div style="display:flex;align-items:center;gap:8px;">
                    ${homeBtn}
                    ${gameLabel}
                </div>
                <div style="display:flex;align-items:center;gap:6px;">
                    <span style="color:#ffd700;font-weight:700;font-size:13px;">💰 ${this.gold.toLocaleString()}G</span>
                    <span style="color:#475569;font-size:10px;">|</span>
                    <div style="position:relative;display:inline-block;">
                        <button id="sw-profile-btn" onclick="SharedWallet._toggleProfileMenu(event)" style="background:none;border:none;color:#94a3b8;padding:2px 4px;border-radius:8px;cursor:pointer;font-size:11px;display:flex;align-items:center;gap:3px;">👤 ${nickname} <span style="font-size:9px;opacity:0.6;">▼</span></button>
                        <div id="sw-profile-menu" style="display:none;position:absolute;right:0;top:calc(100% + 4px);background:#1e293b;border:1px solid rgba(255,255,255,0.1);border-radius:10px;min-width:140px;z-index:9999;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,0.4);">
                            <div style="padding:10px 12px 6px;border-bottom:1px solid rgba(255,255,255,0.08);">
                                <div style="font-size:10px;color:#64748b;">로그인 계정</div>
                                <div style="font-size:11px;color:#94a3b8;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${this.user?.email || '게스트'}</div>
                            </div>
                            <button onclick="SharedWallet.showNicknameEdit()" style="width:100%;text-align:left;background:none;border:none;color:#e2e8f0;padding:9px 12px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:7px;" onmouseover="this.style.background='rgba(255,255,255,0.07)'" onmouseout="this.style.background='none'">✏️ 닉네임 변경</button>
                            <button onclick="SharedWallet.logout()" style="width:100%;text-align:left;background:none;border:none;color:#f87171;padding:9px 12px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:7px;border-top:1px solid rgba(255,255,255,0.06);" onmouseover="this.style.background='rgba(248,113,113,0.1)'" onmouseout="this.style.background='none'">🚪 ${logoutLabel}</button>
                        </div>
                    </div>
                    <span style="color:#4ecca3;font-size:10px;">☁️</span>
                    ${backBtn}
                </div>
            `;
        } else {
            bar.innerHTML = `
                <div style="display:flex;align-items:center;gap:8px;">
                    ${homeBtn}
                    ${gameLabel}
                </div>
                <div style="display:flex;align-items:center;gap:6px;">
                    <span style="color:#ffd700;font-weight:700;font-size:13px;">💰 ${this.gold.toLocaleString()}G</span>
                    <button onclick="SharedWallet.showLogin()" style="background:linear-gradient(135deg,#ec4899,#8b5cf6);border:none;color:#fff;padding:4px 10px;border-radius:8px;cursor:pointer;font-size:11px;font-weight:600;">${loginLabel}</button>
                    ${backBtn}
                </div>
            `;
        }
    },
    
    // 게임 데이터 저장 (cloud sync)
    setGameData(obj) {
        this._gameData = { ...this._gameData, ...obj };
        this._save();
    },

    // 게임 데이터 읽기
    getGameData(key) {
        return key ? this._gameData[key] : this._gameData;
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
    
    // 골드 차감 (잔액 확인 포함 — 게임에서 사용)
    spendGold(amount) {
        if (this.gold < amount) return false;
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
    
    const cfg = (typeof window !== 'undefined' && window.SharedWalletConfig) || {};
    const doInit = () => {
        SharedWallet._initPromise = SharedWallet.init({ showUI, autoGuest: cfg.autoGuest });
    };
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', doInit);
    } else {
        doInit();
    }
})();
