# Venom dragon — unregistered art preparation

broad neck frill and fan tail. Original four legs, two membrane wings, neck, tail, poses and object-keyed rig preserved. Real mesh ornaments, not runtime tint. No external asset, texture, paid API or third-party license claim. Project-authored source/output follows repository licensing.

Design: emerald body, pale green membranes/frills, purple ribs; broad neck fans and fan-tail ornaments. Native128 and enlarged static source preview reviewed before full bake; parent/user look approval pending.

## Rebuild
Keep repository directory layout. Copy original-dragon/generate.py and dragon-variants/venom/{generate.py,config.json} to Windows authoring folder with the same relative layout. Use installed Blender 5.2.2:

    blender.exe --background --factory-startup --python dragon-variants/venom/generate.py -- dragon-variants/venom/config.json

Add --preview first for eight idle directions; never pack preview. Config exposes palette, ornament scale, output/source paths and counts. From repository:

    python3 arpg/tools/art/dragon-variants/venom/pack.py arpg/tools/art/dragon-variants/venom/config.json --repo "$PWD"
    python3 arpg/tools/art/dragon-variants/venom/test_art.py

The dedicated packer derives from original-dragon/pack.py and NEVER writes shared manifest. PNG frames, .blend with original object keys and all-state native contact sheet remain outside web root at C:/Users/user/ai-tools/arpg-art/venom-dragon-1028/. Editable generator is checked in; binary source is reproducible externally.

128px is frame size, not occupied character height or gameplay display scale. Preview is native128 and enlarged2x, not a game screenshot. Fixed global camera and projected ground anchor are fitted across all animation samples. No per-frame centering.

Art preparation only; no elemental effect code, encounter, content/runtime registration, manifest/index/stamp changes or deployment. Parent review, later patterns and placement remain separate. Original stylized low-poly anatomy and inherited poses remain limitations, not a full redesign.

## Review and limitations
Static S/E/N/NW source views at native128 and 2x inspected offline before full bake: wing membrane structure, four-legged stance, neck/tail and distinct palette visible. Ember has a compact dark crest/dorsal plate strip and curled charcoal horns; venom has pale neck fans and a broadened fan-tail tip. Low-poly detail is small at native128; front-view ornaments partly overlap the neck, and inherited wing spread dominates silhouette. No browser/gameplay screenshot, user aesthetic acceptance or live placement is claimed. ornament_scale=1.0 is the baked geometry default; palette and ornament scale are configurable.

Full 5-state x 8-direction native contact sheet inspected offline after bake: coherent palettes, tail/wing silhouettes retained; no visible clipping, detached ornaments or cropped paws. Death is the inherited roll/collapse sample, not new gameplay behavior.
