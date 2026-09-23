# Gostop Laya Hint Pilot Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a click-to-request, singleplayer-only Gostop card hint without autoplay, hidden-information leaks, or browser-held Laya credentials.

**Architecture:** A static-game helper gathers only visible state and candidate cards. `llm-worker` passes a dedicated route to `llm-proxy`, where relay JWT validation, schema checks, rate limit and the existing local Laya credential gate prediction. Both server and client validate the chosen candidate; invalid/late response is inert.

**Tech Stack:** vanilla JS game, Node.js proxy, TypeScript Cloudflare Worker, Node built-in test runner, existing Laya typed-choice HTTP API.

---

### Task 1: Pure state extractor and stale guard

**Files:** `gostop/hint.js`, `gostop/hint.test.cjs`, `gostop/index.html`.

1. Add failing tests for own-hand/public-table/capture serialization and exclusion of `players[1].hand` and `deck` content; turn fingerprint invalidation; multiplayer disabled.
2. Run `node --test gostop/hint.test.cjs` (fail).
3. Implement pure `getHintRequest(state)` and `isCurrentHint(...)`; input candidates are own-card ids only. Add a temporary local-only button path in index.html.
4. Rerun tests and `git diff --check`; commit only game files.

### Task 2: Protected recommendation gateway

**Files:** `/home/cocy/llm-proxy/server.js`, `/home/cocy/llm-proxy/test/gostop-hint.test.cjs`, `/home/cocy/llm-worker/src/index.ts`.

1. Write failing tests for bad/missing JWT, oversized inputs, hidden-info payload rejection, empty/too-many choices, invalid model choice, 429 throttle, and timeout.
2. Implement `POST /api/games/gostop/hint` before general API auth in proxy: JWT introspection via relay `/api/auth/me`, max request body, per-user short rate limit, bounded Laya concurrency and 3s timeout, Laya call using *existing* `LAYA_API_TOKEN` only on server. Map selected choice back to candidate and generate a rules-grounded one-line reason, never model prose.
3. In Worker add exact-route forwarder with `Authorization` header and existing CORS whitelist; do not widen generic routes. Run `node --check server.js`, proxy tests, `tsc --noEmit`.
4. Do not restart/deploy automatically; review config and obtain production deploy confirmation. For local testing run proxy in isolated port and mocked upstreams.

### Task 3: Wire hint UI and verify

**Files:** `gostop/index.html`, `gostop/hint.js`, `gostop/hint.test.cjs`.

1. Add failing tests: button only visible in solo human turn, no auto action/reward/rank path, stale responses discarded, no JWT or Laya credential string in source/DOM, 401/429/503 gracefully fail.
2. Implement button and suggestion highlight with `textContent` only. JWT is existing cocy auth token, never Laya server token. Revalidate candidate remains in hand before UI highlight; clear on turn/deal/menu/multiplayer.
3. Run game suite, proxy suite, Worker typecheck, `git diff --check`, and a local browser smoke test without production deployment. Compare several representative candidate states against existing CPU heuristic; report any wrong model choices and block production release if unstable.
