# 도시와 기사 (Cities & Knights) 삥탄 구현 설계

작성일: 2026-05-21  
대상 파일: `pingtan/index.html`, `pingtan/ai.js`

---

## 활성화 방식
맵 프리셋의 `specialRules: { citiesKnights: true }` 로 활성화.  
기존 맵은 변경 없음. 새 C&K 전용 맵 추가 시 자동 활성.  
`state.citiesKnights = resolveMapPreset(...).specialRules?.citiesKnights || false`

---

## 1. 핵심 규칙

### 주사위
- 기존 2d6 + **이벤트 주사위 1개** 추가
- 이벤트 주사위 면: 🏴야만인(3/6) / 📗과학(1/6) / 📘무역(1/6) / 📕정치(1/6)
- 🏴 → `advanceBarbarian()` / 📗📘📕 → 현재 플레이어에게 해당 덱 카드 1장

### 상품 (Commodities)
도시가 있는 꼭짓점의 특정 자원 타일 생산 시 자원+상품 동시 수령:
- 양털(wool) 도시 → 양털 + **천(cloth)**
- 광석(ore) 도시 → 광석 + **주화(coin)**
- 나무(lumber) 도시 → 나무 + **책(paper)**
- 마을은 자원만

### 기사 (Knights)
- 정착지 없는 꼭짓점에 배치 (인접 규칙 동일)
- 레벨: 1(기본) / 2(강한) / 3(강력)
- 건설/레벨업 비용:
  - L1: wool+ore
  - L1→L2: grain+ore
  - L2→L3: grain+wool
- **활성화**: grain 1개 소모, 해당 턴에 활성 상태
- 활성 기사 능력: 도둑 쫓기, 도로 따라 이동, 상대 기사 추방
- 턴 종료 시 모든 기사 비활성화

### 야만인 트랙
- 위치: 0(멀리) → 7(공격)
- 이벤트 주사위 🏴마다 +1
- 7 도달 시 공격:
  - 전체 활성기사 수 vs 전체 도시 수 비교
  - 기사 ≥ 도시 → 방어 성공: 활성기사 최다 플레이어 진보카드 1장
  - 기사 < 도시 → 방어 실패: 활성기사 최소 플레이어 도시 1개 → 마을 강등
  - 공격 후 위치 리셋(0)

### 진보 카드 3덱

| 덱 | 상품 | MVP 카드 | Full 카드 |
|---|---|---|---|
| 과학📗 | 책(paper) | crane(도시 할인), irrigation(밀×2), mining(광석×2) | engineer(성벽 무료), inventor(숫자토큰 교환), smith(기사 레벨업 무료) |
| 무역📘 | 천(cloth) | resourceMonopoly(자원 독점), merchantFleet(1턴 2:1) | merchant(상인 배치), commercialHarbor, tradingMonopoly |
| 정치📕 | 주화(coin) | knightCard(기사 즉시 활성), spy(진보카드 훔치기) | diplomat(도로 재배치), deserter(상대 기사 비활성), constitution(VP+1), bishop(도둑 면역) |

### 도시 성벽 (City Walls)
- 비용: brick×2, 도시에만 설치
- 효과: 해당 플레이어 자원 버리기 한도 +2 (개인별 적용)

### 메트로폴리스 (Phase 2)
- 각 덱 상품 소모하여 레벨 1→4 업그레이드
- 레벨 4 최초 달성: 메트로폴리스 토큰 획득 (+2VP, 뺏을 수 있음)

---

## 2. State 변경 (index.html 초기 state 객체)

```javascript
// state 전역 추가
citiesKnights: false,
barbarianPos: 0,        // 0~7
eventDiceResult: null,  // "barbarian"|"science"|"trade"|"politics"
knightLevels: {},       // { [vIdx]: 1|2|3 }
knightActive: {},       // { [vIdx]: true|false }
metropolisOwner: { science: null, trade: null, politics: null },
merchantVertex: null,
merchantOwner: null,

// 플레이어 객체 추가 필드 (makePlayer 함수 수정)
commodities: { cloth: 0, coin: 0, paper: 0 },
progressCards: [],   // [{ deck: "science"|"trade"|"politics", type: "crane"|... }]
cityWalls: [],       // [vIdx, ...]
deckProgress: { science: 0, trade: 0, politics: 0 },
metropolis: { science: false, trade: false, politics: false },
```

---

## 3. 새 상수

```javascript
const COMMODITIES = ["cloth", "coin", "paper"];
const COMMODITY_SOURCE = { cloth: "wool", coin: "ore", paper: "lumber" }; // 도시 타일 매핑
const BARBARIAN_MAX = 7;

const COST_KNIGHT = {
  build: { wool: 1, ore: 1 },
  upgrade2: { grain: 1, ore: 1 },
  upgrade3: { grain: 1, wool: 1 },
  activate: { grain: 1 },
};
const COST_CITY_WALL = { brick: 2 };
const COST_DECK_UPGRADE = {
  science: [{ paper: 1 }, { paper: 2 }, { paper: 3 }, { paper: 4 }],  // 레벨 1→4
  trade:   [{ cloth: 1 }, { cloth: 2 }, { cloth: 3 }, { cloth: 4 }],
  politics:[{ coin: 1 },  { coin: 2 },  { coin: 3 },  { coin: 4 }],
};

const EVENT_DICE_FACES = ["barbarian","barbarian","barbarian","science","trade","politics"]; // 6면

const PROGRESS_CARD_DECKS = {
  science: ["crane","irrigation","mining","engineer","inventor","smith"],
  trade:   ["resourceMonopoly","merchantFleet","merchant","commercialHarbor","tradingMonopoly","masterMerchant"],
  politics:["knightCard","spy","diplomat","deserter","constitution","bishop"],
};
```

---

## 4. 새 함수

```javascript
// 이벤트 주사위
function rollEventDice()
  // EVENT_DICE_FACES에서 랜덤 1개 반환

// 야만인
function advanceBarbarian()
  // state.barbarianPos += 1; if >= BARBARIAN_MAX → triggerBarbarianAttack()

function triggerBarbarianAttack()
  // 활성기사 총합 vs 도시 총합 비교 → 결과 처리, 로그, 토스트
  // 공격 후 state.barbarianPos = 0, knightActive 전체 false

// 기사
function canBuildKnight(pIdx, vIdx) → bool
  // 꼭짓점이 비어있고, 인접 꼭짓점에 내 도로 연결, 인접 규칙 통과

function validKnightSpots(pIdx) → vIdx[]

function buildKnight(pIdx, vIdx, free=false) → bool
  // state.knightLevels[vIdx] = 1, state.knightActive[vIdx] = false
  // player.knights.push(vIdx)

function upgradeKnight(pIdx, vIdx) → bool
  // 레벨 1→2 또는 2→3, 비용 차감

function activateKnight(pIdx, vIdx) → bool
  // 비용 grain 1, knightActive[vIdx] = true

function moveKnight(pIdx, fromVIdx, toVIdx) → bool
  // 활성 기사만 이동 가능, 도로로 연결된 꼭짓점으로

// 상품
function distributeCommodities(number)
  // distributeResources()와 함께 호출
  // 도시 있는 꼭짓점 → 해당 타일 type 확인 → COMMODITY_SOURCE 매핑으로 상품 지급

// 진보카드
function drawProgressCard(pIdx, deck) → bool
  // PROGRESS_CARD_DECKS[deck]에서 랜덤 1장 → player.progressCards.push

function playProgressCard(pIdx, cardType, params={}) → bool
  // switch(cardType) → 각 카드 효과 실행

// 성벽
function buildCityWall(pIdx, vIdx) → bool
  // 도시 있는 꼭짓점인지 확인, brick×2, player.cityWalls.push(vIdx)

function getPlayerDiscardThreshold(pIdx) → number
  // getRobberDiscardThreshold() + (player.cityWalls.length * 2)

// 덱 레벨업
function upgradeDeck(pIdx, deck) → bool
  // 상품 소모, deckProgress[deck]++ → 레벨 4시 checkMetropolis()

function checkMetropolis(pIdx, deck)
  // 현재 metropolisOwner[deck] 비교, 더 높으면 탈취

// AI 보조
function getActiveKnightCount(pIdx) → number
function shouldBuildKnight(state, pIdx) → bool  // ai.js에 추가
```

---

## 5. 기존 함수 수정

| 함수 | 변경 |
|---|---|
| `applyRollDice()` (line ~4815) | C&K 모드면 이벤트 주사위도 굴림 → `advanceBarbarian()` 또는 `drawProgressCard()` |
| `distributeResources()` | C&K 모드면 `distributeCommodities()` 함께 호출 |
| `endTurnInternal()` (line ~4833) | C&K 모드면 `knightActive` 전체 false |
| `makePlayer()` | commodities, progressCards, cityWalls 등 초기화 추가 |
| `postDicePromptDiscards()` | AI는 `getRobberDiscardThreshold()`, 인간은 `getPlayerDiscardThreshold(myIdx)` |
| `recalcLargestArmy()` | C&K 모드에선 largest army 없음 (기사 레벨 합산으로 대체 또는 제거) |

---

## 6. 새 ACTION 타입

```javascript
ACTION.BUILD_KNIGHT     = "BUILD_KNIGHT"    // { playerId, vertexId }
ACTION.UPGRADE_KNIGHT   = "UPGRADE_KNIGHT"  // { playerId, vertexId }
ACTION.ACTIVATE_KNIGHT  = "ACTIVATE_KNIGHT" // { playerId, vertexId }
ACTION.MOVE_KNIGHT      = "MOVE_KNIGHT"     // { playerId, fromVertexId, toVertexId }
ACTION.BUILD_CITY_WALL  = "BUILD_CITY_WALL" // { playerId, vertexId }
ACTION.PLAY_PROGRESS    = "PLAY_PROGRESS"   // { playerId, cardType, params }
ACTION.UPGRADE_DECK     = "UPGRADE_DECK"    // { playerId, deck }
ACTION.EVENT_DICE_ROLL  = "EVENT_DICE_ROLL" // { playerId, result } — 멀티 동기화
ACTION.BARBARIAN_RESULT = "BARBARIAN_RESULT"// { result, winnerIdx, loserIdx }
```

---

## 7. UI 추가

### 야만인 트랙 바
- 상단 또는 우측 사이드에 고정 바 (7칸 + 야만인 아이콘 위치 표시)
- 잔여 5칸 이하: 주황, 2칸 이하: 빨강 깜빡임
- 공격 시 큰 오버레이 토스트

### 주사위 표시
- 기존 숫자 주사위 2개 옆에 이벤트 주사위 아이콘 추가
- 이벤트 결과 아이콘으로 표시 (1초 애니)

### 빌드 버튼 추가 (C&K 모드)
- 기사 건설 🗡️, 기사 레벨업 ⬆️, 기사 활성화 ⚡
- 성벽 건설 🧱
- 덱 레벨업 (과학/무역/정치 각 버튼)

### 진보카드 패널
- 기존 발전카드 패널 → 3탭(과학/무역/정치)으로 교체
- 보유 카드 아이콘 + 클릭 시 사용

### 꼭짓점 렌더 수정
- 기사 있는 꼭짓점: 검(⚔️) 아이콘, 레벨별 크기, 활성=황금/비활성=회색
- 성벽 있는 도시: 도시 아이콘 주변 성벽 테두리

### 플레이어 패널
- 상품 3종 개수 표시 (🧵천 💰주화 📚책)
- 덱 레벨 표시 (📗1 📘0 📕2)

---

## 8. AI 추가 (ai.js)

```javascript
function shouldBuildKnight(state, pIdx)
  // barbarianPos >= 4이고 도시 수 > 활성기사 수면 true

function shouldActivateKnight(state, pIdx)
  // barbarianPos >= 5이면 true

function chooseProgressCard(state, pIdx, cards)
  // VP 기여 높은 카드 우선 (constitution > crane > irrigation 등)
```

---

## 9. 구현 페이징

### Phase 1 — MVP (이것만 먼저)
1. 이벤트 주사위 + 야만인 트랙 (공격 로직 포함)
2. 기사 건설 + 활성화 (레벨 1만)
3. 상품 생산 (도시 상품 지급)
4. 진보카드 3덱 각 2종씩 (총 6종)
5. C&K 전용 맵 1개 추가
6. AI: 야만인 임박 시 기사 활성화

### Phase 2 — 완성
7. 기사 레벨 2~3, 이동, 추방
8. 진보카드 전체
9. 도시 성벽
10. 덱 레벨업 + 메트로폴리스
11. AI 전략 고도화

### 제거 권장
- 상인 카드(Merchant) 꼭짓점 이동 UI — 복잡
- Wedding/Saboteur 사회 카드 — 인터랙션 복잡
- 완전한 메트로폴리스 탈취 시스템 — Phase 2도 선택

---

## 10. 리스크

1. **이벤트 주사위 멀티 동기화**: host가 굴리고 `EVENT_DICE_ROLL` 액션으로 전파 필요. 순서 보장 중요.
2. **기사 렌더**: 꼭짓점에 건물 또는 기사가 오는데, 현재 렌더가 건물만 가정함. 분기 처리 필요.
3. **턴 중 야만인 공격 타이밍**: 이벤트 주사위 결과 처리를 `applyRollDice` 내에서 동기적으로 처리해야 하는데, 야만인 공격 결과 애니메이션과 충돌 주의.

---

## 새 맵 예시

```javascript
MAP_PRESETS["cities-knights-standard"] = {
  id: "cities-knights-standard",
  name: "도시와 기사",
  minPlayers: 3, maxPlayers: 4, vpGoal: 13,
  specialRules: { citiesKnights: true },
  // layout: 기존 standard와 동일 (19칸)
  layout: { axial: [ /* standard와 동일 */ ] },
  resources: { /* standard와 동일 */ },
  // ...
};
```
