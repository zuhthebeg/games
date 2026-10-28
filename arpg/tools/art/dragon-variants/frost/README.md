# Frost dragon — unregistered art preparation

Original copper derivative: ice-blue scales, ice-white plates, 18 real faceted ice crystals (six crown, six dorsal, six wing-edge). Original four legs, neck, tail, two membrane wings and object-keyed animation retained. No external asset, texture, paid API or third-party license claim.

Design: preserve reptilian western dragon proportions; distinguish the crown, spine and wing silhouette, not a runtime tint or aura. Static front/side/back preview inspected offline before full bake. Parent/user final look approval remains pending.

## Rebuild
Keep repository directory layout. Copy original-dragon/generate.py and dragon-variants/frost/{generate.py,config.json} to Windows authoring folder with the same relative layout. Use installed Blender 5.2.2:

    blender.exe --background --factory-startup --python dragon-variants/frost/generate.py -- dragon-variants/frost/config.json

Add --preview first for eight idle directions; never pack preview. Config exposes palette, geometry parameters, output/source paths and counts. From repository:

    python3 arpg/tools/art/dragon-variants/frost/pack.py arpg/tools/art/dragon-variants/frost/config.json --repo "$PWD"
    python3 arpg/tools/art/dragon-variants/frost/test_art.py

The dedicated packer derives from original-dragon/pack.py and NEVER writes shared manifest. PNG frames, .blend with original object keys and all-state native contact sheet remain outside web root at C:/Users/user/ai-tools/arpg-art/frost-dragon-1028/. Editable generator is checked in; binary source is reproducible externally.

128px is frame size, not occupied character height or gameplay display scale. Preview is native128 and enlarged2x, not a game screenshot. Fixed global camera and projected ground anchor are fitted across all animation samples. No per-frame centering.

Art preparation only; no frost breath code, encounter, content/runtime registration, manifest/index/stamp changes or deployment. Parent review, later patterns and placement remain separate. Original stylized low-poly anatomy and inherited poses remain limitations, not a full redesign.
