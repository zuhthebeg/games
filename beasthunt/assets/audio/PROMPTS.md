# MOSS-SoundEffect v2.0 generation record

46 independently seeded candidates. Reject raw RMS < -60 dBFS, peak-normalized silence >90%, HF >45%; select the two lowest (normalized silence + 0.5*HF) scores per sound. Longer physical candidates replace objectively silent short outputs. These are objective screens, not quality ranking. 청취 판정은 cocy 필요.

steps=100, cfg_scale=4.0, sigma_shift=5.0, bfloat16 CUDA; raw 48kHz. See jobs.json for executable exact job inputs.

Mastering: highpass 60Hz (slam 30Hz, roll 100Hz) and lowpass 8kHz, trim start <-40dBFS, peak-normalize before -40dB trim, mono 24kHz, requested duration crop/pad, 35ms fade-out (2ms anti-click fade-in), -16 LUFS target subject to -1dBFS decoded peak ceiling; runtime -3dB gain. Loop: 80ms wrap crossfade, no fade to silence. OGG Vorbis q4.

## Selected outputs
gs_swing_light-1.ogg <- r8b-gs_swing_light-2.wav seed=83101
gs_swing_light-2.ogg <- r8b-gs_swing_light-1.wav seed=83100
gs_swing_b-1.ogg <- r8b-gs_swing_b-1.wav seed=83110
gs_swing_b-2.ogg <- r8b-gs_swing_b-4.wav seed=84104
gs_swing_spin-1.ogg <- r8b-gs_swing_spin-2.wav seed=83121
gs_swing_spin-2.ogg <- r8b-gs_swing_spin-1.wav seed=83120
gs_hit-1.ogg <- r8b-gs_hit-2.wav seed=83131
gs_hit-2.ogg <- r8b-gs_hit-3.wav seed=84113
gs_hit_part-1.ogg <- r8b-gs_hit_part-1.wav seed=83140
gs_hit_part-2.ogg <- r8b-gs_hit_part-2.wav seed=83141
gs_hit_weak-1.ogg <- r8b-gs_hit_weak-3.wav seed=84123
gs_hit_weak-2.ogg <- r8b-gs_hit_weak-5.wav seed=85125
gs_charge_1-1.ogg <- r8b-gs_charge_1-1.wav seed=83160
gs_charge_1-2.ogg <- r8b-gs_charge_1-2.wav seed=83161
gs_charge_2-1.ogg <- r8b-gs_charge_2-2.wav seed=83171
gs_charge_2-2.ogg <- r8b-gs_charge_2-1.wav seed=83170
gs_charge_3-1.ogg <- r8b-gs_charge_3-2.wav seed=83181
gs_charge_3-2.ogg <- r8b-gs_charge_3-4.wav seed=84134
gs_charge_loop-1.ogg <- r8b-gs_charge_loop-1.wav seed=83190
gs_charge_loop-2.ogg <- r8b-gs_charge_loop-2.wav seed=83191
gs_charge_release-1.ogg <- r8b-gs_charge_release-3.wav seed=84143
gs_charge_release-2.ogg <- r8b-gs_charge_release-4.wav seed=84144
gs_slam-1.ogg <- r8b-gs_slam-2.wav seed=83211
gs_slam-2.ogg <- r8b-gs_slam-1.wav seed=83210
gs_guard_block-1.ogg <- r8b-gs_guard_block-2.wav seed=83221
gs_guard_block-2.ogg <- r8b-gs_guard_block-1.wav seed=83220
gs_guard_break-1.ogg <- r8b-gs_guard_break-2.wav seed=83231
gs_guard_break-2.ogg <- r8b-gs_guard_break-3.wav seed=84153
gs_roll-1.ogg <- r8b-gs_roll-1.wav seed=83240
gs_roll-2.ogg <- r8b-gs_roll-4.wav seed=84164

## r8b-gs_swing_light-1.wav
A single very heavy steel greatsword swishing sharply through air, deep forceful whoosh, dry close isolated sound, no voice no music.

seed=83100, requested seconds=0.45

## r8b-gs_swing_light-2.wav
A single very heavy steel greatsword swishing sharply through air, deep forceful whoosh, dry close isolated sound, no voice no music.

seed=83101, requested seconds=0.45

## r8b-gs_swing_b-1.wav
A quick short thrust of a massive steel sword, compact low swish and metallic vibration, isolated dry sound, no music.

seed=83110, requested seconds=0.35

## r8b-gs_swing_b-2.wav
A quick short thrust of a massive steel sword, compact low swish and metallic vibration, isolated dry sound, no music.

seed=83111, requested seconds=0.35

## r8b-gs_swing_spin-1.wav
A heavy broad sword making a long circular sweep through air, deep accelerating whirling whoosh, isolated, no voice or music.

seed=83120, requested seconds=0.9

## r8b-gs_swing_spin-2.wav
A heavy broad sword making a long circular sweep through air, deep accelerating whirling whoosh, isolated, no voice or music.

seed=83121, requested seconds=0.9

## r8b-gs_hit-1.wav
A heavy steel blade cutting thick leather and flesh with a solid weighty thud and short sharp slice, isolated game foley, no voice no music.

seed=83130, requested seconds=0.32

## r8b-gs_hit-2.wav
A heavy steel blade cutting thick leather and flesh with a solid weighty thud and short sharp slice, isolated game foley, no voice no music.

seed=83131, requested seconds=0.32

## r8b-gs_hit_part-1.wav
A massive sword striking and cracking a hard horn, dense bone crack and low steel impact, short isolated dry sound, no music.

seed=83140, requested seconds=0.4

## r8b-gs_hit_part-2.wav
A massive sword striking and cracking a hard horn, dense bone crack and low steel impact, short isolated dry sound, no music.

seed=83141, requested seconds=0.4

## r8b-gs_hit_weak-1.wav
A sharp steel sword slash impact, bright brief metallic ring over a solid leather cutting thud, isolated no music.

seed=83150, requested seconds=0.35

## r8b-gs_hit_weak-2.wav
A sharp steel sword slash impact, bright brief metallic ring over a solid leather cutting thud, isolated no music.

seed=83151, requested seconds=0.35

## r8b-gs_charge_1-1.wav
A short low steel blade resonance building in intensity, faint rising metallic vibration, dry isolated sound, no voice no music.

seed=83160, requested seconds=0.35

## r8b-gs_charge_1-2.wav
A short low steel blade resonance building in intensity, faint rising metallic vibration, dry isolated sound, no voice no music.

seed=83161, requested seconds=0.35

## r8b-gs_charge_2-1.wav
A short rising strong resonant steel vibration, a medium pitched metallic energy pulse, isolated no voice no music.

seed=83170, requested seconds=0.4

## r8b-gs_charge_2-2.wav
A short rising strong resonant steel vibration, a medium pitched metallic energy pulse, isolated no voice no music.

seed=83171, requested seconds=0.4

## r8b-gs_charge_3-1.wav
An intense brief rising ringing steel blade resonance, a powerful metallic energy pulse, isolated no voice no music.

seed=83180, requested seconds=0.45

## r8b-gs_charge_3-2.wav
An intense brief rising ringing steel blade resonance, a powerful metallic energy pulse, isolated no voice no music.

seed=83181, requested seconds=0.45

## r8b-gs_charge_loop-1.wav
Steady quiet low steel resonance, constant smooth deep metallic humming vibration without pulses, seamless sustained texture, no voice no music.

seed=83190, requested seconds=2.5

## r8b-gs_charge_loop-2.wav
Steady quiet low steel resonance, constant smooth deep metallic humming vibration without pulses, seamless sustained texture, no voice no music.

seed=83191, requested seconds=2.5

## r8b-gs_charge_release-1.wav
A sharp metallic reverse swell inhaling air followed by a tiny steel click, massive sword release preparation, dry isolated no music.

seed=83200, requested seconds=0.4

## r8b-gs_charge_release-2.wav
A sharp metallic reverse swell inhaling air followed by a tiny steel click, massive sword release preparation, dry isolated no music.

seed=83201, requested seconds=0.4

## r8b-gs_slam-1.wav
A huge steel sword slamming into rocky earth, deep bass impact and cracking stone debris with a short rumbling decay, isolated no voice no music.

seed=83210, requested seconds=1

## r8b-gs_slam-2.wav
A huge steel sword slamming into rocky earth, deep bass impact and cracking stone debris with a short rumbling decay, isolated no voice no music.

seed=83211, requested seconds=1

## r8b-gs_guard_block-1.wav
A heavy blade blocking another blade, single dense metallic clang with a low resonant steel ring, dry isolated no music.

seed=83220, requested seconds=0.45

## r8b-gs_guard_block-2.wav
A heavy blade blocking another blade, single dense metallic clang with a low resonant steel ring, dry isolated no music.

seed=83221, requested seconds=0.45

## r8b-gs_guard_break-1.wav
An extremely heavy metal strike with a sharp steel cracking and shattering sound, low impact and brief metallic debris, isolated no music.

seed=83230, requested seconds=0.65

## r8b-gs_guard_break-2.wav
An extremely heavy metal strike with a sharp steel cracking and shattering sound, low impact and brief metallic debris, isolated no music.

seed=83231, requested seconds=0.65

## r8b-gs_roll-1.wav
A single armored body rolling on dry earth, short cloth scrape and subtle steel armor rattle, close dry foley, no voice no music.

seed=83240, requested seconds=0.45

## r8b-gs_roll-2.wav
A single armored body rolling on dry earth, short cloth scrape and subtle steel armor rattle, close dry foley, no voice no music.

seed=83241, requested seconds=0.45

## r8b-gs_swing_b-3.wav
Immediately audible at the beginning: A quick short thrust of a massive steel sword, compact low swish and metallic vibration, isolated dry sound, no music. One distinct isolated effect with a natural short decay. No silence before the action.

seed=84103, requested seconds=2

## r8b-gs_swing_b-4.wav
Immediately audible at the beginning: A quick short thrust of a massive steel sword, compact low swish and metallic vibration, isolated dry sound, no music. One distinct isolated effect with a natural short decay. No silence before the action.

seed=84104, requested seconds=2

## r8b-gs_hit-3.wav
Immediately audible at the beginning: A heavy steel blade cutting thick leather and flesh with a solid weighty thud and short sharp slice, isolated game foley, no voice no music. One distinct isolated effect with a natural short decay. No silence before the action.

seed=84113, requested seconds=2

## r8b-gs_hit-4.wav
Immediately audible at the beginning: A heavy steel blade cutting thick leather and flesh with a solid weighty thud and short sharp slice, isolated game foley, no voice no music. One distinct isolated effect with a natural short decay. No silence before the action.

seed=84114, requested seconds=2

## r8b-gs_hit_weak-3.wav
Immediately audible at the beginning: A sharp steel sword slash impact, bright brief metallic ring over a solid leather cutting thud, isolated no music. One distinct isolated effect with a natural short decay. No silence before the action.

seed=84123, requested seconds=2

## r8b-gs_hit_weak-4.wav
Immediately audible at the beginning: A sharp steel sword slash impact, bright brief metallic ring over a solid leather cutting thud, isolated no music. One distinct isolated effect with a natural short decay. No silence before the action.

seed=84124, requested seconds=2

## r8b-gs_charge_3-3.wav
Immediately audible at the beginning: An intense brief rising ringing steel blade resonance, a powerful metallic energy pulse, isolated no voice no music. One distinct isolated effect with a natural short decay. No silence before the action.

seed=84133, requested seconds=2

## r8b-gs_charge_3-4.wav
Immediately audible at the beginning: An intense brief rising ringing steel blade resonance, a powerful metallic energy pulse, isolated no voice no music. One distinct isolated effect with a natural short decay. No silence before the action.

seed=84134, requested seconds=2

## r8b-gs_charge_release-3.wav
Immediately audible at the beginning: A sharp metallic reverse swell inhaling air followed by a tiny steel click, massive sword release preparation, dry isolated no music. One distinct isolated effect with a natural short decay. No silence before the action.

seed=84143, requested seconds=2

## r8b-gs_charge_release-4.wav
Immediately audible at the beginning: A sharp metallic reverse swell inhaling air followed by a tiny steel click, massive sword release preparation, dry isolated no music. One distinct isolated effect with a natural short decay. No silence before the action.

seed=84144, requested seconds=2

## r8b-gs_guard_break-3.wav
Immediately audible at the beginning: An extremely heavy metal strike with a sharp steel cracking and shattering sound, low impact and brief metallic debris, isolated no music. One distinct isolated effect with a natural short decay. No silence before the action.

seed=84153, requested seconds=2

## r8b-gs_guard_break-4.wav
Immediately audible at the beginning: An extremely heavy metal strike with a sharp steel cracking and shattering sound, low impact and brief metallic debris, isolated no music. One distinct isolated effect with a natural short decay. No silence before the action.

seed=84154, requested seconds=2

## r8b-gs_roll-3.wav
Immediately audible at the beginning: A single armored body rolling on dry earth, short cloth scrape and subtle steel armor rattle, close dry foley, no voice no music. One distinct isolated effect with a natural short decay. No silence before the action.

seed=84163, requested seconds=2

## r8b-gs_roll-4.wav
Immediately audible at the beginning: A single armored body rolling on dry earth, short cloth scrape and subtle steel armor rattle, close dry foley, no voice no music. One distinct isolated effect with a natural short decay. No silence before the action.

seed=84164, requested seconds=2

## r8b-gs_hit_weak-5.wav
A single heavy sword hits a thick metal and leather shield, sharp bright metallic clang with a sustained resonant ringing decay and a solid low thud underneath. Close dry isolated realistic sound. The strike happens immediately. No voice, no music.

seed=85125, requested seconds=2

## r8b-gs_hit_weak-6.wav
A single heavy sword hits a thick metal and leather shield, sharp bright metallic clang with a sustained resonant ringing decay and a solid low thud underneath. Close dry isolated realistic sound. The strike happens immediately. No voice, no music.

seed=85126, requested seconds=2
