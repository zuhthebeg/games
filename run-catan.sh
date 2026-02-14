#!/bin/bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

cd /mnt/c/Users/user/games

codex --full-auto exec 'Implement playable Catan game in catan/index.html. Single-player vs 3 AI opponents.

## REFERENCE
Read catan/DESIGN.md for full game rules and structure.

## CORE REQUIREMENTS

### 1. Add SharedWallet Integration
- Add: <script src="/lib/shared-wallet.js?v=20260214"></script>
- Add body padding-top: calc(48px + env(safe-area-inset-top))
- Add "카탄" to work with global header

### 2. Game State
```javascript
const state = {
  phase: "setup1", // setup1, setup2, roll, main, robber, discard, end
  currentPlayer: 0,
  players: [
    { id: "human", name: "나", color: "#e94560", resources: {brick:0,lumber:0,wool:0,grain:0,ore:0}, buildings: [], roads: [], devCards: [], knights: 0, vp: 0 },
    { id: "ai1", name: "AI 1", color: "#4ecca3", ... },
    { id: "ai2", name: "AI 2", color: "#ffd700", ... },
    { id: "ai3", name: "AI 3", color: "#9b59b6", ... }
  ],
  hexes: [], // 19 hexes with type, number
  vertices: [], // 54 vertices
  edges: [], // 72 edges
  robber: -1, // hex index with robber (starts on desert)
  longestRoad: null,
  largestArmy: null,
  setupRound: 1
};
```

### 3. Map Generation
- 19 hexes in 3-4-5-4-3 pattern
- Resources: 3 brick, 4 lumber, 4 wool, 4 grain, 3 ore, 1 desert
- Numbers: 2,3,3,4,4,5,5,6,6,8,8,9,9,10,10,11,11,12 (no 7)
- Desert has no number, robber starts there
- Shuffle resources and numbers randomly

### 4. Setup Phase
1. setup1: Each player places 1 settlement + 1 road (in order: 0,1,2,3)
2. setup2: Reverse order (3,2,1,0) places 1 settlement + 1 road
3. Second settlement grants initial resources from adjacent hexes
4. AI auto-places randomly on valid spots

### 5. Main Game Turn
1. ROLL: Human clicks "주사위" button, AI auto-rolls
2. Distribute resources: players with settlements/cities on rolled number get resources
3. If 7: robber phase (discard if >7 cards, move robber, steal)
4. MAIN: Build roads/settlements/cities, buy dev cards, trade
5. End turn button -> next player

### 6. Building Rules
- Road: adjacent to own road/settlement, costs brick+lumber
- Settlement: on vertex adjacent to own road, 2+ distance from other settlements, costs brick+lumber+wool+grain
- City: upgrade settlement, costs 2 grain + 3 ore
- Dev Card: costs wool+grain+ore

### 7. Victory
- First to 10 VP wins
- VP = settlements(1) + cities(2) + VP cards + longest road(2) + largest army(2)

### 8. AI Logic (Simple)
- Setup: pick random valid vertex/edge
- Main: roll, then randomly build if has resources
- No trading for AI (simplify)

### 9. UI Layout
```
[SharedWallet Bar - 홈/카탄/골드/로그인]
[Other Players Status Bar]
[═══════════════════════════════]
[        Hex Map (center)        ]
[═══════════════════════════════]
[My Resources: 🧱0 🪵0 🐑0 🌾0 �ite0]
[Actions: 주사위 | 건설 | 거래 | 턴 종료]
```

### 10. Hex Rendering (CSS)
- Use flexbox for 3-4-5-4-3 rows
- Each hex: clip-path hexagon or CSS hex shape
- Show resource color + number
- Clickable vertices (circles) and edges (lines) when building

### 11. Keep Simple
- No development cards for MVP (add later)
- No ports for MVP
- No trading for MVP
- Just: place buildings, collect resources, reach 10 VP

## DELIVERABLE
Complete single-file catan/index.html that:
1. Generates random map
2. Runs setup phase (human + 3 AI)
3. Main game loop with dice, resources, building
4. Detects 10 VP winner
5. Korean UI
6. Mobile responsive
7. SharedWallet global header

Test by playing through a full game mentally/logically.

Commit: "Implement playable Catan with AI opponents"'
