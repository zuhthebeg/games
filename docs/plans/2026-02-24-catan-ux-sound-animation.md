# Catan UX/Sound/Animation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add player color differentiation (human clearly visible), Web Audio sound effects, and CSS animations to the Catan game.

**Architecture:** All changes in `catan/index.html`. Web Audio API for synth sounds (no files). CSS animations + JS for visual feedback. Human player (index 0) gets distinct visual treatment.

**Tech Stack:** Vanilla JS, Web Audio API, CSS animations, SVG/CSS shapes

**CRITICAL RULES:**
- Only use the `Edit` tool for file changes. NEVER use PowerShell Out-File/Set-Content/Add-Content.
- Run `node --test /mnt/c/Users/user/games/catan/ai.test.cjs` after any ai.js changes.
- git pull first, git add + commit after each task.
- Test in browser after each major change.

---

## Task 1: Fix Building Colors — CSS Shapes Instead of Emoji

**File:** `catan/index.html`

**Problem:** Emoji icons ignore CSS `color` property. Buildings look identical for all players.

**Solution:** Replace emoji with SVG inline icons that use `fill: currentColor` (inherits CSS color), plus solid colored background disc.

**Step 1: Update `.vertex.settlement` and `.vertex.city` CSS**

Find the existing CSS block:
```css
.vertex.settlement,
.vertex.city {
  border: none;
  background: transparent;
  width: 22px;
  height: 22px;
  text-align: center;
  font-size: 18px;
  line-height: 22px;
  cursor: default;
  transform: translate(-50%, -50%);
}
```

Replace with:
```css
.vertex.settlement,
.vertex.city {
  border: none;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  cursor: default;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 800;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0,0,0,0.5);
  box-shadow: 0 0 0 2px rgba(255,255,255,0.85), 0 2px 6px rgba(0,0,0,0.4);
  z-index: 5;
}
.vertex.city {
  width: 26px;
  height: 26px;
  border-radius: 4px;
  font-size: 13px;
  box-shadow: 0 0 0 2.5px rgba(255,255,255,0.9), 0 2px 8px rgba(0,0,0,0.5);
}
/* Human player glow */
.vertex.settlement.player-0,
.vertex.city.player-0 {
  box-shadow: 0 0 0 2.5px #fff, 0 0 10px 3px currentColor, 0 2px 8px rgba(0,0,0,0.4);
  animation: pulse-building 2.5s ease-in-out infinite;
}
@keyframes pulse-building {
  0%, 100% { box-shadow: 0 0 0 2.5px #fff, 0 0 10px 3px currentColor, 0 2px 8px rgba(0,0,0,0.4); }
  50% { box-shadow: 0 0 0 2.5px #fff, 0 0 16px 5px currentColor, 0 2px 8px rgba(0,0,0,0.4); }
}
```

**Step 2: Update vertex rendering JS**

Find line (approx 1815):
```javascript
const icon = v.building === "city" ? "🏰" : "🏠";
```
And the line below it:
```javascript
html += `<div class="vertex ${v.building}" style="left:${p.x}px; top:${p.y}px; color:${state.players[v.owner].color};">${icon}</div>`;
```

Replace both lines with:
```javascript
const label = v.building === "city" ? "도시" : "마을";
const ownerIdx = v.owner;
const isHuman = ownerIdx === 0 && !isMultiMode();
html += `<div class="vertex ${v.building} player-${ownerIdx}" style="left:${p.x}px;top:${p.y}px;background:${state.players[ownerIdx].color};color:#fff;" title="${state.players[ownerIdx].name} ${label}"></div>`;
```

**Step 3: Commit**
```bash
cd /mnt/c/Users/user/games
git add catan/index.html
git commit -m "fix(catan): replace emoji buildings with colored CSS shapes, human player glow"
git push
```

---

## Task 2: Sound System (Web Audio API)

**File:** `catan/index.html`

Add a sound module just before the closing `</script>` tag (or in a `<script>` block).

**Step 1: Add sound utility function**

Find the line near the end of the `<script>` block (before any `render()` call or event listener setup) and add:

```javascript
// ─── Sound System ───────────────────────────────────────────────────────────
const SFX = (() => {
  let ctx = null;
  const getCtx = () => { if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)(); return ctx; };

  function tone(freq, type, duration, vol = 0.3, startTime = 0) {
    const c = getCtx();
    const t = c.currentTime + startTime;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.connect(gain); gain.connect(c.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.start(t); osc.stop(t + duration);
  }

  function noise(duration, vol = 0.15) {
    const c = getCtx();
    const bufSize = c.sampleRate * duration;
    const buf = c.createBuffer(1, bufSize, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    const gain = c.createGain();
    src.buffer = buf; src.connect(gain); gain.connect(c.destination);
    gain.gain.setValueAtTime(vol, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    src.start();
  }

  return {
    dice() {
      // rattle + thud
      noise(0.06, 0.2);
      setTimeout(() => noise(0.05, 0.18), 80);
      setTimeout(() => { noise(0.04, 0.15); tone(120, 'sine', 0.15, 0.25); }, 160);
    },
    build() {
      tone(440, 'square', 0.05, 0.2);
      tone(660, 'square', 0.08, 0.15, 0.05);
    },
    road() {
      tone(300, 'sawtooth', 0.08, 0.15);
      tone(250, 'sawtooth', 0.06, 0.1, 0.07);
    },
    card() {
      tone(800, 'sine', 0.04, 0.12);
      tone(1000, 'sine', 0.04, 0.1, 0.04);
      tone(1200, 'sine', 0.06, 0.15, 0.08);
    },
    robber() {
      tone(200, 'sawtooth', 0.12, 0.3);
      tone(150, 'sawtooth', 0.15, 0.25, 0.1);
    },
    resource() {
      tone(880, 'sine', 0.08, 0.18);
      tone(1100, 'sine', 0.06, 0.12, 0.07);
    },
    error() {
      tone(180, 'square', 0.1, 0.2);
    },
    win() {
      const notes = [523, 659, 784, 1047];
      notes.forEach((f, i) => tone(f, 'triangle', 0.3, 0.4, i * 0.12));
    }
  };
})();
```

**Step 2: Wire sounds to game events**

Find `async function rollDice()` and add `SFX.dice()` at the start of the roll animation (where the dice numbers change).

Find where `placeSettlement` is called in human actions and add `SFX.build()` after success.
Find where `placeCity` is called and add `SFX.build()`.
Find where `placeRoad` is called and add `SFX.road()`.
Find `buyDevCard` call in human handler and add `SFX.card()`.
Find `playKnight` call in human handler and add `SFX.robber()`.
Find where robber is moved (7 roll) and add `SFX.robber()`.
Find where `state.winner !== null` is set and add `SFX.win()`.

For resource gain: in `grantResources` or wherever resources are distributed, add `SFX.resource()` for human player only.

**Step 3: Commit**
```bash
git add catan/index.html
git commit -m "feat(catan): add Web Audio sound effects (dice, build, card, robber, win)"
git push
```

---

## Task 3: Dice Roll Animation

**File:** `catan/index.html`

**Step 1: Add dice animation CSS**

Find the existing dice-related CSS or add after `.number.hot` rule:
```css
@keyframes dice-roll {
  0%   { transform: scale(1.2) rotate(-5deg); }
  25%  { transform: scale(0.9) rotate(5deg); }
  50%  { transform: scale(1.15) rotate(-3deg); }
  75%  { transform: scale(0.95) rotate(3deg); }
  100% { transform: scale(1) rotate(0deg); }
}
.dice-animate {
  animation: dice-roll 0.4s ease-out;
}
```

**Step 2: Add dice element id and animate on roll**

Find where dice values are displayed in render (look for `state.dice` or dice display in HTML). Add `id="diceDisplay"` to the dice container.

In `rollDice()` function, after setting dice values:
```javascript
const el = document.getElementById('diceDisplay');
if (el) { el.classList.remove('dice-animate'); void el.offsetWidth; el.classList.add('dice-animate'); }
```

**Step 3: Commit**
```bash
git add catan/index.html
git commit -m "feat(catan): add dice roll animation"
git push
```

---

## Task 4: Building Placement Animation

**File:** `catan/index.html`

**Step 1: Add CSS animation**

```css
@keyframes place-building {
  0%   { transform: translate(-50%, -50%) scale(0); opacity: 0; }
  60%  { transform: translate(-50%, -50%) scale(1.3); opacity: 1; }
  80%  { transform: translate(-50%, -50%) scale(0.9); }
  100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
}
.vertex.settlement.just-placed,
.vertex.city.just-placed {
  animation: place-building 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}
```

**Step 2: Track last placed vertex**

Add `state.lastPlacedVertex = null` to the initial state.

When `placeSettlement` or `buildCity` succeeds, set `state.lastPlacedVertex = vIdx`.
After `render()`, clear it: `state.lastPlacedVertex = null`.

**Step 3: Apply class in render**

In the vertex render line, add `just-placed` class when `v.index === state.lastPlacedVertex` (or track vertex index).

**Step 4: Commit**
```bash
git add catan/index.html
git commit -m "feat(catan): building placement spring animation"
git push
```

---

## Task 5: Robber Hex Pulse + Toast Notifications

**File:** `catan/index.html`

**Step 1: Robber CSS**
```css
@keyframes robber-pulse {
  0%, 100% { box-shadow: inset 0 0 0 3px rgba(220,50,50,0.0); }
  50% { box-shadow: inset 0 0 0 3px rgba(220,50,50,0.9), 0 0 20px rgba(220,50,50,0.6); }
}
.hex.has-robber {
  animation: robber-pulse 1.2s ease-in-out infinite;
}
```

**Step 2: Toast system**

Add after SFX block:
```javascript
function showToast(msg, duration = 2500) {
  let el = document.getElementById('catan-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'catan-toast';
    el.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(30,30,40,0.92);color:#fff;padding:10px 20px;border-radius:20px;font-size:14px;z-index:9999;pointer-events:none;transition:opacity 0.3s;backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,0.1);';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.opacity = '0'; }, duration);
}
```

**Step 3: Call showToast for key events**
- 강도 발동: `showToast('🗡️ 강도가 나타났어요!')`
- 자원 획득 (human): `showToast('자원 +N 획득!')`
- 발전카드 구매: `showToast('🃏 발전카드 획득!')`
- 기사 사용: `showToast('⚔️ 기사 카드 사용!')`
- AI 건설: `showToast('${aiName}이 마을을 건설했어요')`
- 승리: `showToast('🎉 승리!', 6000)`

**Step 4: Commit**
```bash
git add catan/index.html
git commit -m "feat(catan): robber pulse animation + toast notification system"
git push
```

---

## Task 6: Victory Confetti

**File:** `catan/index.html`

Add a simple CSS confetti effect when `state.winner === humanPlayerIndex`.

```javascript
function launchConfetti() {
  const colors = ['#e94560','#4ecca3','#ffd700','#9b59b6','#fff','#ff6b6b'];
  for (let i = 0; i < 60; i++) {
    const el = document.createElement('div');
    const size = 6 + Math.random() * 8;
    el.style.cssText = `position:fixed;top:-10px;left:${Math.random()*100}vw;width:${size}px;height:${size}px;background:${colors[i%colors.length]};border-radius:${Math.random()>0.5?'50%':'2px'};z-index:9998;pointer-events:none;animation:confetti-fall ${1.5+Math.random()*2}s ease-in forwards;animation-delay:${Math.random()*0.5}s;`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }
}
```

Add CSS:
```css
@keyframes confetti-fall {
  0%   { transform: translateY(0) rotate(0deg); opacity: 1; }
  100% { transform: translateY(100vh) rotate(${Math.random()*720}deg); opacity: 0; }
}
```

(Note: CSS @keyframes can't use JS random — use a fixed rotation range like 720deg in the CSS, and vary via `animation-duration` and `left` in JS.)

Call `launchConfetti()` + `SFX.win()` when winner is detected.

**Step 5: Commit**
```bash
git add catan/index.html
git commit -m "feat(catan): victory confetti animation"
git push
```

---

## Final Verification
```bash
cd /mnt/c/Users/user/games
node --test catan/ai.test.cjs  # must stay green
git log --oneline -6
```

Open https://game.cocy.io/catan/ and verify:
- Human player buildings clearly visible with glow
- Dice roll plays sound + animation
- Building placement spring animation
- Toast notifications appear
- Victory shows confetti + fanfare
