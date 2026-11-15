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
