# Erika Archer — bow hunter

Official Mixamo Erika Archer, supplied without hand-held bow/arrow. User confirmed source/use rights and authorized bow-character integration on 2026-11-15. Original FBX remains private and is not distributed here. Original character geometry, skin, materials and all five embedded 2048×2048 textures are retained without tint, decimation, downscaling or recompression.

This is the supplied numerically corrected offline fourteen-clip retarget, copied byte-for-byte: SHA256 dcd3155b1716962eb30979091a12100e9c35af11170e63a715e78e9a5cec59ac. Existing bow animation names/durations and authoritative shot/release markers are unchanged. Recovery was authored before retargeting and must not be authored a second time on Erika. The runtime adapter applies only one zero-first toe-support presentation offset; it does not resolve clothing/body collisions or modify simulation coordinates.

Production bow/string/nocked arrow are the existing procedural geometry, not baked into this GLB. Socket position is measured per target from wrist→Middle1 midpoint in the actual cloned bind skeleton. Actual bone-local palm midpoints: Left [0.1375257075, 4.7693209648, 0.0362311751], Right [-0.0034586489, 4.7721428871, -0.0271026995]. Bone units are centimetres; socket children are metres. Socket orientation follows the actual palm-to-palm plane, with no universal actor-yaw patch or detached nock clamp.

Transfer: 23,702,900 raw bytes / 21,458,919 gzip estimate. Character: 20,526 triangles, 11,971 vertices across four skinned draws. Five 2048² RGBA images: 80 MiB decoded / approximately 106.67 MiB with mipmaps, excluding geometry, render targets and the temporary cached Paladin fallback. This exceeds the old 2.5 MB / 4k triangle soft budget; no physical-device memory/performance certification is claimed. Textures are page-cache-owned/shared between actor clones, while geometry/materials/skeleton/mixer are actor-owned.

One lazy cached Promise per page, first requested for a bow hunter or bow-selection preload. Existing procedural→Paladin bow remains usable during loading; failed Erika load retains that fallback. Every local/remote actor clones its own skeleton and mixer. Preview/hunt/removal disposal guards late completions and releases actor resources without disposing cached texture data.

CPU GLTFLoader/AnimationMixer/getVertexPosition tests use texture placeholders only. Numerical aim/contact, finite skin and frustum checks are not browser/GPU/pixel evidence, visual approval, a mobile performance signoff or a real-relay multiplayer test.
