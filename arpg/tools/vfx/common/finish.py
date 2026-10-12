#!/usr/bin/env python3
"""Package one completed native capture and connect it. Does not commit/push/install."""
import hashlib, json, re, shutil, sys
from pathlib import Path
root=Path(__file__).resolve().parents[3]
skill=sys.argv[1];folder=root/'tools/vfx'/skill
temp=Path('/mnt/c/Users/user/AppData/Local/Temp/arpg-fx2/bake')
config=json.loads((folder/'bake.json').read_text())
base=json.loads((root/'tools/vfx/fireball/provenance.json').read_text())
textures={}
for clip in config['clips']:
 recipe=json.loads((temp/'vfx/recipes'/(clip['id']+'.json')).read_text())
 (folder/(clip['id']+'.json')).write_text(json.dumps(recipe,indent=2)+'\n')
 def walk(layers):
  for layer in layers:
   for key in ['texture','alpha_texture','distortion_texture','blend_texture']:
    if layer.get(key):
     name=Path(layer[key].replace('\\','/')).name
     file=temp/'vfx/textures/processed'/name
     upstream=Path('/tmp/arpg-fx1-effekseer-vfx-skill/skills/effekseer-vfx/assets/examples/textures')/name
     example=upstream.is_file()
     digest=hashlib.sha256(file.read_bytes()).hexdigest()
     if example: assert digest==hashlib.sha256(upstream.read_bytes()).hexdigest(), name
     textures[name]={'name':name,'sha256':digest,'source':'MIT AI-generated upstream example texture' if example else 'MIT vfxkit procedural math texture (pinned generator)','sourceAtCommit':f'skills/effekseer-vfx/assets/examples/textures/{name}' if example else 'skills/effekseer-vfx/scripts/vfxkit/textures.py','matchesOriginal':True if example else None}

   walk(layer.get('children',[]))
 walk(recipe['layers'])
provenance={key:base[key] for key in ['skillRepository','commit','skillLicense','exampleTexturesLicense','effekseerVersion','effekseerLicense','pluginVersion','godotVersion']}
provenance.update(skill=skill,recipeAuthor='FX2 local authored recipe; upstream MIT primitives',textures=list(textures.values()),licenseEvidence='../fireball/licenses/',capture='Native Forward+ RGBA, transparent viewport; fixed-fps60; sample stride3',processing='128x80 resample + gameplay-support alpha mask; not vector/procedural replacement captures')
(folder/'provenance.json').write_text(json.dumps(provenance,indent=2)+'\n')
(folder/'README.md').write_text(f'''# FX2 {skill}\n\nLocal authored Effekseer recipe sources and compiled portable JSON; upstream pinned MIT primitives/textures, license evidence in ../fireball/licenses/. No runtime hotlinks or engine plugin.\n\nRebuild with existing installed tools only: common/render.ps1 -Config <absolute Windows path to bake.json>. The template is copied to the temp Lab, then sources are compiled, Godot reimports .efkefc, Forward+ captures transparent 256x160 RGBA at fixed60fps/stride3. Output paths in bake.json refer only to this task's temp workspace.\n\nPack from repo root: python3 arpg/tools/vfx/common/pack.py <frames> arpg/assets/vfx/{skill} arpg/tools/vfx/{skill}/bake.json arpg/tools/vfx/{skill}/atlas-validation.json <preview.gif>. Native frames resized128x80, alpha constrained to circle34 / cone68 at70deg / observed dash segment / narrow arrow. This is cropping native capture, not painting replacement frames.\n\nLazy on first non-reduced skill use. Vector windup cues, hit feedback and exact boundaries remain authoritative. Animation normalizes to existing presenter life, never simulation phases. Budget250KB; byte/decode/alpha/frame proofs in atlas-validation.json. Native raw files remain in task temp folder.\n''')
p=root/'js/render/skill-vfx.js';s=p.read_text();
if f"{skill}: '{skill}'" not in s: s=s.replace("ember_bolt: 'fireball'",f"{skill}: '{skill}', ember_bolt: 'fireball'",1)
p.write_text(s)
p=root/'assets-ledger.md';s=p.read_text();
if f'### FX2 {skill}\n' not in s: s+=f'\n### FX2 {skill}\n- Locally authored Effekseer→Godot transparent bake; pinned upstream MIT primitives/texture generator (not CC0/CC-BY). Source URL: {base["skillRepository"]}/tree/{base["commit"]}. Individual texture hashes/origin + source recipes: `tools/vfx/{skill}/provenance.json`; exact license texts: `tools/vfx/fireball/licenses/`.\n- Distribution: `assets/vfx/{skill}/atlas.webp` + `atlas.json`; no runtime hotlink. Native captures resized and alpha-support-masked to gameplay geometry. Per-skill byte/frame/decode proof: `tools/vfx/{skill}/atlas-validation.json`. No independent artist or physical-device certification claimed.\n';p.write_text(s)
print(skill)
