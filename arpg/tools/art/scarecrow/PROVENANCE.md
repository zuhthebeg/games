# Original scarecrow model

This model is original project-authored Blender geometry, authored 2026-10-28 by the project assistant for cocy.io. No downloaded model, texture, paid generator or commercial-game asset is used. `generate.py` fully reconstructs geometry, material nodes, rigid skin weights, five actions, editable `.blend` and exported GLB using installed Blender 5.2.2. Utility mesh/rig helpers are reused from this repository’s original `golem-crystal/generate.py`; no guardian geometry is reused.

Design: planted single wooden stake and rear crossbar, ochre burlap sack with X-eye and mouth stitching, worn brown felt hat, moss cloth tunic, chest/rear patches, hemp waist bindings and individual exposed straw strands. Small independent sleeve/head/body motion preserves a stationary practice dummy rather than substituting another monster. No feet, weapon or detached equipment. Front is -Y; all octants are rendered from actual 3D geometry.

All newly authored geometry, actions, material definitions and derived images are dedicated to the public domain under CC0 1.0: https://creativecommons.org/publicdomain/zero/1.0/ . This is an original-work dedication, NOT a claim of an external asset’s license.

Offline archive (not web-delivered): `C:/Users/user/ai-tools/arpg-art/scarecrow/` contains source/scarecrow-original.blend, source/scarecrow.glb, source/scarecrow-baked.blend, frames/scarecrow/*.png, atlases/ and contact-sheet.png. Repository contains complete reproducible authoring source and config; game receives only WebP and Pixi metadata.

Reproduce: copy generate.py/config.json into archive pipeline/, shared ../bake.py into archive bake.py. Run Windows Blender `-b --factory-startup --python <archive>/pipeline/generate.py -- <archive>/pipeline/config.json`, then shared bake with the same config (`--preview` first, omitted for production). Pack using `python3 arpg/tools/art/pack.py arpg/tools/art/scarecrow/config.json --repo "$PWD" --merge-manifest`.

No simulation/content/stats/placement/timing changes are authorized. All state selection and attack sampling use existing runtime logic; procedural fallback is retained. Visual review is an assistant’s offline inspection, not user approval or deployment evidence.
