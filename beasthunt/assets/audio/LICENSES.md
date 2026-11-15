# Audio provenance

All 30 `gs_*.ogg` files were generated locally for BeastHunt using MOSS-SoundEffect v2.0 from the prompts/seeds in `PROMPTS.md` and `jobs.json`. No downloaded third-party audio, no CC0 supplements, no runtime hotlinks. These generated outputs are not represented as third-party CC0 recordings.

Model license evidence checked 2026-11-13:
- Official model card: https://huggingface.co/OpenMOSS-Team/MOSS-SoundEffect-v2.0
- Exact source: https://huggingface.co/OpenMOSS-Team/MOSS-SoundEffect-v2.0/raw/main/README.md (HTTP 200)
- License metadata verbatim: `license: apache-2.0`
- Code/project: https://github.com/OpenMOSS/MOSS-TTS/tree/main/moss_soundeffect_v2

Apache-2.0 is the model license, not a claim that generated audio has a specific copyright status or guaranteed clearance. The outputs contain no requested artist/recording imitation. Model weights and source code are not redistributed here.

청취 판정은 cocy 필요.


## Sonniss GDC 2019 edited game cues — 2026-11-15

교체됨(2026-11-15): 위 MOSS 생성 출처 설명 중 아래 16개 파일은 이제 해당하지 않는다. 나머지 14개 charge/slam/roll/release 파일의 기존 출처는 유지한다. 이 섹션은 이전 기록을 삭제하지 않고 현재 배포 자산의 출처를 정정한다.

Only short, edited, mono Ogg/Vorbis cuts are included as an integrated part of BeastHunt; no source recordings, audition previews, manifests, editing scripts or source-analysis files are distributed.

Source: **Sonniss — GDC 2019 Game Audio Bundle**, licensed under the **Sonniss GDC Free Audio License v2.0** (https://sonniss.com/gdc-bundle-license/).

| Edited game files | Source library (Sonniss GDC 2019) |
|---|---|
| gs_swing_light-1, gs_swing_b-2 | Airborne Sound - Organic Whooshes |
| gs_swing_light-2, gs_swing_spin-1 | Airborne Sound - Airy Whooshes |
| gs_swing_b-1, gs_swing_spin-2 | Airborne Sound - Eclectic Whooshes 3 |
| gs_hit-1/2, gs_hit_part-2, gs_hit_weak-1/2 | Sound Spark LLC – Gore |
| gs_hit_part-1 | Rock The Speakerbox - Melee |
| gs_guard_block-1, gs_guard_break-2 (three-layer edit) | 2496SoundEffects - Super Heroes Sound Design |
| gs_guard_block-2, gs_guard_break-1 | BlueZone - Heavy Metal Impact Sound Effects |

License summary: commercial and non-commercial project use, modification and shipment as part of a larger project are allowed; attribution is not required. The sounds may not be sold, shared or redistributed as standalone sound assets, a sound library or another competing sound product. This is not CC0, and the source recordings are not being relicensed. AI/ML training, embedding, similarity-model use or other model processing of these recordings was not performed or authorized by this integration.

Trim, deterministic pitch/rate adjustment, fades, loudness/peak mastering and the guard three-layer spectral/time mix were performed offline with ffmpeg and Python standard-library tooling only. Subjective approval of these final edits remains with cocy; numeric tests are not a listening verdict.


## Approved BOW / dual-blade game edits — R19, 2026-11-15

Ten short mono 24kHz Ogg/Vorbis game edits in weapons/. Sonniss GDC 2017/2019/2020 bundles; the same Sonniss Free Audio License and integrated-game-use restrictions above apply. Not CC0. No raw recordings, private previews or source libraries are included. No AI/ML/embedding/audio inference was used.

| Game cue | Approved private audition ID | Library / bundle year |
|---|---|---|
| db_swing-3 | db-swing 03 | Airborne Sound — Organic Whooshes / 2019 |
| db_swing-4 | db-swing 04 | Airborne Sound — Airy Whooshes / 2019 |
| db_swing-5 | db-swing 05 | Rock The Speakerbox — Melee / 2019 |
| db_hit-1 | db-hit 01 | Sound Spark LLC — Gore / 2019 |
| db_clink-1 | db-clink 01 | SmartSoundFX — Medieval / 2020 |
| db_clink-2 | db-clink 02 | Double Trouble Audio — Medieval Armor and Impacts / 2017 |
| db_clink-3 | db-clink 03 | 344 Audio — Medieval Battle / 2020 |
| bow_release-1 | bow-release 01 | Eiravaein Works — Nocked / 2019 |
| bow_flight-3 | bow-flight 03 | SoundFxwizard — PARTICLES An Organic & Granular Journey / 2020 |
| bow_hit-1 | bow-hit 01 | SmartSoundFX — Medieval / 2020 |

Selection approved by cocy (33040). Swing 03 is fabric-glove whoosh, 05 rope; bow release is an explicitly audition-approved crossbow snap, not a claim of longbow identity. Flight is an arrow-labelled particle-design recording. No independent variants are manufactured by pitch cloning. Bow draw was not selected: existing charge synthesis remains. DB clinks are prepared but have **no trigger**: the game has no DB guard/hard-contact cue, and this integration invents none.

Original 24bit WAV selection windows were SHA/ZIP-CRC verified, cut, mono-resampled, faded 1ms in / 25ms out, and linearly level-adjusted (decoded true-peak safety first). No companding, limiting, time stretch or pitch alteration. References chosen before processing: R18 GS light mean for swing/release, hit mean for DB/arrow hit, guard mean minus 6dB for clinks, light minus 6dB for flight. Short undefined integrated LUFS uses the unchanged gapless repeat-3s EBU metric. Some crest-rich cuts remain below reference rather than compressing away character; exact measured differences and edited-file hashes are in the R19 test fixture. Approval of source previews is not a final edited/in-game listening verdict. All thirty R18 GS OGG bytes, pools, URLs and GS event adapter are unchanged.
