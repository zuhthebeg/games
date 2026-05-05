# pingtan Multiplayer Emotes, BGM, and Clear Score Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add lightweight multiplayer emotes with TTS, fix audible BGM playback, and show map clear score targets.

**Architecture:** Keep all game-facing UI in `pingtan/index.html`. Emotes use existing multiplayer action relay as non-state-changing `REACTION_EMOTE` events. BGM uses the existing `soundSettings.bgm` setting and a minimal browser WebAudio loop. Clear score display derives from map preset metadata with a default of 10.

**Tech Stack:** Vanilla HTML/CSS/JS, existing multiplayer relay client, browser `speechSynthesis`, browser WebAudio, Node static tests.

---

### Task 1: Static Tests

**Files:**
- Create: `pingtan/multiplayer-emotes-bgm-score.test.cjs`

**Step 1: Write failing tests**
Check for:
- `REACTION_EMOTE` action handling
- `showEmotePanel`, `sendReactionEmote`, `showReactionEmote`
- `speechSynthesis` usage gated by `soundSettings.voice`
- BGM WebAudio oscillator/gain use and `BGM.start()` on enabled setting
- `targetScore`/clear score display in map selection and game UI

**Step 2: Run test to verify it fails**
Run from `C:\Users\user\games\pingtan` or WSL path `/mnt/c/Users/user/games/pingtan`:
```bash
node multiplayer-emotes-bgm-score.test.cjs
```
Expected: FAIL because symbols do not exist yet.

### Task 2: Emote UI and Relay

**Files:**
- Modify: `pingtan/index.html`

**Step 1: Add constants**
Add `REACTION_EMOTE` to action handling or use string literal. Add fixed emote list with id, emoji, label, phrase, motion.

**Step 2: Add UI**
Add a `💬` button in game controls/settings area. On click, open a compact fixed modal with emote buttons.

**Step 3: Add sender**
Implement `sendReactionEmote(emoteId)` with 1.5s cooldown. It should show locally and call `mpState.client.sendAction({ type: 'REACTION_EMOTE', ... })` in multiplayer.

**Step 4: Add receiver**
In `onMpEvent` action branch, handle `REACTION_EMOTE` before `applyGameAction`. Show overlay/toast and mark action processed.

### Task 3: TTS and Motion

**Files:**
- Modify: `pingtan/index.html`

**Step 1: Add TTS helper**
Implement `speakReaction(text)` using `window.speechSynthesis` only when `soundSettings.voice` is true.

**Step 2: Add overlay motion**
Implement `showReactionEmote({ playerName, emoji, phrase, motion })` with CSS inline/class animation. Motions: pop, shake, wave, celebrate.

### Task 4: BGM Fix

**Files:**
- Modify: `pingtan/index.html`

**Step 1: Inspect existing BGM object**
Preserve public API: `BGM.start()`, `BGM.stop()`, `BGM.setVolume()`.

**Step 2: Implement minimal WebAudio loop**
Use an oscillator + gain with low volume. Start on first user gesture when BGM enabled. Stop cleanly when toggled off.

**Step 3: Wire UI**
Ensure setting checkbox calls `BGM.start()` when checked and `BGM.stop()` when unchecked. Existing game start should call `BGM.start()` if enabled.

### Task 5: Clear Score Display

**Files:**
- Modify: `pingtan/index.html`

**Step 1: Add helper**
Implement `targetScoreForMap(mapId)` defaulting to 10, using `MAP_PRESETS[mapId].targetScore || victoryPoints || clearScore`.

**Step 2: Add metadata**
If presets lack target score, add `targetScore: 10` default where appropriate or rely on helper.

**Step 3: Display**
Show `클리어 목표: N점` in map cards/select detail and in active game UI near map/turn info.

### Task 6: Verification and Deploy

**Files:**
- All touched files

**Step 1: Run focused test**
```bash
cd /mnt/c/Users/user/games/pingtan
node multiplayer-emotes-bgm-score.test.cjs
```
Expected: PASS.

**Step 2: Run pingtan suite**
```bash
cd /mnt/c/Users/user/games/pingtan
for t in *.test.cjs; do node "$t" || exit 1; done
```
Expected: all PASS.

**Step 3: Run multiplayer lib tests**
```bash
cd /mnt/c/Users/user/games/lib
for t in multiplayer-*.test.cjs; do node "$t" || exit 1; done
```
Expected: all PASS.

**Step 4: Commit and push**
```bash
cd /mnt/c/Users/user/games
git add pingtan/index.html pingtan/multiplayer-emotes-bgm-score.test.cjs docs/plans/2026-05-05-pingtan-multiplayer-emotes-bgm-score-design.md docs/plans/2026-05-05-pingtan-multiplayer-emotes-bgm-score.md
git commit -m "Add pingtan multiplayer emotes and BGM polish"
git push origin main
```

**Step 5: Production smoke**
Fetch `https://game.cocy.io/pingtan/?v=<commit>` and verify new symbols are present.
