# 태엽 갈퀴 드론 (clock_drone)
- Source: https://poly.pizza/m/lF3jeRJwiH (Quaternius individual model page "Robot Enemy Flying": Animated; Public Domain (CC0), Licence "CC0 1.0", dated Aug 28, 2022, fetched 2026-10-24).
- License: CC0 1.0, https://creativecommons.org/publicdomain/zero/1.0/ . Individual Poly Pizza grant only; not the site-wide QAL.
- Original GLB SHA-256: 7e3a27532b43807b375e3d3ad9cbe1f7e20d8bb723f2dcc2a3c9efb38da73a5b (page HTML c74f8dd141ad80c215b22661ba316cc0053dfb3af7e3c3260459e40e0b3e1ef0). Original GLB and HTML retained offline under C:/Users/user/ai-tools/arpg-art/content-expansion-b7/source/, not published.
- Derivative: native Blender EEVEE eight-direction rigged atlas from the model's own clips: idle=Idle, run=Run, attack=Attack, death=Dead.
- Honest fallback: the source has no HitReact clip. The hit state is the opening recoil (source frames 0-4) of the model's own Dead clip, selected with bake.py state_ranges; no other model's motion or synthetic pose. Dead is only 8 source frames, so death has 2 baked frames per direction.
- Helper mesh "Icosphere" (42-vertex non-character helper) excluded via keep list. Diving claw drone: dash + claw slash.
