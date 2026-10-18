# World map region artwork

Nine original AI-generated landscape environment illustrations for the existing
region IDs in `arpg/js/content/world-map.js`. These are actual generated images,
not CSS substitutes or UI screenshots.

## Production

- Target: public in-game web region cards, app-safe empty scenery.
- Local model: LuminarQMix v7 SDXL, cached snapshot
  `0640e5837d88a339cfb3d9a9ac2715c93a54c036`.
- Execution: Windows-native `diffusion-win` Python, RTX 3080 Ti, offline
  Hugging Face and Transformers; no API, download, LoRA, or reference image.
- One serial GPU process, model loaded once. Text-to-image 1024 × 512,
  Euler ancestral scheduler, 30 steps, CFG 7, fp16 and CPU offload.
- Output: RGB, Lanczos resize to 768 × 384,
  Pillow WebP quality 82 / method 6. Cemetery and swamp have documented
  2:1 focal crops to remove generated white corners / black letterboxing.
- The exact positive/negative prompts, seeds, source PNG hashes, helper/script
  hashes, model component hashes and output hashes are in `manifest.json`.
  The model fingerprint is the SHA-256 of the canonical `modelFiles` array.
- CLIP's normal 77-token cap applies: long trailing prompt style/negative terms
  can be truncated by the installed pipeline. Subject and main style are first;
  the manifest preserves the exact strings passed to that pipeline.

The generated source PNGs remain outside the repository at
`C:\Users\user\ai-tools\outputs\arpg-world-map-20261018\`.
The batch command is recorded in the manifest. The script uses the established
`generate-image-win.py` helper's `build_pipe`, local model path, and independent
CUDA generators per seed; the helper is not modified.

## Region direction

| File | Region | Environment / palette |
| --- | --- | --- |
| outskirts.webp | 마을 외곽 | Abandoned village gate, farms, muted ochre |
| forest.webp | 속삭이는 숲 | Ancient trees, moss path, emerald green |
| pass.webp | 잿빛 고개 | Ash cliffs and ruined watchtower, grey / amber |
| mine.webp | 녹슨 광산 | Timber mine entrance, rails and lantern, copper |
| swamp.webp | 늑대 언덕·늪 | Willow marsh and distant hills, olive fog |
| throne.webp | 왕좌 앞뜰 | Obsidian dragon throne courtyard, embers |
| graveyard.webp | 버려진 묘지 | Crooked tombstones and mausoleum, moon fog |
| necropolis.webp | 망자의 지하묘역 | Vaulted burial crypt, violet cold lanterns |
| castle.webp | 무너진 성채 | Broken fortress and frozen altar, frost blue |

Integration, UI, cache stamps and deployment are owned by the parent task.

## Visual review

All nine final landscapes were reviewed as a contact sheet; swamp and cemetery
were also checked individually. No text, character, UI, watermark, or outer
frame remains. The shared treatment is stylized hand-painted fantasy, not
photorealism. Forest and throne are deliberately more saturated than the
muted marsh / mountain pass. First mine and swamp attempts were rejected for
subject mismatch, then regenerated once each. The final mining rails / dark
shaft and willow / marsh subjects are visibly distinct. No other regeneration.
