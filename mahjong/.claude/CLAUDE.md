# 대만 마작 (台灣麻將)

단독 `index.html` 구현. 빌드 없음. 외부 의존 최소화.
`game.cocy.io/mahjong/` 배포 예정.

## 아키텍처

**파일 구조:**
```
mahjong/
  index.html    ← 전체 게임 (HTML + CSS + JS 인라인)
  icon.svg
```

**JS 모듈 구조 (전역 객체, import 없음):**
```
TileEngine      - 144타일 생성, 셔플, 배패, 벽 관리
HandAnalyzer    - 화료 판정, 역(타이) 계산
AIEngine        - CPU 플레이어 의사결정
GameController  - 턴 관리, 상태머신, 액션 처리
UIRenderer      - DOM 렌더링 (renderGame, renderHand 등)
```

## 타일 인코딩

```
m1-m9: 萬子 (만쯔)
p1-p9: 筒子 (통쯔)
s1-s9: 竹子 (죽쯔)
z1-z4: 바람패 (동=1, 남=2, 서=3, 북=4)
z5-z7: 삼원패 (백=5, 발=6, 중=7)
f1-f8: 화패 (춘=1,하=2,추=3,동=4, 매=5,난=6,국=7,죽=8)
```

타일 비교: 문자열 정렬로 동일 처리 가능 (`m1 < m2 < ... < m9 < p1 ...`)

## 게임 State

```js
gameState = {
  round: { windIdx: 0, dealer: 0, honba: 0 },   // windIdx: 0=동국, 1=남국
  players: [
    {
      id: 'p0',
      name: '나',
      type: 'human',   // 'human' | 'cpu' | 'remote'  ← 멀티플레이어 확장 포인트
      seatWind: 0,     // 0=동, 1=남, 2=서, 3=북
      hand: [],        // 정렬된 비공개 패 배열
      melds: [],       // [{type:'chi'|'pon'|'ankan'|'minkan'|'addkan', tiles:[], from:idx}]
      flowers: [],     // 화패 (드러남)
      score: 50000,
      isDealer: true,
    }, ...
  ],
  wall: [],         // 남은 패 (앞에서 뽑음)
  deadWall: [],     // 링상패 (깡 보충용, 뒤 14장)
  discards: [[], [], [], []],  // 플레이어별 버린패
  currentPlayer: 0,
  phase: 'draw' | 'action' | 'claim' | 'roundEnd' | 'gameEnd',
  claimInfo: null,  // { tile, discarder, claims: [{player, type}], timer: null }
  lastAction: null,
}
```

## 액션 인터페이스 (멀티플레이어 확장 핵심)

모든 게임 조작은 이 인터페이스로 통일:
```js
applyAction(state, action) → newState
// action 타입:
{ type: 'draw' }
{ type: 'discard', tile: 'm1' }
{ type: 'chi', tiles: ['m2','m3'], discarded: 'm1' }
{ type: 'pon', discarded: 'm1' }
{ type: 'kan', kanType: 'an'|'min'|'add', tiles: [...] }
{ type: 'tsumo' }
{ type: 'ron', tile: 'm1' }
{ type: 'pass' }
{ type: 'newRound' }
```

CPU는 `cpuDecide(state, playerIdx)` → action 반환.
Remote 플레이어는 WebSocket 메시지 → 동일 action 형식.

## 화료 판정 알고리즘

```
canWin(hand, melds):
  // 7또이쯔
  if 7 distinct pairs: return true
  // 13야오 (국사무쌍)
  if 13orphans: return true
  // 표준 5몸통+1머리
  for each tile t as 머리 후보:
    if canFormMelds(hand - [t,t] + existingMeldCount == 5):
      return true

canFormMelds(tiles):  // 재귀 분해
  if tiles.length == 0: return true
  first = tiles[0]
  // 커쯔 시도
  if tiles.count(first) >= 3: try canFormMelds(tiles - 3×first)
  // 순쯔 시도 (man/pin/sou만)
  if suit(first) in [m,p,s] and has(first+1, first+2):
    try canFormMelds(tiles - [first, first+1, first+2])
  return false
```

## 역(타이) 계산

`calcYaku(hand, melds, flowers, winTile, winType, playerState, roundState)` → `{yaku:[], total:台}`

| 타이 | 역 |
|------|-----|
| 1 | 츠모, 멘젠(공개패 없음), 단기대기, 무자, 영상개화, 해저, 바깥깡 |
| 2 | 안깡, 핑후(전부순쯔+양면대기), 삼안커, 전구인, 춘하추동, 매난국죽 |
| 3 | 멘젠츠모 |
| 7 | 또이또이, 사안커, 소삼원, 소사희 |
| 14 | 오안커, 대삼원, 대사희, 화만관, 천화, 지화 |

기타: 무화(+1), 정화(꽃 자리 일치, +2), 역패커쯔(바람/삼원 일치+2 불일치+1), 친장가(+1), 친연장(+2/연장)

## 지급 계산

```
기본: 5타이 + 역합산
방총: 버린 사람만 지급
자모: 나머지 3명 지급
친(동가) 화료/방총: 2배
지급액 = 총타이 × 1000G (기본)
실제보상(SharedWallet) = 획득타이 × 10만G
```

## UI 구조

```
<div id="game-container">
  <div id="round-info">   <!-- 국 바람, 잔여패, 점수판 -->
  <div id="opponent-areas">  <!-- CPU 3명 패 표시 (뒤집힌 패 + 오픈패) -->
  <div id="center-area">    <!-- 버린패들, 중앙 정보 -->
  <div id="player-area">    <!-- 내 패 (가로 스크롤), 액션 버튼 -->
  <div id="claim-overlay">  <!-- 치/퐁/깡/화료 선언 팝업 -->
```

## 컨벤션

- UI 한국어
- 타일 표시: 이모지+텍스트 혼합 (이미지 없이)
  - 만쯔: 🀇🀈🀉🀊🀋🀌🀍🀎🀏 (U+1F007~)
  - 통쯔: 🀙🀚🀛🀜🀝🀞🀟🀠🀡 (U+1F019~)
  - 죽쯔: 🀐🀑🀒🀓🀔🀕🀖🀗🀘 (U+1F010~)
  - 바람: 東南西北 텍스트
  - 삼원: 白發中 텍스트
  - 화패: 春夏秋冬梅蘭菊竹 텍스트
- `const SharedWallet` (window.SharedWallet 아님)
- SharedWallet.gold 직접 읽기
- `<script src="/lib/shared-wallet.js?v=20260524a"></script>` 반드시 포함
- `<script src="/lib/multiplayer.js?v=20260524a"></script>` 포함 (멀티 준비)
- CSS: `padding-top: calc(48px + env(safe-area-inset-top))`
- 다크 테마, 세로 모바일 우선

## SharedWallet 보상

```js
// 라운드 종료 시
const goldReward = totalTai * 100000;  // 타이 × 10만
if (goldReward > 0 && typeof SharedWallet !== 'undefined' && SharedWallet.addGold) {
  try { SharedWallet.addGold(goldReward); } catch (_) {}
}
```

## 멀티플레이어 준비 (현재는 미구현, 구조만)

- `player.type === 'remote'`인 경우 액션 대기 (WebSocket 대체 가능)
- `RELAY_URL` 상수 준비 (현재 미사용)
- 방 코드 입력 UI 슬롯 (숨김 처리, 싱글에서 표시 안 함)

## Done 기준

1. `python -m http.server 8000`으로 서버 띄운 후 `http://localhost:8000/mahjong/` 접속
2. 4명(인간1+CPU3) 게임 시작 가능
3. 배패 → 뽑기 → 버리기 → 치/퐁 → 화료 까지 전체 플로우 동작
4. 화료 시 타이 계산 + 점수 반영
5. 새 라운드 시작 가능
