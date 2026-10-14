# M2b preflight — BLOCKED, not delivered

Baseline `0c64a94f2a11420309c2ceaa03bfa0180d42cae8`, fresh `origin/main` worktree `arpg-m2b`. Existing main dirty `.gitignore`, `package.json`, `wrangler.jsonc` untouched.

## Stop gate

`arpg/js/render/atlas-visual.js` registers factories by `Object.keys(ATLAS_IDS)` from `atlas-state.js`. `atlas-library.js` also resolves each content key through `ATLAS_IDS[key]` before finding a manifest entry. None of `demon`, `goleling`, `slime` is mapped. Manifest `content_ids` cannot register them. Real host entities will remain procedural without a renderer mapping change. The task explicitly forbids renderer edits and requires stopping if one is necessary. No alias to an old species, temporary renderer patch or testing-only production mutation was performed.

Parent must authorize/own a separate mapping change before this scope can deliver the requested native real-entity atlas loading proof. Do not treat this checkpoint as M2b complete or hunt-ready. No content, manifest, runtime, old art, stage, loot, sim/net, HUD, index or stamp changes.

## Provisional sources (not visual-quality approval)

All three individual pages state CC0, authored by Quaternius; full CC0 legal text and individual HTML/GLB hashes are recorded in `license-evidence.json` and the three `*-page-license.txt` files. Original HTML/GLB files are retained at `C:/Users/user/ai-tools/arpg-art/m2b/source`. No generic Quaternius license inference.

- Demon: https://poly.pizza/m/LnfIziKv4o . Two skinned meshes, native Idle/Run/Weapon or Punch/HitReact/Death. A retained trident belongs to the source skin. Import inventory is not proof of final grip, facing, ground or pose quality.
- Goleling: https://poly.pizza/m/71gomWolax . Winged monster, one skinned mesh, native Flying_Idle/Fast_Flying/Headbutt/HitReact/Death. Source has eight wing bones; its bat-like anatomy and silhouette require actual comparison against existing bat before acceptance. Earlier provisional “floating rock monster” description is not a visual approval.
- Green Blob: https://poly.pizza/m/y4kJh8EeYS . Two skinned meshes, native Idle/Walk/Bite_Front/HitRecieve/Death. Four-bone deformable body, not a generated primitive replacement. Eye/front direction and squish motion need actual baked verification.

Mimic https://poly.pizza/m/B8HrWzkuNp was rejected: original GLB has no skin/animation. Its untouched original remains in the offline candidate folder, not a runtime asset.

## Executed reproduction

```sh
# Existing Windows Blender; no node, install, environment or configuration changes.
'/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe' --version
cp arpg/tools/art/m2b/inspect-source.py /mnt/c/Users/user/ai-tools/arpg-art/m2b/inspect-source.py
'/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe' -b --factory-startup --python 'C:/Users/user/ai-tools/arpg-art/m2b/inspect-source.py' -- 'C:/Users/user/ai-tools/arpg-art/m2b/source'
node arpg/tools/art/m2b/verify-preflight.mjs
cd arpg && node --test --test-reporter=tap test/*.test.js
```

Download exact URLs from `license-evidence.json` with `curl -L --fail --max-time 40 -s -A 'Mozilla/5.0' URL -o PATH`; inspect glTF magic, preserve originals. Bare urllib got HTTP403; ordinary curl successfully returned the public pages and static files without login, credentials or access changes. Existing Windows Blender directly returned 5.2.2 LTS and imported all three originals successfully despite disconnected paired node. `inventory.json` is read-only rig inventory, not reopened-baked geometry proof.

## Undelivered checks

No baked `.blend`, frame atlas, contact sheet, gameplay-size sprite or animation phase preview was created after the stop gate. Requested external preview folder exists at `/home/cocy/.openclaw/workspace/tmp/arpg-m2b-preview/` with a status file only. Source `.blend` has not been generated; original GLBs are preserved.

Actual GPU atlas memory per species is **N/A (not generated)**. The required calculation after bake/pack is `sum(sheet_width * sheet_height * 4) / 1048576 MiB`, including blank sheet cells, not compressed WebP byte counts; target <=16 MiB, hard maximum <=20 MiB per species. Do not claim 0 MiB as a completed kit or compression as a mobile GPU measurement.

No new-species desktop/mobile native atlas loading, clip silhouettes, alpha/anchor/foot-ground/grip validation, or physical-device verification is claimed. Existing runtime remains unchanged; source selection and Blender inventory alone are not art approval. No placement/drop/economy changes, no push/deploy, no childspawn/Codex.
