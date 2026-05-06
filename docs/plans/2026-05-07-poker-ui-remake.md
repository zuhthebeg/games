# Poker UI Remake Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rework the poker game into a mobile-first casino-table experience while fixing SharedWallet/top-safe-area layout drift.

**Architecture:** Keep the existing poker rules, single-player, multiplayer bridge, SharedWallet, and gold logic. Replace the brittle viewport/header spacing with one safe-area layout model, upgrade card rendering to blackjack-style physical cards, and add lightweight AI dealer/avatar speech without external APIs.

**Tech Stack:** Static HTML/CSS/vanilla JS in `poker/index.html`, existing local test style using Node scripts, GitHub Pages deployment after user approval.

---

### Task 1: Add regression test for viewport and safe-area layout

**Files:**
- Create: `poker/poker-ui-layout.test.cjs`
- Modify: none

**Steps:**
1. Read `poker/index.html` as UTF-8.
2. Assert viewport meta contains `viewport-fit=cover`.
3. Assert `body` uses `padding-top: calc(var(--wallet-bar-h) + env(safe-area-inset-top))` or equivalent.
4. Assert `header { margin-top: 50px }` is gone.
5. Assert `.mode-select`, `.lobby`, `.waiting-room` use safe-area top offset.
6. Run: `node poker/poker-ui-layout.test.cjs`.
7. Expected before implementation: FAIL.

### Task 2: Fix top layout and mobile viewport

**Files:**
- Modify: `poker/index.html`

**Steps:**
1. Change viewport meta to include `viewport-fit=cover`.
2. Add CSS vars: `--wallet-bar-h: 56px`, `--app-max: 520px`, card dimensions.
3. Set `html, body` to `width:100%; min-height:100%;`.
4. Set `body` to `min-height:100dvh; padding-top: calc(var(--wallet-bar-h) + env(safe-area-inset-top)); overflow:hidden;`.
5. Remove `header margin-top: 50px`.
6. Convert `.game-container` to an app shell: `height: calc(100dvh - var(--wallet-bar-h) - env(safe-area-inset-top)); display:grid; grid-template-rows:auto minmax(0,1fr) auto auto; overflow:hidden;`.
7. Make `.poker-table` fit the middle area with `min-height:0`, flex/grid, and reduced mobile padding.
8. Update fixed overlays to use `padding-top: calc(var(--wallet-bar-h) + env(safe-area-inset-top))` and `min-height:100dvh`.
9. Run layout test. Expected: PASS.

### Task 3: Upgrade card component

**Files:**
- Modify: `poker/index.html`
- Test: `poker/poker-card-render.test.cjs`

**Steps:**
1. Add test asserting `renderCard()` output includes `.card-top`, `.suit-center`, `.card-bottom`, `data-rank`, `data-suit`, and keeps `.card.back` for hidden cards.
2. Run test. Expected before implementation: FAIL.
3. Update CSS `.card` to blackjack-style physical card: top rank/suit, center suit, rotated bottom rank/suit, better back design.
4. Update `renderCard(card, faceDown=false, extraClass='')` to return the new structure.
5. Preserve existing IDs/containers: `#myCards`, `#opponentCards`, `#communityCards`.
6. Run card test. Expected: PASS.

### Task 4: Add dealing/flip/winner visual hooks

**Files:**
- Modify: `poker/index.html`
- Test: extend `poker/poker-card-render.test.cjs`

**Steps:**
1. Add CSS keyframes/classes: `.card.dealing`, `.card.flipping`, `.card.winner`.
2. Add lightweight JS state `game.animatingCards` or class hooks when starting a hand, revealing community cards, and showdown.
3. Keep fallback safe: rendering must work even if animation state is empty.
4. Run card/render tests.

### Task 5: Add AI dealer/avatar speech UX

**Files:**
- Modify: `poker/index.html`
- Test: `poker/poker-ai-dealer.test.cjs`

**Steps:**
1. Add test asserting HTML contains `id="aiAvatar"`, `id="dealerBubble"`, and function `dealerSay`.
2. Add opponent area HTML: avatar + speech bubble near existing player info.
3. Add CSS: `.ai-row`, `.ai-avatar`, `.ai-avatar.thinking`, `.dealer-bubble`, bubble in/out animations.
4. Add `dealerSay(text, duration=1600)` and `setAiThinking(on)`.
5. Call `dealerSay()` in `aiTurn`, `startHand`, `nextPhase`, `showdown`, and `endHand` with short Korean poker lines.
6. Do not call external LLM APIs in gameplay. Keep it instant/free.
7. Run AI dealer test. Expected: PASS.

### Task 6: Smoke test existing game invariants

**Files:**
- Existing tests plus new tests

**Commands:**
```bash
node poker/poker-ui-layout.test.cjs
node poker/poker-card-render.test.cjs
node poker/poker-ai-dealer.test.cjs
```

Also run broad poker-related grep checks:
```bash
grep -n "function startSinglePlayer\|function updateMultiplayerDisplay\|SharedWallet.init" poker/index.html
```

Expected: tests pass; multiplayer and SharedWallet hooks still present.

### Task 7: Commit locally only

**Files:**
- `poker/index.html`
- `poker/*.test.cjs`
- `docs/plans/2026-05-07-poker-ui-remake.md`

**Command:**
```bash
git add poker/index.html poker/*.test.cjs docs/plans/2026-05-07-poker-ui-remake.md
git commit -m "Remake poker table UI"
```

Stop before push/deploy. Report diff/test evidence and ask for deployment approval.
