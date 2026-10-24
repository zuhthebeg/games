# 태엽 포격 보행기 (clock_walker)
- Source: https://poly.pizza/m/lFZfDh2hzP (Quaternius individual model page "Robot Enemy Legs Gun": Animated; Public Domain (CC0), Licence "CC0 1.0", dated Aug 28, 2022, fetched 2026-10-24).
- License: CC0 1.0, https://creativecommons.org/publicdomain/zero/1.0/ . Individual Poly Pizza grant only; not the site-wide QAL.
- Original GLB SHA-256: fda86deed47bef0877f0e890de60c41101ca2f06937834b25110392b8b2afd7c (page HTML c66aa696d4f4fd6e1c4ad12ec9c274a6d16aecbf19bf718a7304b2d93b22d075). Original GLB and HTML retained offline under C:/Users/user/ai-tools/arpg-art/content-expansion-b7/source/, not published.
- Derivative: native Blender EEVEE eight-direction rigged atlas from the model's own clips: idle=Idle, run=Run, attack=Attack, death=Death. Baked at 5 fps (same clip durations) to stay inside the 16 MiB decoded budget on one sheet.
- Honest fallback: the source has no HitReact clip. The hit state is the opening recoil (source frames 0-6) of the model's own Death clip via bake.py state_ranges.
- Helper mesh "Icosphere" excluded via keep list. Rivet-gun walker: ranged shot + leg stomp.
