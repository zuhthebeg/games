# R20 versioned references

Base: 2b8f8e3206befbcdfccf7c86428828836ed4d3e3, Beasthunt 294 tests (not ARPG).

- Protocol 3 intentionally rejects v2 normal-chain semantics; socket audio imports VERSION rather than retaining v2. Host authentication and per-stage raw ceilings unchanged in strength.
- Actual isolated body damage: GS [29,34,53] -> [29,37,53]; DB [12,12,12,22] -> [10,12,15,25]; bow [12,12,12] -> [10,12,15]. In sequential contacts GS last=54/DB last=26 due to prior contact state; both fixtures distinguish those conditions. Heavy/charge and GS B exact event/damage comparisons remain frozen.
- R11/R19 historic combat trace assertions now replay frozen simulator AND frozen data. Importing old sim with current tables was a mixed-version reference, not a valid historical oracle. Historic byte gate remains old-source-vs-old-source only for intentionally changed combat/presentation files; current immutable input, GS sound adapter, Warrok motion/floor and raw assets remain directly byte checked.
- r20-traces.json contains explicit player/monster HP + SHA256 over every snapshot/event in each 1200-tick trace (3 weapons x3 original seeds). Reason: changed graded attacks, bounded link queue, 150ms grace cause intentional combat timeline/contact changes. r20-trace tests also compare current audio-on/off without mutation, and keep all nine noncombat seeds exact frozen R19. No broad golden regeneration or skipped tests.
- Cache-only tests updated to 20261116r20; raw GLB hashes, clip clocks, geometry/contact oracle thresholds and sound byte/mapping assertions unchanged.
- Candidate intentionally excludes the Warrok request, not a claimed 2x implementation. Exact 3.6 geometry is retained on feat/beasthunt-r20-warrok-wip (dfaf0219); current candidate retains production 1.8. Human motion approval and independent combat authority review remain pending.
