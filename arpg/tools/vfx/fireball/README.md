# FX1 — Effekseer → Godot → Pixi flipbook spike

## Verdict
VALIDATED: native Windows Core build and Godot Forward+ RGBA capture → local WebP/JSON → opt-in Pixi playback. Not production/default-VFX approval and not an independent `vfx effect-verify` pass. No child reviewer was spawned.

## Local brief / delivered scope
- Adapt the upstream **fire example pair**, not claim new bespoke painted textures or an original authored recipe. Exact recipes and upstream briefs are under `source/`; pinned upstream commit in `provenance.json`.
- Only `ember_bolt` projectile/accepted `explode` presentation changes when `?fx=effekseer` is present. `blast_arrow`, `flame_ring`, windup, hit numbers/camera/host timings stay unchanged. Reduced-motion and missing-resource cases use legacy vectors.
- No Effekseer library/plugin is shipped to the browser. No runtime hotlink. Fixed extra pools: 24 projectile sprites + 12 impact sprites, only after opt-in loads.
- `arpg/index.html` has only the generated `skill-vfx.js` import-map hash update required by the existing stamp test. All other application changes are confined to `skill-vfx.js`.

## Evidence
- `logs/doctor-before.log`, `setup.log`, `godot-install.log`, `init-build.log`, `review.log`, `godot-review-capture.log`, `bake.log`: actual outputs, not inferred capability.
- Godot **4.7.2**, Forward+, NVIDIA RTX 3080 Ti; Core **1.80.7**, plugin **1.80.5.1**. Godot official asset SHA-256: `731980f9608d61333e5baf54a2ef17210acc7a538446c0cb9969f002aca1e953`.
- Custom `Bake.gd`: genuinely transparent viewport, no dummy/floor/UI removal by image subtraction. Fixed 60-fps engine time, captured every 3 frames (20 fps); 12 projectile + 28 impact frames. Camera follows a moving projectile head to retain world-space trails. Native review still uses the unmodified upstream Lab.
- Captures are **256×160**, not 256×256: Godot's Lab viewport stretch preserves its 1280:800 aspect despite the 256×256 window argument. Actual output size is asserted by `pack.py`.
- Atlas **2048×800**, WebP RGB q78, alpha lossless; **108,578 B** WebP + **4,009 B** JSON = **112,587 B**, 28.15% of 400,000-B budget. Decoded RGBA alone is **6.25 MiB**, not 112KB GPU memory. No mipmap/device-GPU budget claim.
- `atlas-validation.json`: every source frame hash/bbox, transparent alpha and exact decoded alpha comparison, clipping 0. Empty first/last impact frames are retained, not falsely treated as missing capture.
- `logs/regression.log`: 240-tick host trace matches base `2f94a9e` (`5d0898f8535413ebd442b86e0b7a3805ed84dbdd6ba0e652fab6c7a514db6b10`); 20 presentation checkpoints match baseline geometry/transforms. Flag off has zero new sprites and no load task; a forced 503 exercises fallback.
- `logs/native-smoke.log`: fresh Chromium/WebGL at 390px/1280px, native touch/mouse, both flags, actual texture/frame advancement, bounded pools, reduced/reset/unrelated-skill behavior, read-only state, actual game flagged boot, consoleErrors 0. Desktop emulation is **not** a physical mobile-device test.
- Entire suite: from the **worktree repo root**, `node --test arpg/test/*.test.js` → **516/516 PASS**. Existing C1 historical comparison assumes repo-root cwd: running the same suite from `arpg/` creates a duplicate `arpg/arpg` path and fails; no unrelated C1 test was edited. `logs/all-tests.log` is the final correct-cwd output.

## Comparison / recommendation
- Baked atlas inspection shows a coherent hot comet head, peeling fire, sparks and evolving smoke rather than only the current circles and line segments. It is a richer **available candidate**, not proof users prefer it.
- Existing vectors are immediate, cheap, scale naturally and require no texture loading; retain them as default. The experimental path still computes existing projectile geometry/trail state before hiding it, so there is **no measured CPU-performance win**.
- Upstream real Lab review flags the impact: brightest frame 30 versus declared peak frame 10, and almost no white-hot core at that declared peak. Kept transparently in `review.log` / `review-metrics.json`; not silently waived or called artist-verified.
- The 1.4-second baked impact is normalized into the existing **0.36-second presentation slot**, not a sim timing change; smoke is compressed and initial blank frames delay visual contact slightly. Projectile's 0.6-second clip loops; no seamless-loop claim. Screen rotation also rotates the baked upward smoke, unlike true 3D/world-space particles. Refraction/soft-particle environment interaction cannot survive transparent baking faithfully.
- Recommendation: keep opt-in; polish contact alignment, short impact pacing, stationary-loop/screen-direction treatment and test physical mobile overdraw before any default replacement.

## Reproduce / compare locally (no push or deployment)
Run a local HTTP server from this worktree root:

```sh
python3 -m http.server 8829 --bind 127.0.0.1
# baseline: http://127.0.0.1:8829/arpg/?dev=1
# experiment: http://127.0.0.1:8829/arpg/?dev=1&fx=effekseer
```

Windows tools/source/raw frames live outside the worktree:
- Read-only cloned skill: `C:\Users\user\AppData\Local\Temp\arpg-fx1\arpg-fx1-effekseer-vfx-skill` (Linux clone `/tmp/arpg-fx1-effekseer-vfx-skill`). Nothing installed into global skills folders.
- Toolchain: `C:\Users\user\.cache\effekseer-vfx`; Godot user-folder install: `C:\Users\user\tools\godot-4.7.2-fx1`.
- Generated Lab: `C:\Users\user\AppData\Local\Temp\arpg-fx1\bake\vfx\godot`; raw PNGs: `C:\Users\user\AppData\Local\Temp\arpg-fx1\frames`; Lab strips: `...\bake\vfx\previews\strips\variants\standard_bare`.

From Windows PowerShell, point `-File` to this worktree's `arpg\tools\vfx\fireball\render.ps1` (WSL UNC path works for the script; the script itself changes cwd to a local Windows directory). It reruns doctor/build/review/bake against the already initialized fire examples, exits on command failure and copies only Bake files into the generated Lab. Fresh setup requires the same authorized `setup.ps1`, `vfx init`, `vfx examples add fire` commands recorded in logs; no extra installer or account.

```sh
python3 arpg/tools/vfx/fireball/pack.py /mnt/c/Users/user/AppData/Local/Temp/arpg-fx1/frames arpg/assets/vfx/fireball
node --test arpg/tools/vfx/fireball/regression.test.js
node arpg/tools/vfx/fireball/native-smoke.mjs
node arpg/tools/stamp-assets.mjs
node --test arpg/test/*.test.js
```

## Expansion cost
Observed first pair includes one-time Windows installation plus capture/packing/integration/testing. Reuse installed toolchain and camera/packer for later effects; no browser runtime or paid API is needed. **Estimate**, not benchmark: 20–60 minutes art/pacing iteration per new pair, 1–3 minutes build/review/bake per round, one extra ~100–250KB pair plus decoded texture memory. Larger effects/directional captures can break the 400KB target rapidly. The upstream independent-review workflow remains pending whenever child-spawn is forbidden; do not forge reviewer reports.
