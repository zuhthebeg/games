# JokerRun Hint Modes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** One permanent hint button with algorithm default and opt-in AI that names specific discard cards and uses in-flow advice.

**Architecture:** The game owns current visible state and enumerates legal attack/discard candidates. The proxy validates every candidate and chooses a typed Laya answer; no game action runs on an AI response. Worker keeps its exact proxy route.

**Tech Stack:** Vanilla HTML/CSS/JS, Node node:test, llm-proxy CommonJS, Cloudflare Worker TypeScript.

---

### Task 1: Frontend candidate and controller tests
**Files:** `jokerrun/laya-hint.js`, `jokerrun/laya-hint.test.cjs`
1. Test bounded legal attack and 1–5-card discard subsets with IDs and card identity; verify no hidden deck order, boss restrictions, and stale result handling. Run `node --test jokerrun/laya-hint.test.cjs` to see new tests fail.
2. Add candidate construction to existing module. Build request `{state, choices:[{id,kind,cardIds}]}` with no reordering candidates. Return `{choiceId,cardIds,reason}`-compatible rendering and mode helpers; do not invoke game actions. Run tests until passing.
3. Commit only these two files after frontend UI integration.

### Task 2: Settings, single button, and in-flow UI
**Files:** `jokerrun/index.html`, `jokerrun/laya-hint.js`, `jokerrun/laya-hint.test.cjs`
1. Test algorithm default, persisted AI selection, and page structure with one hint button/no fixed advice overlay. Test that AI does not auto-play on repeated click or error.
2. Replace pilot flag block with mode routing on existing hint button. Add Settings segmented row and a compact expandable status row in document flow; highlight indicated attack/discard cards, clear on change; preserve original `showBestHint()` algorithm behavior.
3. Run `node --test jokerrun/laya-hint.test.cjs jokerrun/eval/*.test.cjs` and parse page inline JS; commit.

### Task 3: Proxy typed candidates
**Files:** `/home/cocy/llm-proxy/jokerrun-hint.js`, `/home/cocy/llm-proxy/test/jokerrun-hint.test.cjs`, `/home/cocy/llm-proxy/test/jokerrun-hint-http.test.cjs`, `/home/cocy/llm-proxy/server.js`
1. Write failing validator tests for duplicate IDs/cards, outsider cards, invalid count, boss/resource violations, unsupported action, model output not among candidates, and exact returned card IDs. Add HTTP test that bad requests never reach Laya.
2. Validate candidate descriptors, make Laya criteria one stable ID per candidate and respond with server-owned wording and card IDs. Keep relay JWT auth, body limit, rate limit, and Laya token on server; make timing safe for model load and UI timeout.
3. Run `node --test test/jokerrun-hint*.test.cjs test/gostop-hint*.test.cjs`, `node --check server.js`, then commit proxy files.

### Task 4: Integration and release
1. Verify frontend and backend share request and response contract by constructing a real frontend request and passing it through proxy validation; run actual GPU inference if available.
2. Push game/proxy commits. Restart PM2 `llm-proxy`; Worker source route is already present, deploy only if changed. Check public page and versioned JS match local source, Laya health, JWT-less 401 and CORS preflight. Use browser login/click smoke only when a browser-capable node is available; state if unavailable.
