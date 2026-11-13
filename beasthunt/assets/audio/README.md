# Greatsword sample audio

- Runtime: `js/audio.js` lazy per-file fetch/decode cache, serial low-priority preload only after explicit GS selection/hunt start, two variants without immediate repetition, ±4% playback-rate and ±4% gain jitter, runtime -3 dB trim, shared 4-voice ceiling (samples and GS synthetic fallbacks). Mute changes the master gain immediately; pause/hide/end/dispose stops loops. No asset requests on initial page load.
- `js/gs-sound.js`: read-only name adapter and per-hunter presentation history. A0/A1/A2 -> light, B3 -> short, B4/spin -> spin, charged release -> release; hit/hitBig -> hit, weak -> weak, break -> part, charge -> numbered stages, guard.broken -> block/break. Slam is triggered by the existing crossedImpact visual boundary, tier-scaled.
- Remote swings/charge stages/roll/slam are inferred from existing interpolated hunter/action presentation, distance falloff to zero at 32m. Remote guard uses the existing view stamina drop while guarding; exact guard success is not replicated as a dedicated event.
- Existing authenticated `rt` hit-claim packets are observed with an independent removable WebSocket message listener, hunt/version/roster/sequence/freshness bounded. Playback waits for the existing view tick. This is audible prediction (like local hit cues), **not a new authoritative hit event**, and it changes no transport handlers, outgoing traffic, HP, simulation or wire state. Weak cue uses existing monster part multiplier.
- Legacy sound events contain no player identity. Local swings are treated as hunter swings only at attack entry; other monster swings keep their synthesizer. Exact attribution when two identical sounds occur at the same fixed tick is not available without changing the prohibited simulation event schema.
- CC0 supplements not used. Model license evidence: LICENSES.md. Generation inputs/selected seed mapping: PROMPTS.md + jobs*.json. Every candidate/final metric: metrics.json / METRICS.md.
- Loop mastering: 80ms wrap crossfade; decoded boundary delta is recorded. This is an objective anti-discontinuity measure, not a listening verdict.

## Listening
Serve the repository root; open `/beasthunt/sfx-test.html`. Click **샘플 준비**, set volume, then compare each variant. Loop buttons play continuously until another loop variant or **모두 정지**. The page is deliberately not linked from game/portal.

**청취 판정은 cocy 필요.** No claim of perceived heaviness, absence of artifacts or good musical/tonal fit is made.
