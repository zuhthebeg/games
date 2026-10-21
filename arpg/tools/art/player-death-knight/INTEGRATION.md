# Gravitas runtime integration

Art candidate 940036a (integrated 9a81552), on VFX release15745e4. Original low-poly project art referencing LineageM silhouette principles; not photorealistic, not a copied outfit/motion or a dramatic complete makeover.

- 584frames/56groups, 2atlas pages:1024x1988+1024x264. 886394WebPbytes. Decoded8.796875MiB exceeds soft8, below hard12. Physical128/logical256 parser correction .5, ground anchor(.5,.6547760367393494). Existing13/10/13/8/10/6state counts, FPS12 and dodge.2/hit.15/death.6 metadata retained; magic13added.
- death-knight-sockets.js is generated directly from independent source-derived-sockets.json groups. Direct exact frame lookup only for DK, no legacy normalized fallback (old mismatch max20.168px). Pawn-local physical128 multiplied by entity atlasScale, NEVER logical texture .5 correction. Right grip is baked into art; independent584-frame source validation includes both hands/feet. Shield projection and guard effectiveness unchanged.
- DK-only magic: actual focus family (including focus_pulse), and explicit dead_explosion/poison_field/curse/invisibility/berserk dark rituals. Other steel/bow attacks remain attack. Same authoritative act elapsed/total ticks mapping as attack; act identity/state restarts, hit/death/dodge/terminal priorities unchanged. No sim/ability/MP/CD/rate changes. Normal human/skeleton unaffected.
- Inn idle metadata regenerated from actual new page0 rect/trim/anchor; same exact left source socket. Combat still uses AtlasLibrary descriptor including duration metadata, NEVER portrait compositor. Portrait canvas needs only idle page0; no false full-animation descriptor.
- DK retains pre-existing fixed baked sword appearance with permitted weapon changes (including bow/wand), rather than pretending to replace baked sword with selected inventory weapon. Actual shield permits/restrictions and combat family are unchanged. Inn natural equipment regression covers sword/maul/wand/bow/staff/twohand; bow/twohand/staff suppress shield.

## Evidence commands
node --test arpg/test/death-knight-gravitas.test.js arpg/test/death-knight-runtime.test.js arpg/test/shield-scale.test.js arpg/test/inn-shield.test.js
node arpg/test/death-knight-gravitas.native.mjs
node arpg/test/death-knight-scene.native.mjs
node arpg/test/all-skills-shield.native.mjs
node arpg/test/inn-shield.native.mjs
node arpg/test/academy-lineage-weapons.native.mjs
P0_KIT=blade node arpg/test/mp-freeze-p0.native.mjs

Native fixtures are isolated valid preboot SAVE data; no user save access/world injection. Only local captures. Exact-frame fixture is OFFLINE synthetic state, distinct from actual game native inputs. Exhaustive584frames×4shield×guard2×width2:9344 samples,0socket error; dead state intentionally hides shield (source hand still checked). Local natural scene PC1280/touch390 proves sword+bone shield attack and actual curse magic. Full test command node --test arpg/test/*.test.js arpg/test/*.test.mjs retains same63named baseline failures (1904→1909 tests); not a full-green claim. Focused229pass, no failures.

Static24sprite submission p95 recorded by runtime fixture is only softwareChromium CPU/submission timing, not GPU-completed frame time or physical-phoneFPS. Existing30skillVFX allocation limits unchanged; no live rig/Three/context/dependency added. New atlas budget is payload/decode cost, not a claim of feature heap delta.
