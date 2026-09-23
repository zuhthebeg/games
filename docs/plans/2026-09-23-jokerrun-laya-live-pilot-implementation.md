# JokerRun Laya Gated Advice Pilot Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a separate, opt-in, non-executing Laya strategy advice button to JokerRun without changing existing hints.

**Architecture:** A pure frontend helper extracts whitelisted combat state and 2–4 legal strategy options. The Worker forwards one exact route to the local proxy, which validates relay JWT and request, rate-limits, uses the existing server-only Laya token, and returns a candidate ID plus bounded explanatory text. Frontend checks stale state and never calls action functions.

**Tech Stack:** Vanilla JS HTML, Node built-in tests, Node proxy, TypeScript Cloudflare Worker, Windows local Laya server.

---

### Task 1: Candidate/serialization helper
**Files:** `jokerrun/laya-hint.js`, `jokerrun/laya-hint.test.cjs`.
1. Write failing tests for ordered card/joker whitelists, optional boss limitation, disabled/empty resources, stale fingerprint and no secret/deck-order leak.
2. Run `node --test jokerrun/laya-hint.test.cjs` and observe failure.
3. Implement pure `buildPilotRequest`, `isFreshPilotResponse`, candidate construction with 2–4 options, and status-only advice; rerun tests.
4. Commit just helper/tests after review.

### Task 2: Secured API path
**Files:** `/home/cocy/llm-proxy/jokerrun-hint.js`, `/home/cocy/llm-proxy/server.js`, `/home/cocy/llm-proxy/test/jokerrun-hint*.test.cjs`, `/home/cocy/llm-worker/src/index.ts`.
1. Test invalid/missing relay JWT, hidden/oversized state, bad candidate IDs, rate limit and invalid Laya response. Confirm no token in outbound model response.
2. Implement exact `/api/games/jokerrun/hint` route using verified user ID, bounded input, server-only `LAYA_API_TOKEN`, 3.5s timeout and explicit multilingual choice checkpoint. Add exact Worker passthrough.
3. Run `node --test test/jokerrun-hint*.test.cjs`, `node --check server.js`, Worker `tsc --noEmit`, then commit only after reviewing preexisting repo changes. Do not restart/deploy on test failure.

### Task 3: Gated UI and integration
**Files:** `jokerrun/index.html`, `jokerrun/laya-hint.test.cjs`.
1. Test `?layaHintPilot=1` gating, no mutation/attack on response, stale discard, non-blocking 401/429/503 and unchanged existing hint listener.
2. Add separate button and text-only result with warning, using existing `cocy_auth_token` JWT. Compare state fingerprint on response, never show stale/unknown choice.
3. Run relevant game tests, backend tests, Worker typecheck, browser snapshot smoke when allowed; report any policy blocker. Do not silently publish unvalidated quality as a recommended move.
