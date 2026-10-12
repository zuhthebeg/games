# Original copper dragon

Original procedural Blender geometry/animations authored by Sol for cocy, 2026-10-12. No downloaded meshes, textures, armatures, model reskin, paid APIs or external asset licenses. Project-authored source and output follow repository licensing (no invented third-party CC0 claim).

Four grounded articulated legs (12 claws), horizontal torso, arched plated neck, long reptilian snout with swept horns, curved tapering tail, dorsal spines and two scalloped membranes with distinct finger rays. Object-keyed idle breathing, run, attack, hit and death; no imported rig. Actual training sample only idles/recoils and remains nonattacking/invulnerable: simulation and render JS untouched.

## Rebuild

1. Copy `generate.py` and `config.json` to `C:/Users/user/ai-tools/arpg-art/original-dragon/`.
2. Run Windows Blender 5.2 `--background --factory-startup --python C:/Users/user/ai-tools/arpg-art/original-dragon/generate.py -- C:/Users/user/ai-tools/arpg-art/original-dragon/config.json` (`--preview` renders 8 idle directions; never pack preview).
3. From repository run `python3 arpg/tools/art/original-dragon/pack.py arpg/tools/art/original-dragon/config.json --repo "$PWD" --merge-manifest`.
4. Run Windows Blender with `verify-source.py` and the same config to validate the saved source keyframes and four stationary grounded idle paws.
5. Run `python3 arpg/tools/art/original-dragon/verify.py`, `node --test arpg/test/*.test.js`, and `node arpg/test/d0-dragon-browser-smoke.mjs`.

Source `.blend`, RGBA reference frames and archived PNG sheets live outside web root in the NEW original-dragon directory. Compatible pack API keeps clip/direction together and uses <2048px WebP sheets, 256px frames. Fixed camera is fitted across every sampled animation and direction, with one world-ground projected anchor. Historical d0-dragon source/tools are not rewritten. `validation.json` is this original object-keyed geometry's evidence; historical d0 skinned-rig validator is intentionally not used because those assertions describe a different imported model.
