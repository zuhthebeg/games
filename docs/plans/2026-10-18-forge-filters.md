# Forge recipe filters

Apply karpathy-coding-discipline and test-driven-development: keep the spending/discovery/save contracts intact and test UI behavior before implementation.

- Default each forge entry to 제작 가능 + 전체 종류; tab changes retain transient selections.
- Filter revealed recipes by craftability (gold + carried stacks), currently held non-gold materials, or all revealed; combine with data-driven equipment categories.
- Show filtered/revealed counts, held/required quantities, shortages, discovery count and an empty-state button resetting both filters.
- Only render recipes in the crafting tab. Use native accessible buttons and compact wrapping mobile layout.
- Verify pure/rendered/action behavior with node:test, then fresh ordinary-entry Playwright keyboard/touch at 1280/390, exact craft spending and source binding. No publication.

## Extension (user 30560)

Add independent equipment set buttons and recipe set labels. Read definition.setId/setName first, with explicit boar_hide_armor and warden_blade/maul/plate base-family fallbacks for the current metadata-less catalogue. List only sets with revealed recipes; include all/no-set, intersect all three filters, reset all three on entry/empty CTA. New actual set effects, luck rarity and equipment metadata belong to the other owner, never this UI change.
