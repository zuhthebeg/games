/**
 * game-rankings.js — 게임 공용 랭킹 모듈
 *
 * 사용법:
 *   <script src="/lib/game-rankings.js"></script>
 *
 *   // 점수 제출
 *   GameRankings.submit('snake', { level: 5, score: 42 });
 *   GameRankings.submit('blackjack', { profit: 50000 });
 *   GameRankings.submit('ppingpae', { score: 245 });
 *   GameRankings.submit('pingtan', { timeSec: 183 });
 *
 *   // 랭킹 모달 표시
 *   GameRankings.showModal('snake');
 *
 *   // 랭킹 버튼 삽입 (el에 버튼 추가)
 *   GameRankings.injectButton('snake', document.getElementById('menu'));
 */
(function (global) {
    const API = 'https://relay.cocy.io/api/rankings';

    // 게임별 설정
    const GAME_CONFIG = {
        snake: {
            name: '🐍 스네이크',
            icon: '🐍',
            submit: (data) => ({ level: data.level, score: data.score || 0 }),
            scoreLabel: (r) => `레벨 ${r.best_level} · ${r.best_score}점`,
            sortKey: 'best_level',
        },
        blackjack: {
            name: '🃏 블랙잭',
            icon: '🃏',
            submit: (data) => ({ profit: data.profit }),
            scoreLabel: (r) => `+${(r.best_profit || 0).toLocaleString()} G`,
            sortKey: 'best_profit',
        },
        ppingpae: {
            name: '🀄 삥패',
            icon: '🀄',
            submit: (data) => ({ score: data.score }),
            scoreLabel: (r) => `${(r.best_score || 0).toLocaleString()}점`,
            sortKey: 'best_score',
        },
        pingtan: {
            name: '🏮 삥탄',
            icon: '🏮',
            submit: (data) => ({ timeSec: data.timeSec }),
            scoreLabel: (r) => {
                const s = r.best_time_sec || 0;
                const m = Math.floor(s / 60);
                const sec = s % 60;
                return m > 0 ? `${m}분 ${sec}초` : `${sec}초`;
            },
            sortKey: 'best_time_sec',
            asc: true,  // 낮을수록 좋음
        },
        mahjong: {
            name: '🀄 대만 마작',
            icon: '🀄',
            submit: (data) => ({ score: data.score }),
            scoreLabel: (r) => `${(r.best_score || 0)}台`,
            sortKey: 'best_score',
        },
        minesweeper: {
            name: '💣 지뢰찾기',
            icon: '💣',
            submit: (data) => ({ score: data.score }),
            scoreLabel: (r) => `${(r.best_score || 0).toLocaleString()}점`,
            sortKey: 'best_score',
        },
    };

    function decodeJwtPayload(token) {
        try {
            const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
            // atob는 바이트 문자열 반환 → Uint8Array → TextDecoder로 UTF-8(한글 포함) 처리
            const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
            return JSON.parse(new TextDecoder().decode(bytes));
        } catch { return null; }
    }

    function getUserInfo() {
        const token = localStorage.getItem('cocy_auth_token') || localStorage.getItem('accessToken');
        let userId = null, nickname = null;

        if (token) {
            const p = decodeJwtPayload(token);
            if (p) {
                userId = p.sub || p.userId || p.user_id || null;
                nickname = p.nickname || p.name || null;
            }
        }

        // SharedWallet에서 nickname 가져오기
        if (typeof SharedWallet !== 'undefined') {
            try {
                if (!nickname) nickname = SharedWallet.user?.nickname || null;
            } catch { }
        }

        // 로그인/게스트 토큰 모두 실패 시 로컬 guestId 사용
        if (!userId) {
            userId = localStorage.getItem('guestId');
            if (!userId) {
                userId = 'guest_' + Math.random().toString(36).slice(2, 10);
                localStorage.setItem('guestId', userId);
            }
        }

        return { userId, nickname };
    }

    async function submit(gameId, data) {
        const cfg = GAME_CONFIG[gameId];
        if (!cfg) return console.warn('[GameRankings] Unknown gameId:', gameId);
        const { userId, nickname } = getUserInfo();
        console.log(`[GameRankings] submit ${gameId} userId=${userId} nick=${nickname}`, data);
        if (!userId) { console.warn('[GameRankings] No userId, skip'); return; }
        const payload = { userId, nickname, ...cfg.submit(data) };
        try {
            const r = await fetch(`${API}/${gameId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const json = await r.json();
            console.log(`[GameRankings] ${gameId} response:`, json);
        } catch (e) {
            console.warn('[GameRankings] Submit failed:', e);
        }
    }

    async function fetchRankings(gameId, limit = 10) {
        try {
            const r = await fetch(`${API}/${gameId}?limit=${limit}`);
            const json = await r.json();
            return json.success ? (json.rankings || []) : [];
        } catch {
            return [];
        }
    }

    function buildModalHTML(gameId, rankings) {
        const cfg = GAME_CONFIG[gameId];
        if (!cfg) return '';
        const { userId } = getUserInfo();

        const rows = rankings.length === 0
            ? `<tr><td colspan="3" style="text-align:center;color:#888;padding:20px;">아직 기록이 없어요!</td></tr>`
            : rankings.map((r, i) => {
                const medals = ['🥇', '🥈', '🥉'];
                const medal = medals[i] || `${i + 1}위`;
                const isMe = r.user_id === userId;
                const nick = (r.nickname || '익명').slice(0, 12);
                return `<tr style="${isMe ? 'background:rgba(255,215,0,0.1);font-weight:700;' : ''}">
                    <td style="padding:6px 8px;text-align:center;">${medal}</td>
                    <td style="padding:6px 8px;">${nick}${isMe ? ' <span style="color:#ffd700;font-size:0.75em;">YOU</span>' : ''}</td>
                    <td style="padding:6px 8px;text-align:right;color:#ffd700;">${cfg.scoreLabel(r)}</td>
                </tr>`;
            }).join('');

        return `
        <div id="gr-modal-overlay" style="
            position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:9999;
            display:flex;align-items:center;justify-content:center;
        " onclick="if(event.target===this)GameRankings.closeModal()">
            <div style="
                background:#1a1a2e;border:1px solid #444;border-radius:16px;
                padding:24px;min-width:300px;max-width:420px;width:90%;
                box-shadow:0 8px 32px rgba(0,0,0,0.5);
            ">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
                    <h2 style="margin:0;color:#fff;font-size:1.2rem;">${cfg.name} 랭킹</h2>
                    <button onclick="GameRankings.closeModal()" style="
                        background:none;border:none;color:#aaa;font-size:1.5rem;
                        cursor:pointer;line-height:1;padding:0 4px;
                    ">✕</button>
                </div>
                <table style="width:100%;border-collapse:collapse;font-size:0.9rem;color:#ddd;">
                    <thead>
                        <tr style="border-bottom:1px solid #333;color:#888;font-size:0.8rem;">
                            <th style="padding:4px 8px;text-align:center;">순위</th>
                            <th style="padding:4px 8px;text-align:left;">닉네임</th>
                            <th style="padding:4px 8px;text-align:right;">기록</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
                <div style="margin-top:12px;text-align:center;font-size:0.75rem;color:#555;">
                    TOP 10 · relay.cocy.io
                </div>
            </div>
        </div>`;
    }

    function showModal(gameId) {
        closeModal();
        const div = document.createElement('div');
        div.id = 'gr-modal-root';
        div.innerHTML = `<div style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;">
            <div style="color:#fff;font-size:1.2rem;">🏆 로딩 중...</div>
        </div>`;
        document.body.appendChild(div);

        fetchRankings(gameId).then(rankings => {
            div.innerHTML = buildModalHTML(gameId, rankings);
        });
    }

    function closeModal() {
        const el = document.getElementById('gr-modal-root');
        if (el) el.remove();
    }

    function injectButton(gameId, container, opts = {}) {
        const cfg = GAME_CONFIG[gameId];
        if (!cfg || !container) return;
        const btn = document.createElement('button');
        const style = opts.style || `
            background:rgba(255,215,0,0.15);border:1px solid rgba(255,215,0,0.4);
            color:#ffd700;border-radius:8px;padding:6px 14px;font-size:0.85rem;
            cursor:pointer;font-weight:600;
        `;
        btn.style.cssText = style;
        btn.innerHTML = opts.label || `${cfg.icon} 랭킹`;
        btn.onclick = () => showModal(gameId);
        container.appendChild(btn);
        return btn;
    }

    /**
     * 글로벌 네비(sw-bar)의 sw-nav-extra 슬롯에 랭킹 버튼 삽입
     * SharedWallet이 bar를 재렌더링해도 _navExtra에 HTML이 유지됨
     * 사용: GameRankings.injectNavButton('snake');
     */
    function injectNavButton(gameId) {
        const cfg = GAME_CONFIG[gameId];
        if (!cfg) return;

        const btnHtml = `<button id="gr-nav-rank-btn" onclick="GameRankings.showModal('${gameId}')" style="
            background:rgba(255,215,0,0.15);border:1px solid rgba(255,215,0,0.3);
            color:#ffd700;border-radius:6px;padding:2px 9px;font-size:12px;
            cursor:pointer;font-weight:700;line-height:1.6;white-space:nowrap;
        ">🏆</button>`;

        // SharedWallet이 있으면 _navExtra에 저장 → _updateUI 시 자동 포함
        if (typeof SharedWallet !== 'undefined') {
            SharedWallet._navExtra = btnHtml;
        }

        // sw-nav-extra 슬롯이 이미 있으면 즉시 삽입
        function tryInject() {
            const slot = document.getElementById('sw-nav-extra');
            if (slot && !document.getElementById('gr-nav-rank-btn')) {
                slot.innerHTML = btnHtml;
                return true;
            }
            return !!slot;
        }

        if (!tryInject()) {
            const timer = setInterval(() => { if (tryInject()) clearInterval(timer); }, 150);
            setTimeout(() => clearInterval(timer), 5000);
        }
    }

    global.GameRankings = { submit, fetchRankings, showModal, closeModal, injectButton, injectNavButton, GAME_CONFIG };
})(window);
