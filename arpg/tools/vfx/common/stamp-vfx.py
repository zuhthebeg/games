#!/usr/bin/env python3
"""Refresh cache revision after native pack; then run the repo's stamp-assets.mjs."""
import hashlib,json,re
from pathlib import Path
root=Path(__file__).resolve().parents[3]
proofs={p.parent.name:json.loads(p.read_text())['sha256'] for p in (root/'tools/vfx').glob('*/atlas-validation.json')}
revision=hashlib.sha256(json.dumps(proofs,sort_keys=True).encode()).hexdigest()[:12]
p=root/'js/render/skill-vfx.js';s=p.read_text();updated,n=re.subn(r"const VFX_REVISION = '[0-9a-f]+';",f"const VFX_REVISION = '{revision}';",s)
assert n==1,n
p.write_text(updated);print(revision)
