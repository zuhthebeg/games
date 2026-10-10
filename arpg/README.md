# Untitled — M0 browser shell

No bundler or network dependencies. From the games repository:

```sh
python3 -m http.server 8731
# Open http://localhost:8731/arpg/
node --test arpg/test/*.test.js
node arpg/test/browser-smoke.mjs
```

Stop the server with Ctrl-C. Smoke uses `/home/cocy/bin/chromium`, raw CDP on
19097, and a unique temporary Chromium profile (cleaned on completion).
The browser smoke takes about two minutes: it waits for real simulation time,
including natural S2 death and the complete 30-second S1 timer.

## Boundaries

- `js/main.js`: sole caller of `step`; 30Hz accumulator, maximum five steps per
  frame, discarded backlog, visibility pause and fresh input on resume.
- `js/input.js`: independent held states and latched press edges; release never
  clears an edge before the next tick. Touch attack and J use simulation auto-aim.
- `js/render/renderer.js`: owns interpolation snapshots, camera, pools, feedback;
  never writes simulation state. Telegraphs use exact current simulation origins,
  shapes and facing, rather than interpolated/animated character transforms.
- `js/render/shapes.js`: circle offsets, rectangle offsets, cone radians and
  full-sized boundary pattern. Windup fill grows inside a full-sized outline;
  lock/active are red, with stronger/extra boundary markings.
- `js/render/visual-provider.js`: register a player-weapon or monster-type factory
  with `register(key, factory)`. Factory receives `(entity, {color})` and returns
  `{container, update(entityState, animState, dt), destroy()}`. Renderer continues
  to own sorting, positions, shadows and effects; an atlas factory can replace
  procedural art without changing combat or the renderer core. Palette overrides
  are accepted by the provider constructor.
- `js/ui/hud.js`: Korean DOM menus, cooldown/resource displays, end/death screens.
- `window.__arpg.world`: live, recursively read-only debugging proxy.

## Verification and limits

The Node suite keeps all 11 simulation tests and adds two input regressions for
short taps, mouse-button chords, touch auto-aim and reset.

Smoke checks real keyboard/touch input, a brief dodge press, blade hits, bow/focus
hits, focus mana spend, viewport containment/nonoverlap, readonly debugging,
natural death/cause display, return progress/terminal display, exact S1 tick 900,
and visibilitychange pause/resume. The visibility test injects the browser's
hidden-state property/event; it does not simulate OS background throttling.

S1 is a safe 30-second timer against an immortal scarecrow; no action is needed
for clear, and attacks train aiming. S2 idle death leads to the recorded ability
and monster name, not a guessed cause. Return requires a free act slot and a safe
2-second window; hit interrupts without consuming the scroll, dodge cancels,
and successful channel completion triggers the round's returned screen.

This is local single-player M0, not relay/network co-op or an economy layer.
Procedural placeholder art only; no audio or Blender atlases. Mid-Android 60fps,
thermal behavior, real-device touch and OS backgrounding remain hardware checks.
No sim/content changes requested. No portal registration, analytics, ads,
commits or deployment.
