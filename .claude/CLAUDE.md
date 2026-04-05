# games repo

## Goal
Add a new small mobile-first web game to game.cocy.io that fits the existing static game pattern and feels more marketable than the previous Pocket Sort attempt.

## Current task
Build and register a new game at `merge-drop/`.
Concept: a trendy merge puzzle with strong first-glance readability and short-session replayability.

## Product direction
- Theme: soft neon capsule/items merge game
- Core loop: drop/merge identical items to create higher-tier items and survive board pressure
- First 5 seconds must communicate the loop clearly
- Small but juicy: tactile animation, clean sounds, visible combo/upgrade feedback

## Architecture
- Each game lives in its own folder at repo root.
- Deploy target is GitHub Pages at `https://game.cocy.io/<slug>/`.
- Registry/listing is driven by `apps.json` and the homepage JS in `index.html`.
- Keep implementation lightweight and CDN-friendly.

## Library choices
- `matter-js`: physics and collision/merge handling
- `motion` or CSS transforms: lightweight UI juice and transitions
- `howler.js` or minimal Web Audio: short sound effects
- Existing repo patterns (meta tags, GTM, optional confetti) can be reused

## Rules
- Mobile-first, portrait-friendly UI.
- No backend, no wallet, no ranking, no login for v1.
- Show tutorial hint for first interaction.
- QA-readable debug state in DOM or JSON.
- Deterministic spawn queue for the opening sequence so smoke tests are stable.
- Do not refactor unrelated existing games.

## Required verification
- Page loads with visible game board and controls.
- First drop works.
- Same-item merge occurs at least once in deterministic opening queue.
- Game over / restart loop works.
- Game must be linked from apps.json and homepage category flow.
