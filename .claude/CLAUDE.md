# games repo

## Goal
Add a new small mobile-first web game to game.cocy.io that fits the existing static game pattern.

## Current task
Build and register a new game at `pocket-sort/`.
It must be a deterministic sorting/organizing puzzle with fixed levels and QA-readable state.

## Architecture
- Each game lives in its own folder at repo root.
- Deploy target is GitHub Pages at `https://game.cocy.io/<slug>/`.
- Registry/listing is driven by `apps.json` and the homepage JS in `index.html`.
- Keep implementation lightweight: plain HTML/CSS/JS preferred unless a library is clearly necessary.

## Rules
- Mobile-first, portrait-friendly UI.
- No backend, no wallet, no ranking, no login for this game.
- Expose testable state in DOM or debug JSON.
- Fixed levels only. No procedural generation.
- Keep scope to one shipping cycle.
- Do not refactor unrelated existing games.

## Required verification
- One valid move succeeds.
- One invalid move is blocked and surfaced.
- One known level can be cleared and shows clear state.
- Game must be linked from apps.json and homepage category flow.
