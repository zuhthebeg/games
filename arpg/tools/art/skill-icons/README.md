# U4 original ten illustrated abilities

Public web UI, SFW objects/magic. No remote generation, paid API, hotlink or downloaded stock image. Windows-native existing diffusion-win Python, local RTX 3080 Ti, cached LuminarQMix v7 SDXL snapshot `0640e5837d88a339cfb3d9a9ac2715c93a54c036`. Model origin: https://huggingface.co/John6666/luminarqmix-v7-noobaixl-illustriousxl-anime-style-merge-model-v70-base-with-out-lora-sdxl . This records provenance, not a CC0/exclusive-copyright assertion for AI outputs. Model license/terms remain with the upstream model publisher.

## Replay
1. Copy `generate-windows.py` and `prompts.json` together to a Windows directory. Run using `C:/Users/user/ai-tools/diffusion-win/Scripts/python.exe generate-windows.py`. Requires the existing local cached model and `generate-image-win.py`; offline environment flags prevent downloads.
2. `python3 arpg/tools/art/skill-icons/pack.py [raw-png-directory]` uses existing Pillow, LANCZOS 768→256, WebP quality65/method6. Raw sources + offline contact sheet: `C:/Users/user/ai-tools/arpg-art/skill-icons-1028/`. No raw PNG in runtime assets.
3. `node --test arpg/test/skill-art.test.js`; `node arpg/test/skill-art.native.mjs` (existing local Playwright/Chromium). Browser script uses isolated saved fixture and ordinary UI; no screenshots.

Prompts include subject/action, style, background, platform, safety and 768px square resolution. Final seeds102900,103001,102902,102903,103104,102905,102906,102907,102908,103009, Euler Ancestral,30steps,guidance7; environment/package versions may affect bit reproducibility. Exact PNG/WebP hashes and sizes are recorded in provenance.json. Existing helper SHA256: `269f5999952d09f40a9b59271d7f2f931addd8ecd82a056da57bdb99245dff6d`.

Initial batch seeds102800–102809 was rejected after offline review (spurious warrior/bird, decorative borders, weak action semantics); retained under offline `rejected-v1/`, never accepted as final art. A missing documented model directory failed before generation; verified cached snapshot resolved it. Logs are retained in workspace `tmp/arpg-u4-logs/`.

UI preserves faculty frames, names and existing unique SVGs. One capturing load/error listener pair plus decode promise ensures HTTP/invalid-byte/decode-rejection fallback; unregistered skills do not request art. SVG remains visible until successful decode, then the opaque illustration overlays it without changing layout or input targets. No gameplay/save/content/network edits.

Offline review: final contact sheet inspected directly (not browser screenshot). Ten distinct bright fantasy illustrations, no text/logo/people/hands. Blade thrust, spinning cyan blade, grounded cleave impact, multi-arrow volley, bow/steel piercing arrow, explosive arrow, round firebolt, sharp ice lance, empty-center flame ring, luminous healing leaf. These are stylized ability cues, not exact simulation diagrams; volley depicts two shafts rather than enforcing a three-arrow visual count. Rejected whirl/person and piercing/insect-like candidate were not retained in delivery.
