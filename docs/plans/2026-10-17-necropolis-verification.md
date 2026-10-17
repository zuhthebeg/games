# Necropolis local verification

Scope: local implementation on `feat/arpg-necropolis`, based on clean `c7b1abe`. Not a deployment report. Parent owns independent review, both HTML asset stamps and release.

## Content and compatibility

- S24 매장지 → S25 구울 소굴 → S26 망령 회랑 → S27 망자의 성소. Both S20 and S23 historical clears remain mandatory; fresh progression is sequential.
- Independent `necropolis_lord`: authored `boss:true`, undead identity, existing chief abilities and skeleton-warrior atlas. Warm tint, crown marker/name and bone audio; one boss plus skeleton escorts. No new assets, abilities, simulation/network rules or invulnerability.
- All pre-existing stage/monster/ability/map/tuning/loot/biome/XP entries are compared exactly with c7b1abe by the new tests, including S21–23 and living bats. Save version and missing-key historical saves stay unchanged.
- The throne node moves to [24,92] and necropolis occupies [76,92], maintaining separate final columns without CSS changes.
- Shared atlas aliases resolve to the existing model key, including cache/release ownership; boss and escort share one existing atlas lease.

## Executed checks

- Initial RED: 13 tests, 2 passed / 11 missing-feature failures (`tmp/arpg-necropolis-red.log`). Presentation RED: 3 failures (`tmp/arpg-necropolis-presentation-red.log`).
- GREEN content: 14/14 (`tmp/arpg-necropolis-green.log`). Additional 2/4-player host-authoritative transport, kill journals and bounded independent settlement: 8/8, combined new-content result 22/22 (`tmp/arpg-necropolis-final-content.log`).
- Focused required regressions: 104/104 (`tmp/arpg-necropolis-final-regressions-green.log`). Includes holy/support boss gates, atlas ownership, board, existing graveyard co-op, multiplayer, empty waves and gear budgets.
- Catalog boundary updates: 5/5 + 6/6 (`tmp/arpg-necropolis-catalog-green.log`, `tmp/arpg-necropolis-additive-freezes-green.log`). Explicitly extend existing stage/region/model-alias/loot assertions; retain prior data/byte comparisons.
- Clean c7b1abe broad audit: 1230 tests, 1172 passed / 58 failed. Final branch broad audit: 1256 tests, 1197 passed / 59 failed. Exact same 58 baseline failure names, plus the expected parent-owned `index.html cache-busting stamps match current js/css contents` failure. No global-green claim. Classification: `tmp/arpg-necropolis-final-regression-classification.json`.
- `node arpg/tools/validate-content.mjs`: valid, 25 monsters / 31 stages. `git diff --check`: clean.
- Byte-immutable boundaries: `arpg/js/sim`, `arpg/js/net`, `arpg/assets`, both main/lab HTML, existing `.claude/CLAUDE.md`, `package.json`.
- SHA256 log manifest: `tmp/arpg-necropolis-test-log-sha256.json`. Logs live under `/home/cocy/.openclaw/workspace/tmp/`.

## Native test contract

`node arpg/test/necropolis.native.mjs` serves this checkout on an isolated local port, launches a fresh native Chromium profile and enters actual ordinary `/arpg/`. `ARPG_BASE_URL=https://game.cocy.io` runs the same harness against the parent's release. Optional `ARPG_HTTP_PORT` and `ARPG_NECROPOLIS_EVIDENCE` select local port/output.

Only a validated pre-boot fixture is seeded (Lv30, ordinary T3 epic +6, normal potions). After boot, `__arpg` is read-only: all map/departure/combat/receipt/reload actions use native keyboard/touch. Touch steering uses the game's existing fixed movement pad. A floating-joystick harness stalled after the PC cases; a bounded fresh fixed-pad probe cleared S24 through settlement/reload (1548 ticks), without any runtime change. This is harness troubleshooting, not a production gameplay fix.

No screenshots or pixel-appearance claims; layout is DOM geometry and boss art is verified from actual loaded atlas/renderer state. Source/atlas bytes delivered to the browser are SHA256-bound to the checkout. Fresh-context fixtures do not read existing user storage.

## Final actual-app native result

PASS: both PC1280 keyboard and touch390, four negative prerequisite fixtures, eight normal battle clears and post-clear reloads, and both full region layouts. `tmp/arpg-necropolis-native.json` SHA256: `b7cce694e7940be19bfce723dbdd43c5eb94ae9d512835df149604a796afc0e7`. Native runtime source HEAD: `7857eb356ab71e8a962babb663b43cd360971201` (later ledger edits only).

| Input | Map | Actual ticks | Kills / scheduled | Gold | Save reload |
|---|---|---:|---:|---:|---|
| PC1280 | S24 | 1536 | 24 / 24 | 204 | PASS |
| PC1280 | S25 | 1670 | 20 / 20 | 308 | PASS |
| PC1280 | S26 | 1644 | 24 / 24 | 303 | PASS |
| PC1280 | S27 | 551 | 6 / 6 | 134 | PASS |
| Touch390 | S24 | 1646 | 24 / 24 | 209 | PASS |
| Touch390 | S25 | 1752 | 20 / 20 | 301 | PASS |
| Touch390 | S26 | 2915 | 24 / 24 | 304 | PASS |
| Touch390 | S27 | 618 | 6 / 6 | 143 | PASS |

Each map used actual normal departure, killAll, bounded ordinary reward receipt, sequential next unlock and persisted reload. All placed species loaded their real atlas. S27 loaded `necropolis_lord` from skeleton-warrior with rendered boss-name/crown metadata. Revisit cards remain selectable after clears. Page exceptions: 0. DOM overflow, clipped region nodes and region-node overlaps: 0. Delivered source binding covers 13 changed runtime modules plus requested existing atlas assets. Screenshots: 0; authoritative browser-world writes: 0. The eight co-op cases are in-memory existing transport tests, not WAN/native co-op claims.
