# Catan Victory Timer Emotes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Catan victory UI persistent, allow hosts to configure turn duration, and improve multiplayer reactions with per-turn limits, custom text, and local TTS pipeline playback.

**Architecture:** Keep the single-file Catan app architecture. Store turn duration in room `gameConfig.turnSeconds`, copy it into `state.turnSeconds`, and use it for turn reset/render. Render a winner modal from state until dismissed. Extend reaction state with per-turn usage and route preset/custom reaction audio through `llm.cocy.io` TTS when possible, falling back to browser speech.

**Tech Stack:** Vanilla HTML/CSS/JS, relay room `gameConfig`, existing Catan tests in `catan/*.test.cjs`, GitHub Pages deploy.

---

### Task 1: Write failing tests

**Files:**
- Create: `catan/victory-timer-emotes.test.cjs`

**Steps:**
1. Assert persistent winner modal tokens exist.
2. Assert `turnSeconds` replaces fixed 60-second timer reset and render percent.
3. Assert host lobby sends `gameConfig.turnSeconds`.
4. Assert reactions include new presets, custom reaction input, per-turn usage tracking, and local TTS pipeline URL.
5. Run the new test and confirm it fails.

### Task 2: Implement victory modal

**Files:**
- Modify: `catan/index.html`

**Steps:**
1. Add `dismissedWinner` state reset.
2. Add `renderWinnerModal()` and `dismissWinnerModal()`.
3. Insert modal in game screen render.
4. Export dismiss function.

### Task 3: Implement host turn timer setting

**Files:**
- Modify: `catan/index.html`

**Steps:**
1. Add `turnSeconds` state and helper clamp.
2. Replace hardcoded 60 in `onTurnStart`, reset, and timer percentage.
3. Add select in multi options/lobby host UI.
4. Include `turnSeconds` in create/start game config and game init action state.

### Task 4: Implement reaction updates

**Files:**
- Modify: `catan/index.html`

**Steps:**
1. Add reaction presets.
2. Add `reactionTurnUsed` state, reset on turn start.
3. Block sending if not current player's turn or already used this turn.
4. Add custom prompt flow with 30-char limit.
5. Route reaction speech through `llm.cocy.io/v1/audio/speech` or fallback to browser TTS.

### Task 5: Verify and deploy

**Commands:**
- `node catan/victory-timer-emotes.test.cjs`
- `for t in catan/*.test.cjs; do node "$t" || exit 1; done`
- `git add catan/index.html catan/victory-timer-emotes.test.cjs docs/plans/2026-05-05-catan-victory-timer-emotes.md`
- `git commit -m "Polish Catan victory timer and emotes"`
- `git push origin main`
- Poll production HTML for new tokens.
