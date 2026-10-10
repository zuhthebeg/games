# P5-B character parts — provenance and scope

B, not A/full wardrobe. Fixed **clothed, uncut KayKit Knight** body/arms/legs/cape;
body/hands/feet change via material-region tint, not independent silhouettes.

## Sources and licence
- Kay Lousberg, KayKit Adventurers, CC0 1.0. Official source:
  https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0
- Licence snapshot: `../../tools/art/p5b/LICENSE-KayKit.txt`.
  SHA256 `ae322141814056dda0deea7540d74c41d87aee1da319977cd1bd84ee5a923629`.
- Official GLB byte hashes / prior live-vs-local comparison:
  `../../tools/art/p5b/model-origin-verification.json`.
  Knight `60428e3abc09ba83e595d256e3af8c5c976b46cdae599f0802fc82b4a3445168`;
  Barbarian `cefc311a0e10c7858b6141f5ada7e33268727564fb8ac1347aab97d000669cc6`;
  Mage `cf898585da33fab50c724d31605fb931eb2912e6d2280092141e98ca81ad507d`.
- Heads: original Knight helmet, Barbarian hat, Mage hat, or no equipment.
  Imported onto the original 41-joint Knight rig; rest-matrix mismatch <1e-4.
- Sword: original KayKit 1H Sword. Maul: new original cuboid shaft/head in the
  sword's grip space. Bow/staff: original local procedural bake geometry;
  compact bow/wand are local-Z-shortened mesh variants, not scaled 2D sprites.
  New procedural maul derivative geometry is dedicated to CC0 by this project.
- No newly purchased assets, Quaternius or Kenney models. No raw GLBs/blends
  redistributed in this branch; offline sources remain under the existing Windows source folder.

## Derivation
- Windows Blender 5.2.2, original baked scenes and in-place animation drivers.
- 128px, 10fps, original six clips, eight directions. One camera: orthographic
  5.277437210083008, anchor (0.5, 0.6202935874462128), pitch 40 degrees.
- AA1 crisp edges. Head holdout against body; weapon holdout against body and
  the selected head. No guessed global direction z-order.
- Occasional AA1 depth ties are reconciled against actual full 3D reference
  renders, with a hard guard of at most 4 differing pixels per raw frame.
  Raw discrepancy counts and corrected counts are retained in `validation.json`.
  This is **not** a claim that the initial full raw holdout pass was exact.
- Source-frame exact dedup, alpha trim, 1px atlas gutter. WebP quality70 colour,
  lossless alpha, fully lossless RGB region masks. Corrected uncompressed layer
  composition equals reference premultiplied RGBA; delivered WebP colour is
  lossy, and its colour residual is measured, not described as pixel-exact RGB.
- Skin/outline are excluded from body-region tint. Hand/foot regions use polygon
  mean bone weights without cutting meshes or introducing glove/boot seams.

## Runtime contract / limitations
- Two geometries per weapon kit (six total) plus base-item palettes. Other swords
  (including cleaver) reuse the sword mesh, not a unique model per item.
- Head shape follows light/medium/heavy class (three shapes), not every item ID.
- One selected kit/head/weapon set is fetched; body+RGB mask are shared within kit.
  No palette variant downloads. Serial composition; decode bitmaps closed after use.
- At most two output canvases/texture sets live during swaps; reference-counted
  portrait/combat sharing, superseded-request guard, eviction without destroying
  live sprites. Source textures are not retained. Query `?paperdoll=0` restores
  original hero sprites. Missing B files also fall back to original art.
- Runtime still renders one body Sprite (+ the pre-existing hit flash). No sim,
  economy, item stats, collision, difficulty or UI stylesheet changes.
- Crisp-AA1 look and shared camera differ from the original smooth AA16 and
  smaller bow/focus camera. Numerical/DOM checks are not a human art approval.
- Desktop Chromium mobile viewports and 6x CPU throttle are **not real phone
  performance/memory/GPU/thermal evidence**. Production integration/deployment
  and actual phone review belong to the parent.

## Evidence (filled by full validation run)
- Delivered sources and frame manifests: `../sprites/paperdoll/`.
- All-source hashes, bytes, full-animation/depth/crop gate:
  `../sprites/paperdoll/validation.json`.
- Independent actual Blender skin/bone pose gate (1,168 frames):
  `../../tools/art/p5b/pose-validation.json`.
- Browser combat/portrait/144-clip, lazy/fallback/cache and approximation metrics:
  `../../tools/art/p5b/browser-validation.json` (after browser test).
- Offline raw/reference PNGs and corrected boundary evidence:
  `C:/Users/user/ai-tools/arpg-art/p5b/`.
