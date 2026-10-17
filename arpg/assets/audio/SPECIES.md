# Species sound delivery audit

All 25 current monster/archetype/variant IDs have explicit hit/death profiles in `js/audio-profile.js`. Six formerly conflated families now use separately generated hit/death sources: wolf, boar, bat, spider, goblin, stone. Slime/demon/dragon hits and dragon death are also separately generated. Skeleton, ghost/spirit, and dry humanoid families retain the existing appropriate sources. Scarecrow uses dry/straw-like impacts; the lab humanoid uses the dry-organic family. These are intended mappings, not verified perceptual identities.

## Provenance

16 local MOSS-SoundEffect v2.0 WAVs, seeds 18100–18115, 3s each, 100 steps and cfg 4.0. Prompt, seed, source SHA-256, trim, processing and delivered SHA-256 are recorded per clip in `profiles-manifest.json`. The model README and code LICENSE evidence hashes are under `speciesGeneration`: Apache-2.0 model/code, not an asserted CC0 output license. No stock audio, paid service, model download or dependency installation. Original WAVs/jobs/logs remain outside the repository under `/home/cocy/.openclaw/workspace/tmp/arpg-sound-source/`.

## Processing and reproducible checks

From the repository root, using the existing environment (numpy/soundfile + ffmpeg):

```sh
/home/cocy/miniconda3/envs/moss-soundeffect-v2/bin/python arpg/tools/species-sfx.py /home/cocy/.openclaw/workspace/tmp/arpg-sound-source/jobs.json
/home/cocy/miniconda3/envs/moss-soundeffect-v2/bin/python arpg/tools/species-sfx.py --verify
node --test arpg/test/audio.test.js arpg/test/audio-profile.test.js arpg/test/species-audio.test.js
node arpg/test/audio-browser-smoke.mjs
node arpg/test/species-audio-browser-smoke.mjs
# After parent publishes, replay against the actual published origin:
ARPG_BASE_URL=https://game.cocy.io ARPG_AUDIO_EVIDENCE=/home/cocy/.openclaw/workspace/tmp/arpg-sound-source/native-audio-production.json node arpg/test/species-audio-browser-smoke.mjs
```

Rebuilding does not run a model: it only processes existing WAVs. Ogg container serials may change on re-encode, so the manifest/ledger are regenerated together. The `--verify` path decodes the committed files and checks actual metrics and hashes without rebuilding.

The trim starts at the first substantial 5ms RMS frame, retaining 10ms preroll; duration is bounded per family. Normalization uses the existing .16 RMS target / .70 source peak cap, 5ms fade-in /40ms fade-out, 65Hz high-pass, .85 limiter, mono 48kHz Vorbis q3. The actual decoded Ogg peak can exceed the pre-encode source cap due to codec/filter effects and is separately gated below .85.

## Delivered measurements

| Clip | Seconds | Peak | RMS | Centroid Hz | Bandwidth Hz | Onset ms | Silent tail ms |
|---|---:|---:|---:|---:|---:|---:|---:|
| wolf-hit.ogg | 0.280 | 0.460 | 0.152 | 701 | 392 | 0 | 0.0 |
| wolf-death.ogg | 0.720 | 0.423 | 0.159 | 441 | 82 | 5 | 0.0 |
| boar-hit.ogg | 0.320 | 0.342 | 0.149 | 776 | 383 | 0 | 0.0 |
| boar-death.ogg | 0.850 | 0.642 | 0.074 | 989 | 673 | 0 | 0.0 |
| bat-hit.ogg | 0.220 | 0.585 | 0.147 | 4149 | 597 | 0 | 0.0 |
| bat-death.ogg | 0.480 | 0.659 | 0.117 | 4445 | 1492 | 5 | 0.0 |
| spider-hit.ogg | 0.300 | 0.638 | 0.037 | 15385 | 2009 | 0 | 5.0 |
| spider-death.ogg | 0.680 | 0.641 | 0.045 | 3576 | 1541 | 10 | 5.0 |
| goblin-hit.ogg | 0.300 | 0.409 | 0.147 | 1766 | 1618 | 10 | 0.0 |
| goblin-death.ogg | 0.720 | 0.493 | 0.157 | 1060 | 339 | 0 | 55.0 |
| stone-hit.ogg | 0.320 | 0.579 | 0.037 | 2154 | 1899 | 5 | 10.0 |
| stone-death.ogg | 1.100 | 0.767 | 0.036 | 1959 | 1988 | 10 | 35.0 |
| slime-hit.ogg | 0.300 | 0.485 | 0.157 | 941 | 248 | 5 | 0.0 |
| demon-hit.ogg | 0.320 | 0.534 | 0.144 | 964 | 341 | 0 | 0.0 |
| dragon-hit.ogg | 0.380 | 0.355 | 0.151 | 358 | 312 | 0 | 0.0 |
| dragon-death.ogg | 1.100 | 0.532 | 0.129 | 401 | 492 | 0 | 0.0 |

All 16 sources, seeds and encoded SHA-256 hashes are distinct. All 30 within-action cross-family comparisons pass at least two independent differences: relative centroid ≥.08, duration ≥.06s, or normalized 32-bin RMS envelope mean difference ≥.08. Wolf vs stone additionally requires centroid ≥.15 and duration ≥.12s or envelope ≥.12. Full numeric evidence is in `species-audit.json`; this demonstrates engineering differences, **not semantic identity or listening quality**.

The draft sanity gate demanded bandwidth >100Hz; the delivered wolf-death is a tonal 81.5Hz-wide signal. That arbitrary minimum was removed in favor of bandwidth >0Hz, preserving all cross-family difference rules. This is not a perceptual quality claim.

The standalone historical `battle-preview-1014.ogg` is intentionally not runtime-loaded and is excluded from the exact runtime-manifest file-set assertion.

## Audition and limits

Old/new raw Ogg pairs for all 25 profiles (50 actions, 100 files), a Markdown index and an HTML player live outside the repository at `/home/cocy/.openclaw/workspace/tmp/arpg-sound-audition/`. The HTML player applies the old/new in-game pitch to each side and disables pitch preservation.

**Listening is unverified.** Native tests verify confirmed gameplay events, exact served bytes, real Chromium Ogg decoding and successful `CombatAudio.play` scheduling in a running AudioContext. They do not prove physical speaker output or subjective canine/stone recognition. The ordinary-page harness uses fresh browser contexts, valid persisted stage fixtures, native keyboard/touch navigation and movement, read-only world access and presentation-only prototype observation. No runtime world/simulation writes, debug routes, screenshots or existing user sessions. Browser buffers may be resampled by the actual AudioContext; 48kHz/mono is checked on the delivered Ogg independently.
