# Original mine cart hoist — MP1

Original project-authored Blender geometry and rigid animation, authored 2026-10-28 by the project assistant for cocy.io. No downloaded meshes, textures, paid services or third-party asset source. New model, motion and derived frames dedicated to CC0 1.0: https://creativecommons.org/publicdomain/zero/1.0/ . This is an original-work dedication, not a borrowed-model license claim.

Timber four-post hoist, diagonal knee braces, iron winding drum/flanges, two taut hemp ropes, guided plank platform and ore-loaded wooden cart. Ground track and sleepers remain stationary. Platform and cart rise 1.4 model units and lower on an eased 8-second cycle; rope endpoints follow the platform. 32 frames at 4 fps, 17 unique symmetric poses. No player interaction or collision. Reduced motion holds frame 0.

Complete reproducible source: generate.py and pack.py. Existing shared monster bake.py informed transparent EEVEE, Standard color, warm key/cool rim lighting, faceted material approach. Dedicated fixed-camera scenery bake avoids imposing creature armatures, octants and gameplay animation clips onto a rigid hoist. No shared pipeline changes.

Installed Windows Blender 5.2.2 LTS, Pillow already installed. No dependencies installed. Reproduce:
1. Windows Blender -b --factory-startup --python generate.py -- C:/Users/user/ai-tools/arpg-art/mine-lift/source
2. python3 arpg/tools/art/mine-lift/pack.py /mnt/c/Users/user/ai-tools/arpg-art/mine-lift/source arpg/assets/sprites/scenery/mine-lift

Editable original .blend, all lossless source PNG frames and contact sheet are archived offline at C:/Users/user/ai-tools/arpg-art/mine-lift/source/. Browser receives only lift.webp. Frame 192x192; atlas 1536x768; decoded RGBA 4.5 MiB; wire 88,484 bytes. Ground anchor (.5,.92), world (400,185), immutable for this map only. Full quad ends at y200.36, away from the center lane, quest entry (252,430), ledger (1092,258) and all spawn circles. Draw layer lies between ground and all skill/quest/danger/entity layers.

Offline contact sheet reviewed with view_image: recognisable timber mechanism and ore cart; cart/platform rise together, ropes stay taut, rail base fixed, no SVG wireframe. This is an assistant local visual inspection, not user aesthetic approval, deployment or physical-device validation.
