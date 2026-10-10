# Offline ARPG sprite pipeline

3D models, .blend scenes, raw RGBA PNG frames, license HTML snapshots and contact sheets remain outside the web root at `C:\Users\user\ai-tools\arpg-art`. Only WebP sheets + Pixi JSON metadata ship under `arpg/assets/sprites`.

The copied config targets this machine. Dependencies: Blender 5.2 (Windows, GPU EEVEE) and Python 3 + Pillow (WSL). No image-generation APIs or paid services are used.

1. Bake with Windows Blender: `blender.exe -b --factory-startup --python bake.py -- config.json` (use absolute Windows paths for both files). `--only hero-sword` is a diagnostic subset; a final run must omit it. A preview must never be packed.
2. WSL pack: `python3 pack.py config.json --repo /mnt/c/Users/user/games`.
3. WSL pixel + pose verification: `python3 verify_atlases.py`. Defaults point at the original offline frame archive and game checkout. `--base`, `--frames`, `--report` support isolated fixtures.
4. `node arpg/tools/stamp-assets.mjs`; `node --test arpg/test/*.test.js`; `node arpg/test/browser-smoke.mjs` from the game repo. Smoke uses DOM/CDP values and network records, not screenshots.

## Framing regression

Manual `bone.location` edits alone do not survive Blender's render depsgraph evaluation: death root-motion F-curves are restored at render time. The bake now uses constant drivers for horizontal root/hips translation channels, preserving vertical motion. The envelope and the delivered sample share one evaluator, include outline hulls, use all clips and octants, and leave 13% camera padding (8% for the crown-bearing chief, to keep its smallest poses above 5% opaque coverage). Each job keeps one ground anchor and scale through all its animations. Delivery verification checks every WebP frame against the corresponding source alpha and independent arm-quaternion/skin-geometry pose evidence; it rejects clipped pixels, bind/T poses, empty/static clips and stale sheets.

## Integration contract

Only the equipped hero kit and spawned registered monsters load. Failure keeps existing procedural visuals. Atlas textures are shared; round reset destroys views before releasing previous kits. Rendering writes only view/animation state. Combat shapes, telegraphs and collision radii are unchanged. Chief is 1.3× with a raised eight-point crown and coral tint. `iron_boar` is still a procedural boar; Skeleton Minion is a viewer-only sample, never a boar replacement.

## Source license evidence

See `../../assets-ledger.md` and `goblin-license-evidence.json`. Exact Quaternius Goblin is from Cube World Kit / Poly Pizza model `OdCOFSmEhl`, not Ultimate Monsters. Independent download is byte-identical to the imported GLB. The individual model explicitly lists Public Domain (CC0); the generic current Quaternius site license instead lists QAL and is not used as CC0 proof. Original HTML evidence is archived in the offline `source/` directory.
