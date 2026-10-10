# ARPG renderer measurement spike

Scope: only `arpg/spike/`; standalone static ES modules, no analytics/ads/CDN/build.
Design gate: `docs/design/arpg/design-v6.md §15.1` (workspace design document).

## Phone runs

After the owner deploys: **https://game.cocy.io/arpg/spike/**.
Run separately in Chrome and the actual in-app WebView on mid/low-end Android.
Select A, B, A→B, or **B→A→B** for thermal drift; repeat with **부하 ×2**.
Each run warms up for 3s, then measures 30s. Keep brightness/charging conditions,
orientation and viewport stable; keep the page visible. Enter model/app/conditions
in the memo and press **결과 복사**. Clipboard fallback exposes selectable text.
Results remain in this tab until reload/clear; nothing is sent or persisted.
B→A→B reports final-vs-first B p95/FPS changes, not a measured temperature.
Use refreshed separate tabs for cold-load comparisons: repeated A uses module cache.
`?quick=1` keeps the 3s warmup but measures only 5s; use only for functional checks.

## Scene and comparison contract

- Seed `0x15ab2026`; fixed 1400×860 world; camera pans at CSS-pixel scale.
  Surface is full `innerWidth × innerHeight`, DPR capped at 2; no fit-to-world zoom.
  Viewport affects how many objects are visible. Both engines submit all objects;
  clipping is left to the renderer. UI is a fixed overlay, same for both engines.
- Base workload: 4 players, 20 monsters, 200 additive particles/projectiles,
  30 floating damage labels and cone/circle/rect telegraphs. Stress doubles all.
- `scene.js` owns model, 6×96px walk frames, procedural atlas, soft shadow/glow,
  background, polygon telegraphs and seeded absolute-time animation. Same assets
  are generated independently at each run. Measurement resets scene time to zero.
- A imports ONLY `../vendor/pixi-8.22.0.min.mjs`. Uses `Sprite.tint` on grayscale
  monsters: cheap multiplicative palette coloration stays in the sprite batch;
  no ColorMatrixFilter, extra passes or custom shader. This is six multiplicative
  palettes, NOT an arbitrary indexed multi-color palette replacement. Particles
  use `ParticleContainer`; damage uses preinstalled `BitmapText` digits.
- B bakes the **same RGB multiplication** into six 576×96 monster atlases at load,
  preserving alpha. Extra persistent RGBA backing-store estimate:
  **1,327,104 bytes = 1.265625 MiB** (temporary image buffers excluded).
  Canvas uses `lighter`, `fillText`, and the shared shadow texture/polygons.
- Rendering uses a single manual rAF loop in both variants. Average FPS is
  `1000 × interval count / interval sum`. Percentiles use nearest-rank sorted
  rAF intervals; thresholds are strictly >16.7ms and >33.3ms. Intervals include
  model work, rendering and browser scheduling, NOT GPU completion timings.
- Load/init includes dynamic module import, generated assets, palette/font setup,
  renderer construction and first render submission. GPU completion isn't awaited;
  warmup absorbs remaining upload/shader setup. Module import time is also exported.
- `performance.memory` (if exposed) is **whole-tab JS heap**, not renderer memory
  and not Canvas/GPU backing stores. Generated RGBA bytes are a lower-bound
  estimate, not measured process RAM/VRAM. A bitmap font bytes are unknown/null;
  GPU copies, framebuffer/compositor surfaces, allocation rounding and pools are
  excluded. Compare like-for-like device/app runs; don't infer RAM from JS heap.
- Visibility changes and viewport/DPR changes invalidate that run. Stop records
  a failure, not partial FPS. A init failure does not block subsequent B runs.

## Local verification (no npm)

From repository root, in one terminal:

```sh
python3 -m http.server 8732
```

In another:

```sh
node arpg/spike/smoke.mjs
```

Then terminate the HTTP server. Smoke uses `/home/cocy/bin/chromium`, raw CDP on
19094 and an isolated temporary profile. It runs A/B for 5s after 3s warmup,
then reruns A and B at ×2 to check cleanup/reinitialization. Assertions cover
results, no console errors/external requests, seed determinism, palette math,
statistics, doubled counts, DPR, source memory estimates, cancellation and UI unlock.
**Headless Chromium uses SwiftShader software GL. Its FPS/p95 are NOT meaningful
for phone performance and must not decide the renderer.** No device choice is made here.

Bundle facts can be regenerated (bytes, gzip of vendor):

```sh
wc -c arpg/vendor/pixi-8.22.0.min.mjs arpg/spike/{a-pixi,b-canvas,scene,measure}.js
gzip -c arpg/vendor/pixi-8.22.0.min.mjs | wc -c
```
