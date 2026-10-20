# Equipped shield attachment

The equipped offhand is not the protective_shield buff (static oval barrier and charge pips).
The four `round_shield` rarity variants currently share `shield-armor-v2.webp`: pointed wooden face, gold rim and single central boss. The world model follows that actual artwork rather than the historical round item name. No rarity/authority/network changes are needed.

The old model used overlapping, offset ellipses, an independent age-based bob, continuously rotating trigonometric offsets despite the sprite's eight snapped facings, and a 27px bash reach. It also inserted its layers by child index into a lazy atlas container, whose replacement could move the body on top of rear equipment.

`shield-hand-anchors.js` stores pawn-local projected `handslot.l.tail` per delivered animation frame. Export from original source scenes/cameras and original bake records, never from inferred screen-space orbit offsets. The exporter resets sparse pose channels for each sample and does not render or modify source scenes. It covers human blade/wand paperdolls, their atlas fallback cameras, and the skeleton kit. Socket data is before sprite/entity size scaling. The shield wrapper has stable rear/body/front siblings and forwards sockets through weapon enhancement wrappers. Geometry redraws only when orientation or block state changes; runtime pose objects are reused.

Reproduction (Windows Blender, existing local art sources):

```text
blender.exe -b --python arpg/tools/art/export-shield-anchors.py -- --art-root C:/Users/user/ai-tools/arpg-art --output arpg/js/render/shield-hand-anchors.js
```

Verification:

```text
node --test arpg/test/shield-attachment.test.js arpg/test/shield-render.test.js
node arpg/test/shield-model.native.mjs
```

The native harness installs a valid synthetic save before boot in a fresh browser context, then uses real keyboard/CDP touch and read-only `__arpg.art` diagnostics. `ARPG_BASE_URL=https://game.cocy.io` checks production without world writes, live saves, or screenshots.
