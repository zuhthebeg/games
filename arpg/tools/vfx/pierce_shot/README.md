# FX2 pierce_shot

Local authored Effekseer recipe sources and compiled portable JSON; upstream pinned MIT primitives/textures, license evidence in ../fireball/licenses/. No runtime hotlinks or engine plugin.

Rebuild with existing installed tools only: common/render.ps1 -Config <absolute Windows path to bake.json>. The template is copied to the temp Lab, then sources are compiled, Godot reimports .efkefc, Forward+ captures transparent 256x160 RGBA at fixed60fps/stride3. Output paths in bake.json refer only to this task's temp workspace.

Pack from repo root: python3 arpg/tools/vfx/common/pack.py <frames> arpg/assets/vfx/pierce_shot arpg/tools/vfx/pierce_shot/bake.json arpg/tools/vfx/pierce_shot/atlas-validation.json <preview.gif>. Native frames resized128x80, alpha constrained to circle34 / cone68 at70deg / observed dash segment / narrow arrow. This is cropping native capture, not painting replacement frames.

Lazy on first non-reduced skill use. Vector windup cues, hit feedback and exact boundaries remain authoritative. Animation normalizes to existing presenter life, never simulation phases. Budget250KB; byte/decode/alpha/frame proofs in atlas-validation.json. Native raw files remain in task temp folder.
