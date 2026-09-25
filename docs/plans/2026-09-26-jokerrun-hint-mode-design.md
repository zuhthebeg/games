# JokerRun hint modes — approved design (2026-09-26)

## Goal
Replace the gated duplicate AI experiment button with a permanent setting for one hint button: Algorithm (default) or AI. AI advice must identify exact discard cards, and explanation must not obscure play.

## Modes and UX
- Existing algorithm hint is the default, including its existing click/re-click behavior. Store an explicit opt-in AI preference in localStorage, render it in the Settings segmented row. Leaving AI mode restores algorithm behavior.
- AI mode uses the same hint button but **never** attacks, discards, or reorders automatically. The button requests advice on click. A compact in-flow, expandable advice row immediately below the status bar displays summary and optional details; no floating overlay. Mark recommended cards in the existing hand area using distinct attack/discard classes, and clear stale highlights on state change, mode change or subsequent request. Show brief notice that AI can be wrong; prior synthetic evaluation was 7/12.
- Guests have unsigned tokens incompatible with relay `/api/auth/me`; explain account sign-in is required. No raw auth token or deck order is sent in state. If request fails, explain and invoke the original algorithm hint, never auto-submit as a side effect of failure.

## Typed decision boundary
- The game builds only currently legal candidates: one current best attack combination and a bounded deterministic set of 1–5-card discard subsets from visible hand, each with stable candidate ID and card IDs. Candidate details are sent in a bounded request; never infer or send hidden deck order. Prefer a diverse list including useful multi-card discards, not merely a generic DISCARD action. No reordering recommendations until a specific executable card/joker order can be supplied and validated.
- Server validates exact state, candidate IDs, card identity/subset uniqueness, resource and boss restrictions, and bounds before inference. Laya receives choice criteria containing candidate labels (rank/suit), returns only a candidate ID; server returns server-owned text and the validated card IDs. Ignore model-generated prose. On unknown ID or malformed answer, fail closed so UI falls back to algorithm.

## Verification/release
- Test candidate enumeration, no-discard/min4/max3 constraints, stale replies, mode persistence/default, non-blocking markup, no automatic action, output ID provenance, tampered candidates, and authentication boundary. Verify frontend→backend contract, backend tests, Worker routing/typecheck, production JS/HTML/CORS, and authenticated click if a browser session exists. Production backend/Worker deployment follows commits; if unavailable, state exact blocker.
