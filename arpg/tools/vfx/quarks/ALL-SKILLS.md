# All-player skill signatures

Canonical inventory: 26 BOOKS + 3 DEFAULT_SKILLS + shield_bash guard utility = **30**. Excludes basic slash/arrow/focus_pulse and enemy-only attacks. Test compares exact union, not a guessed list.

Every row has accepted active/recovery cast identity; projectile skills add trajectory+hit; four zone skills retain original boundaries/expiry and emit at accepted zone positions; existing impact/heal events add matching fragments. Original silhouettes, mastery scaling and holy success/failure remain independent.

|ID|Motif|Player-readable signature|
|---|---|---|
|lunge|blade|Forward silver thrust wake and low grit|
|whirl|blade|Three sweeping silver crescent ribbons|
|heavy_cleave|debris|Heavy descending blade and upward stone splinters|
|ground_slam|debris|Low radial stone wedges and ochre dust|
|armor_break|facet|Fractured bronze armor plates fly forward|
|shield_bash|facet|Short steel shield splinters at contact|
|sword_wave|blade|Jade crescent wakes following the sword wave|
|berserk|flame|Twin rising red rage horns, not healing runes|
|volley|feather|Five gold fletching streams spread outward|
|triple_arrow|feather|Three parallel ivory fletching streaks|
|spinning_shot|feather|Circular green feather sweep around shooter|
|evasion_shot|feather|Backward pale-blue feather slipstream|
|pierce_shot|needle|Long narrow cyan needle wake|
|blast_arrow|flame|Amber burning fletching and impact cinders|
|rain_arrow|feather|Downward arrow fletching rain inside zone|
|poison_arrow|venom|Serrated green venom drops along arrow|
|ember_bolt|flame|Tapered orange cinders behind fireball|
|frost_lance|crystal|Six-point icy shards in a narrow wake|
|flame_ring|flame|Rising fire tongues arranged along the ring|
|meteor|debris|Falling hot rock chips then radial impact debris|
|firewall|flame|Upright cinders distributed across actual wall|
|healing_light|heal|Recognizable green crosses drift upward|
|protective_shield|facet|Blue hexagonal shield facets assemble inward|
|turn_undead|holy|Gold feather ascension; original success beam and grey fail retained|
|cursed_hands|smoke|Dense violet smoke under actual grasping bone hands|
|blood_spear|blood|Thick dark-red droplets shed from blood lance|
|dead_explosion|bone|Bone fragments expelled through a plum death blast|
|poison_field|mist|Layered green toxic vapor confined to poison pool|
|curse|rune|Broken violet sigils close around cursed target|
|invisibility|smoke|Cool smoke peels away in two fading veils|

Fixed144 SpriteParticle/Graphics slots,16 recurring emitters,max24/burst. Recurring-source admission stops at96 with per-source threshold8, leaving48 transient slots for cast/heal/impact. Real upstream SizeOverLife/ForceOverLife/RotationOverLife. Cast identity tick-elapsed survives guest object replacement and omitted active phase. Classic/reduced disable adapter; rewind/scene leave resets; >250ms resume drops stale particles; integration capped50ms. No simulation/protocol/save changes.

Local sheets use exact cfc4891 adapter BEFORE and current AFTER, same synthetic normal-scale actors/floor. Sheet aggregate statistics are not four-player performance. Software Chromium submission time is not GPU-completed time or phone FPS; heap includes shared caches, not attributable allocation.

## User screenshot corrections
- Poison diagonal: reproduced in original local sheet; Pixi arc connected previous subpath cursor to duration-ring start. Explicit moveTo at exact arc start fixes poison/rain/meteor, retaining circles. Three camera offsets with two simultaneous poison pools rendered separately; path regression RED3 to GREEN3.
- Evolved idle shield: texture logical256 normalization (.5) incorrectly scaled physical-pixel socket/attached shield. Equipment now uses entity atlasScale, not texture scale. Evolved clip frame counts also exceeded source hand-table counts, intermittently falling back to a full-size generic pose (including while guarding). Normalized clip-to-socket frame mapping avoids that jump. Character atlas pixels/playback and guard effectiveness untouched; existing physical width projection is unchanged. Cache also keys height.
- Unit matrix covers human/skeleton/evolved ×4 shield contours ×8directions ×idle/run/attack/guard and all480 evolved frames. Native bone-shield rotation sweep covers all3 lineages at1280/390 with idle/move/attack/guard; inn native all4 contours/restrictions6profiles passed. Evolved socket mapping is a normalized reuse of existing rig sockets, not a claim of newly exported exact evolved hand bones.

## Evidence so far
Focused300 passed before final evolved mapping; final111 passed after mapping. Local mixed human/evolved real relay both host orders64.125/64.670s, no render errors. Academy6profiles and inn6profiles passed. Four-player deterministic adapter stress, same720frames BEFORE/AFTER: pool144 fixed, peak34→88, all0 after expiry, drawcalls1→1. Concurrent browser/test load inflated software p95 .8→2.7ms PC /1.0→2.8ms390; no device-FPS claim. Heap caches not interpretable as allocation deltas. Before-after sheets and 24frame motion in workspace tmp/arpg-all-skills; no production captures.
