# Death Knight gravitas — art candidate, NOT deployed

## Actual pipeline
Production Pixi 8.22 uses baked RGBA sprites, not live Three/Blender rigs. Existing offline source is C:/Users/user/ai-tools/arpg-art/player-death-knight/source/player-death-knight-source.blend. CC0 KayKit Skeleton_Warrior anatomical body, 41-joint skeleton and original actions are credited by the existing license. Original project-authored armor/visor/blade is procedural weapon.py. This revision reimports the same untouched GLB into an independent offline root C:/Users/user/ai-tools/arpg-art/deathknight-gravitas. No commercial assets are reused.

## Primary references actually inspected
- Official LineageM **변신 시스템**, https://lineagem.plaync.com/guidebook/view?title=%EB%B3%80%EC%8B%A0%20%EC%8B%9C%EC%8A%A4%ED%85%9C ; public guide data https://lineagem.plaync.com/api/v2/lineagem/guide/%EB%B3%80%EC%8B%A0%20%EC%8B%9C%EC%8A%A4%ED%85%9C?gwLocale=ko_KR . Inspected Death Knight, true Death Knight, fire/gold, black/hell/hate/fire variants. Actual thumbnails are static JPEGs, not animation clips. No claim of frame-by-frame official motion analysis.
- Official Death Knight thumbnail attached to the guide's exact 데스나이트 table cell: https://imgfiles-cdn.plaync.com/file/LineageM/download/20220107202148-sXSXP3VweISRvhoeTSls0-v4 . Read as a relatively small skull, broad shoulder silhouette, adult armored legs, firm separated stance, restrained dark metal with luminous accents.
- Official **기사도**, https://lineagem.plaync.com/update/2020/201111_teaser . Inspected class panels in official CSS, including armored male knight and dark-knight plate, not confused with a Death Knight clip. Reference only; outfit/silhouette was not traced.
- Official REQUIEM page was inspected and rejected as a DK-specific motion source: it concerns the reaper class. Do not call this DK reference.

No official downloadable DK motion clip was established. Motion principles below are independently authored interpretation, not copied rig/motion. NC reference images remain inspection-only outside repo and game delivery.

## Original implementation decisions
- Head local pose proportions reduced; torso and legs extended separately, not whole-character sprite resize. Anatomical source vertices remain intact, hidden old skull avoids protruding through new visor.
- Narrower faceted project visor, broad low-set forged pauldrons and wider cuirass. Original chevrons, crest, split skull face and ember blade preserved, not Lineage's armor layout.
- Seven named DK-only keyed actions generated from licensed source clips. Idle breathing reduced to 12%; attack torso/head turn controlled, windup holds and rapid transfer through the existing middle contact followed by measured recovery. Timeline and existing sample counts unchanged.
- Magic is a real added Spellcast_Shoot-derived left-hand gesture with planted lower body, restrained spine/chest and sword hand held at idle guard. It is NOT a renamed attack. Existing game currently selects attack for every act, so parent must bind magic before claiming casting is live.
- Run keeps its original 10 sample cadence and locomotion semantics with reduced hip bob and head turn. Dodge retains six inclusive endpoint samples and .2s presentation metadata. Hit/death durations .15/.6 unchanged. No gameplay/sim/attack speed/hitbox/save/network edits.

## Reproduction
Copy bake.py, weapon.py, gravitas.py, verify-gravitas.py and gravitas-config.json (as config.json) into the NEW offline root pipeline directory. Existing installed Windows Blender 5.2.2, no package installs.


a) Blender: -b --factory-startup --python C:/Users/user/ai-tools/arpg-art/deathknight-gravitas/pipeline/bake.py -- C:/Users/user/ai-tools/arpg-art/deathknight-gravitas/pipeline/config.json
b) Blender: -b --factory-startup --python C:/Users/user/ai-tools/arpg-art/deathknight-gravitas/pipeline/verify-gravitas.py -- C:/Users/user/ai-tools/arpg-art/deathknight-gravitas
c) python3 arpg/tools/art/player-death-knight/pack-verify.py /mnt/c/Users/user/ai-tools/arpg-art/deathknight-gravitas NEW_NONEXISTENT_DIR --pack
d) node arpg/tools/art/player-death-knight/verify-pixi.mjs NEW_NONEXISTENT_DIR

verify-gravitas independently reopens source without executing authoring code, evaluates every delivered pose and exports exact left/right hand/feet and rerenders attack_E_006 for byte-exact RGBA comparison. Framing is one envelope across all poses; never per-frame fitting. Delivery remains physical128/logical256/meta.scale .5.

## Integration-owner requirements (no shared renderer edits in this branch)
1. Replace normalized legacy blade socket lookup for player-death-knight with evidence/gravitas/source-derived-sockets.json groups. Values are pawn-local physical128 relative to this exact anchor. Apply entity atlasScale only (not sprite .5 normalization). Direct frame index: arrays exactly match new clip counts. Do not alter other kits.
2. Bind magic for explicit casting act IDs/families after inspecting actual content definitions. Preserve authoritative elapsed/total phase mapping exactly like attack; atlasFrame currently phase-scales only attack. Add DK-only magic phase mapping and playback restart on act identity; do not change phase durations/sim.
3. Portrait compositor must remain separate from formal combat descriptor including animation_durations.dodge. No source portrait bindings were changed.
4. Parent must inspect real shield overlay on source sockets across8dir attack/magic/idle, then actual in-scene1280 and390. Socket marker sheets are exact source projection, not proof shared renderer already consumes them. Production remains untouched by this branch.
5. Art stage only; parent visual acceptance, runtime magic/socket integration, full QA, stamps and release remain parent-owned.
