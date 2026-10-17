"""Run unchanged production verifier against the two REAL delivery directories.
A bounded symlink fixture excludes unrelated legacy paperdoll depth PNGs, which
pre-exist in assets/sprites/player-skeleton-equipment and trip the global gate.
No pixels or metadata are re-created, modified or substituted by this wrapper.
"""
import argparse,json,subprocess,tempfile
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--repo',type=Path,default=Path(__file__).resolve().parents[4]);args=p.parse_args()
base=args.repo/'arpg/assets/sprites';offline=Path('/mnt/c/Users/user/ai-tools/arpg-art/golem-crystal')
manifest=json.loads((base/'manifest.json').read_text());selected=[r for r in manifest if r['id'] in ('rune-guardian','spirit')];assert len(selected)==2
with tempfile.TemporaryDirectory(prefix='golem-crystal-delivery-') as temp:
    fixture=Path(temp);(fixture/'manifest.json').write_text(json.dumps(selected))
    for r in selected:(fixture/r['id']).symlink_to((base/r['id']).resolve(),target_is_directory=True)
    subprocess.run(['python3',str(args.repo/'arpg/tools/art/verify_atlases.py'),'--base',str(fixture),'--frames',str(offline/'frames'),'--report',str(offline/'delivered-validation.json')],check=True)
