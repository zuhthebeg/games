# Additional attainable equipment sets

Approved scope: four existing weapon/body pairs, definition metadata before rarity expansion. No base stats, recipes, drops, saves, or existing sets change.

- Hunter: hunter_bow + leather_vest; 2 pieces movement speed +3%, carry +5 kg.
- Ossuary: ossuary_maul + ossuary_plate; 2 pieces HP +16, AC +4.
- Soulfire: soulfire_wand OR gravekeeper_staff + shroud_robe; 2 pieces MP regeneration +0.25/s. Alternative weapons never provide a second slot.
- Guardian dragon: dragonfang_blade + dragon_scale_armor; 2 pieces HP +20, weapon attack +5%. Drop-only identity and no recipes preserved.

Bonuses are additive flat resources, multiplicative +3% movement, additive percentage points to existing weapon attack affixes. No magic-only multiplier or unsupported resistance. Existing generic set UI and comparison use derived values.

Plan: red tests for pair activation/removal/variants/purity/legacy saves; minimal definitions and supported-stat aggregation; focused regressions and actual world/snapshot consumers; fresh ordinary-entry PC1280/touch390 native equip/unequip, comparison and revealed-only forge filters; clean local commit and parent production replay harness. Karpathy coding discipline and TDD applied.
