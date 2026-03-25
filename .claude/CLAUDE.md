# Multiplayer UI Migration

## 목표
bulletdodge, catan, jokerrun, poker 4개 게임의 커스텀 로비 코드를 공용 `multiplayer-ui.js`로 교체.
(linerush는 제외 — 멀티 구조가 다름)

## 공용 라이브러리
- `/lib/multiplayer.js` — relay.cocy.io 클라이언트 (인증, 방 관리, SSE)
- `/lib/multiplayer-ui.js` — 공용 로비 UI (방 목록, 대기실, QR, 코드입장, 랜덤매칭, 결과 오버레이)

## 마이그레이션 패턴 (gomoku 참고)

### 1. HTML에 script 추가
```html
<script src="/lib/multiplayer.js"></script>
<script src="/lib/multiplayer-ui.js"></script>
```

### 2. 로비 컨테이너 추가
```html
<div id="mpLobbyContainer"></div>
```

### 3. MultiplayerUI 초기화
```js
const mpUI = new MultiplayerUI({
  gameType: 'GAME_TYPE',        // relay 서버 등록된 게임 타입
  gameName: '게임이름',
  container: document.getElementById('mpLobbyContainer'),
  maxPlayers: N,
  supportsLocal: true/false,     // 로컬 대전 지원 여부
  onGameStart: handleGameStart,  // 게임 시작 콜백
  onGameEvent: handleGameEvent,  // 이벤트 콜백
  onLeave: () => { /* 메인으로 */ },
  getPlayerData: () => ({ ... }), // 선택: 플레이어 데이터
});
mpUI.show();
```

### 4. URL room 파라미터 처리
```js
const roomCode = MultiplayerUI.checkUrlRoom();
if (roomCode) {
  mpUI._renderLobby();
  setTimeout(() => {
    document.getElementById('mp-room-code').value = roomCode;
  }, 100);
}
```

### 5. 결과 표시 (custom actions 사용)
```js
mpUI.showResult({
  title: '🎉 승리!',
  detail: '결과 설명',
  isWin: true,
  actions: [
    { label: '🔄 다시 한 판', primary: true, handler: async () => {
      const pd = mpUI.getPlayerData ? mpUI.getPlayerData() : null;
      await mpUI.getClient().rematch(pd);
      mpUI.goToWaitingRoom();
    }},
    { label: '나가기', primary: false, handler: () => {
      if (mpUI.getClient()) { mpUI.getClient().leaveRoom().catch(()=>{}); MultiplayerClient.resetInstance(); }
      location.reload();
    }}
  ]
});
```

## 각 게임별 주의사항

### bulletdodge (gameType: 'bulletdodge')
- maxPlayers: 2
- 기존: MultiplayerClient 직접 사용 + 커스텀 로비 HTML
- 교체: 커스텀 로비 HTML/CSS/JS 제거 → mpLobbyContainer + MultiplayerUI
- 게임 로직(onGameStart/onGameEvent) 그대로 유지

### catan (gameType: 'catan')
- maxPlayers: 4
- 기존: 커스텀 room-lobby div + createRoom/joinRoom 함수
- 교체: room-lobby 제거 → MultiplayerUI
- 복잡한 게임 — 로비만 교체, 게임 로직 절대 건드리지 않기

### jokerrun (gameType: 'jokerrun')
- maxPlayers: 2
- 기존: 커스텀 버튼 + pvp 객체
- 교체: 로비 부분만 MultiplayerUI로, pvp 게임 로직 유지

### poker (gameType: 'poker')
- maxPlayers: 6
- 기존: 커스텀 waiting-room + createMultiplayerRoom 함수
- 교체: waiting-room 관련 HTML/JS 제거 → MultiplayerUI

## 규칙
- **게임 로직(onGameStart, 게임 플레이 코드) 절대 수정 금지**
- 로비/대기실/방 관리 코드만 MultiplayerUI로 교체
- 기존 커스텀 로비 HTML은 hidden으로 남기거나 제거
- SharedWallet 연동 기존 방식 유지
- multiplayer.js, multiplayer-ui.js 수정 금지
