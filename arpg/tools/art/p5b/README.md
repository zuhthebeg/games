# P5-B reproducible local pipeline

Requires the existing Windows Blender 5.2.2 / CC0 KayKit source and baked scenes;
Python with Pillow/numpy for packing. Never write to the shared checkout or
parallel item-icon paths. Use this worktree only. No network models or paid assets.

1. Check `model-origin-verification.json` hashes against the source GLBs and
   `LICENSE-KayKit.txt` against the provenance digest.
2. Copy `config.json`, `bake-full.py`, `verify-pose.py` to the offline p5b folder.
   Run Windows Blender `-b --factory-startup --python <offline>/bake-full.py --
   <offline>/config.json` (optional `--only hero-sword`, `hero-bow`, `hero-focus`).
   Outputs stay in `C:/Users/user/ai-tools/arpg-art/p5b/frames`.
   Existing frame PNGs are resumable; for changed geometry/material/camera use a
   fresh output folder, not stale cached frames. No render retry/wait loop.
3. Run Windows Blender `-b --factory-startup --python <offline>/verify-pose.py --
   <offline-root>`. This evaluates the exact six clip/frame schedules on actual
   skinned meshes; preserve `pose-validation.json` in this directory.
4. Run `python3 arpg/tools/art/p5b/pack-full.py
   /mnt/c/Users/user/ai-tools/arpg-art/p5b arpg/assets/sprites/paperdoll`.
   Optional final arg `hero-sword`, `hero-bow`, or `hero-focus` resumes one kit
   with status PARTIAL. After all three per-kit `validation.json` files exist,
   run the same command with final arg `--collect`, then run step 5; collecting
   prior counters does not re-render or replace the independent delivered gate.
   Weapon/head-dependent frame maps share two weapon pages per kit.
   All full reference comparisons must complete. A raw >4px mismatch stops;
   don't relax that guard to cover a rig/camera/art failure. Correct only measured
   depth-tie boundary pixels against 3D reference and keep raw/corrected counters.
5. Run `python3 arpg/tools/art/p5b/validate-delivered.py
   arpg/assets/sprites/paperdoll`; source <=3,000,000 bytes and CPU RGBA bound
   <=64MiB for every equipment combination. This is not a GPU/phone RAM claim.
6. Run stamp, unit tests, `node arpg/test/p5b-browser-smoke.mjs`,
   `node arpg/test/p5b-fallback-smoke.mjs` and the existing P2 DOM smoke on free
   test ports. Browser script produces `browser-validation.json` here; no images
   or screenshots. Sixfold CPU throttle and mobile viewport emulation must stay
   labelled desktop approximations. Report cold decode and compose separately.
7. Update `arpg/assets/paperdoll/PROVENANCE.md`, scoped local commits and the parent
   result file. No push/deploy. Preserve incremental commits if any gate fails.
