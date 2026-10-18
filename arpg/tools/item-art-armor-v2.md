# Armor inventory illustrations v2

Target: in-game web ARPG icons, readable at 44–64 CSS pixels. Presentation only: no stats, equipment rules, item definitions or rarity semantics changed.

Five actual new Windows-native LuminarQMix SDXL images are delivered as versioned 256px WebP (31,914 bytes total), on intentional charcoal tiles. The original shared manifest and all legacy images stay unchanged. `assets/items/armor-v2-manifest.json` extends provenance with model snapshot/index/helper hashes, full prompts/negatives, seeds, source hashes/paths, image dimensions, selected image-to-image references, output hashes and packing method.

## Actual generation and selection

Nominal `ai-tools/models/luminarqmix-v7` is absent; the existing offline cache snapshot `0640e5837d88a339cfb3d9a9ac2715c93a54c036` was used, matching the inn pipeline. No downloads, installs, paid API or WSL diffusion GPU.

13 model candidates over three bounded passes: first five rejected (characters/lantern instead of objects); second pass selected leather boots and steel helmet, rejected elongated greaves, hood creature and barrel; final three composition-guided model outputs selected. Guides are not delivered as final artwork: armored boots use the new second-pass leather boots as a reference, light hood uses the retained legacy hood silhouette as a reference, shield uses an explicit broad wood/rim/boss composition guide. SDXL image-to-image strength 0.68, 30 requested steps (20 effective denoising steps), fixed seeds. Source model pixels were background-matted, not painted over.

Raw sources and generation JSON remain outside served repository:

- `C:\Users\user\ai-tools\outputs\arpg-armor-v2-20261018` (five rejected first-pass sources)
- `C:\Users\user\ai-tools\outputs\arpg-armor-v2-20261018-pass2` (five second-pass sources; selected feet/head)
- `C:\Users\user\ai-tools\outputs\arpg-armor-v2-20261018-pass3` (three selected corrections)
- `C:\Users\user\ai-tools\outputs\arpg-armor-v2-guides` (three composition references, hashes in manifest)

The checked-in generator defaults to the final three guided corrections; `--text-pass` reproduces pass two. It requires these existing local references and the existing Windows diffusion-win environment. Output-exists guards prevent silently overwriting source artifacts.

## Verification and replay

```sh
node --test arpg/tools/item-art-armor-v2.test.mjs
node arpg/tools/item-art-armor-v2.native.mjs
ARPG_BASE_URL=https://game.cocy.io ARPG_ARMOR_EVIDENCE=/absolute/report.json node arpg/tools/item-art-armor-v2.native.mjs
```

116 current head/feet/shield item IDs covered, including common/fine/rare/epic and bone/boar set pieces. Slot/class fallback also covers subsequently added set definitions. Leather caps use light hood, heavy feet use armored boots; unknown offhand forms keep SVG. Native fresh-context PC1280 and touch390 replay checks bag-to-gear picker, inventory, shield detail, crafting, decode, unchanged grade labels, no horizontal overflow and actual image-failure SVG fallback. No browser screenshots, private profile reads or runtime world edits.

Legacy `arpg/test/item-art.test.js` has an existing all-ID coverage failure for `undead_bone`; baseline also has four uncovered shields, now fixed. Its old active-file-list oracle assumes the original manifest only and is stale for this extension. Nonrequested material art remains unchanged.

Final delivered-WebP contact: `/home/cocy/.openclaw/workspace/tmp/arpg-armor-v2-delivered-contact.png`. Private offline source review contact: `/home/cocy/.openclaw/workspace/tmp/arpg-armor-v2-contact.png` (184px and actual 44/64px). Local native evidence: `/home/cocy/.openclaw/workspace/tmp/arpg-armor-v2-native.json`. Parent owns independent review, cache stamp, integration, deployment and production replay.
