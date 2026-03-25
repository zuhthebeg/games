# Blackjack Multiplayer Integration

## 프로젝트 구조
- `index.html` — 싱글 HTML 게임 (CSS + JS inline)
- `/lib/multiplayer.js` — 릴레이 클라이언트 (relay.cocy.io 연결)
- `/lib/multiplayer-ui.js` — 공용 로비 UI (방 목록, 대기실, QR 등)
- `/lib/shared-wallet.js` — 골드 지갑 (로그인/게스트 지원)

## 서버 API (relay.cocy.io)
- 게임 타입: `blackjack`
- 플러그인: `functions/games/blackjack.ts` (이미 완성)
- 서버 상태 구조: `{ players[], dealer, phase, currentPlayerIndex, currentHandIndex, config }`
- phase: `betting → dealing → playing → dealer_turn → settling → finished`
- 서버 액션:
  - `{ type: 'bet', payload: { amount: number } }` — 베팅 (betting phase)
  - `{ type: 'hit' }` — 히트 (playing phase, 내 턴)
  - `{ type: 'stand' }` — 스탠드
  - `{ type: 'double' }` — 더블다운
  - `{ type: 'split' }` — 스플릿
- `getPlayerView()` 반환: `{ players, dealer, phase, currentPlayerIndex, currentHandIndex, config, me, isMyTurn }`
  - dealer.cards: phase=playing일 때 `[카드, null]` (두번째 카드 숨김)
  - dealer.revealed: boolean

## 현재 상태
- HTML에 모드 선택 화면(#modeSelectScreen), 로비 컨테이너(#mpLobbyContainer), 멀티 게임 화면(#multiGameScreen) **프레임만 존재**
- 솔로 모드(#soloApp)는 완전 동작
- **JS 바인딩 없음** — 모드 버튼 클릭 이벤트, 멀티 렌더링, 액션 전송 코드 전부 없음
- 현재는 init() 후 솔로가 바로 시작됨

## 구현 목표

### 1. 모드 선택 연결
- 앱 시작 시 `#modeSelectScreen` 표시 (솔로/멀티 선택)
- 솔로 클릭 → 기존 `#soloApp` 표시 + init()
- 멀티 클릭 → `#mpLobbyContainer`에 MultiplayerUI 초기화
- 기존 init()은 솔로 선택 후에만 호출

### 2. MultiplayerUI 연결 (로비)
```js
const mpUI = new MultiplayerUI({
  gameType: 'blackjack',
  gameName: '🃏 블랙잭',
  container: document.getElementById('mpLobbyContainer'),
  maxPlayers: 6,
  supportsLocal: false,
  onGameStart: handleMultiGameStart,
  onGameEvent: handleMultiGameEvent,
  onLeave: () => showModeSelect(),
});
```
- URL ?room= 파라미터 처리 (MultiplayerUI.checkUrlRoom())

### 3. 멀티 게임 렌더링 (핵심)
`#multiGameScreen` 안의 구조 활용:
- `#mpDealerCards` — 딜러 카드 렌더 (숨김 카드는 뒷면)
- `#mpDealerScore` — 딜러 점수
- `#mpPlayers` — 각 플레이어 좌석 동적 생성
  - 각 플레이어: 닉네임, 핸드별 카드, 점수, 베팅 금액, 상태(대기/플레이/Bust/Stand)
  - 내 좌석 하이라이트
  - 현재 턴 플레이어 강조
- `#mpPhaseText` — 현재 페이즈 표시
- `#mpTimerText` — 타이머 (15초 카운트다운, 턴마다 리셋)
- `#mpTurnStatus` — "당신의 턴" / "XXX의 턴" / "베팅하세요"

### 4. 베팅/액션 패널
- betting phase + 내가 아직 bet 안 했으면 → `#mpBetPanel` 표시
  - 버튼 클릭 → `mpUI.sendAction({ type: 'bet', payload: { amount } })`
  - 베팅 전 SharedWallet에서 차감 (walletRemove)
- playing phase + 내 턴이면 → `#mpActionPanel` 표시
  - Hit/Stand/Double/Split → `mpUI.sendAction({ type: 'hit' })` 등
  - Double은 추가 베팅 차감 필요
  - Split은 같은 카드 + 골드 충분할 때만 활성화
- 그 외 상태 → 두 패널 모두 숨김

### 5. 실시간 업데이트
- `onGameEvent` 콜백에서 서버 이벤트 처리:
  - `bet_placed` — 해당 플레이어 베팅 표시 업데이트
  - `dealing_started` — 카드 딜링 애니메이션 (가능하면)
  - `hit`, `stand`, `double`, `split` — 해당 플레이어 카드 업데이트
  - `dealer_turn_completed` — 딜러 카드 공개
  - `settled` — 결과 표시 (각 플레이어 win/lose/push)
- 매 이벤트마다 `mpUI.getState()`로 최신 상태 가져와서 전체 렌더링

### 6. 라운드 종료 후
- 결과 오버레이: `mpUI.showResult({ title, detail, isWin, showRematch: true })`
- 리매치 → 대기실 복귀 (MultiplayerUI가 처리)
- 나가기 → 모드 선택으로

## 규칙
- **기존 솔로 코드 수정 최소화** — 멀티 코드는 별도 섹션으로 추가
- 솔로 함수(draw, handValue, render 등) 재사용 가능하면 재사용
- **카드 렌더링은 기존 renderCardHTML 함수 재사용**
- SharedWallet 연동: 멀티에서도 베팅 시 로컬 골드 차감, 결과 정산 시 반영
- i18n: 기존 I18N 객체에 멀티 키 이미 있음 (t() 함수 사용)
- CSS: 기존 `.multi-*` 스타일 활용, 필요시 추가
- `data-mp-bet` 버튼은 이미 HTML에 있음 (이벤트만 바인딩)
- `mpHitBtn, mpStandBtn, mpDoubleBtn, mpSplitBtn` 이미 HTML에 있음

## 수정 금지
- 솔로 모드 게임 로직 (startRound, hit, stand 등) 변경 금지
- SFX 시스템 변경 금지
- CSS 변수 변경 금지
- shared-wallet.js 변경 금지
- multiplayer.js, multiplayer-ui.js 변경 금지

## 참고: enhance 게임의 MultiplayerUI 연동 패턴
```js
// 초기화
mpUI = new MultiplayerUI({
  gameType: 'pvp-battle',
  gameName: '⚔️ 턴제 배틀',
  container: document.getElementById('app'),
  maxPlayers: 2,
  supportsLocal: false,
  onGameStart: handleBattleStart,
  onGameEvent: handleBattleEvent,
  onLeave: () => { showMain(); },
  getPlayerData: () => ({ weapon: {...}, gold: state.gold })
});

// URL 방 코드 체크
const roomCode = MultiplayerUI.checkUrlRoom();
if (roomCode) {
  mpUI._renderLobby();
  setTimeout(() => { document.getElementById('mp-room-code').value = roomCode; }, 100);
} else {
  mpUI.show();
}
```
