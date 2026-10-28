"""Run the unchanged shared pixel/alpha/pose verifier for this kit only.
Avoid unrelated legacy paperdoll PNGs in the global no-PNG sweep; no kit gate is weakened.
"""
import json, runpy
from pathlib import Path
root=Path(__file__).resolve().parents[4]
base=root/'arpg/assets/sprites'
entry=next(e for e in json.loads((base/'manifest.json').read_text()) if e['id']=='scarecrow')
verify=runpy.run_path(str(root/'arpg/tools/art/verify_atlases.py'))['verify_character']
result=verify(base,Path('/mnt/c/Users/user/ai-tools/arpg-art/scarecrow/frames'),entry)
Path(__file__).with_name('delivered-validation.json').write_text(json.dumps(result,indent=2))
print(json.dumps(result))
