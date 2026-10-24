# 태엽 거신 (clock_colossus)
- Source: https://poly.pizza/m/mPDR0L5uKx (Quaternius individual model page "Robot Enemy Large": Animated; Public Domain (CC0), Licence "CC0 1.0", dated Aug 28, 2022, fetched 2026-10-24).
- License: CC0 1.0, https://creativecommons.org/publicdomain/zero/1.0/ . Individual Poly Pizza grant only; not the site-wide QAL.
- Original GLB SHA-256: 1d21ee204a8080897623171baadcd3b4b10fd24c9c959eae2a94c0042a5462d7 (page HTML 7fb8ab885f1bb00b57eb601d1e21ae5fdbe6a875a8aa0e7c7272ba9e332ee8ba). Original GLB and HTML retained offline under C:/Users/user/ai-tools/arpg-art/content-expansion-b7/source/, not published.
- Derivative: native Blender EEVEE eight-direction rigged atlas from the model's own clips: idle=Idle, run=Run, attack=Attack, death=Death.
- Honest fallback: the source has no HitReact clip. The hit state is the opening recoil (source frames 0-5) of the model's own Death clip via bake.py state_ranges. The Root/Body bones are tilted (non-axis-aligned), so no root-lock drivers are applied (root_bones empty); the all-sample framing envelope still bounds every frame.
- Helper mesh "Icosphere" excluded via keep list. Display-only 1.5x atlas scale for the heavy elite; collision radius unchanged. S48 elite lead.
