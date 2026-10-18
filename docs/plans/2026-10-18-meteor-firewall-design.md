# Meteor / Firewall — approved delegated design

The parent/user authorized two focus-only learnable fire spells with existing three slots and aim, no new targeting UI. Apply brainstorming, Karpathy discipline and test-first simulation verification.

## Chosen approach
Host-owned finite zones, not long actor acts (would immobilize casting) or fake projectiles (would collide en route). Existing aim selects the closest hostile within 360px, projected along locked initial facing; manual aim uses a fixed 280px reach. Freeze point at cast start, clamp to arena. Zone spawns only on active; interrupt before active spawns none. Existing cooldown-on-act-end and mana-on-start policy remains.

- Meteor: INT45, 360G, MP32, cooldown10s, windup400ms/recovery300ms, delay700ms after release, radius125, damage100, poise45, knockback160. Fire affinity +25%; existing direct-fire burn applies. Direct impact uses normal dodge/hurt/crit once per target, never per frame.
- Firewall: INT45, 300G, MP24, cooldown8s, windup300ms/recovery250ms, perpendicular line220px, half-width18, lifetime4s, eight pulses at 0/.5/.../3.5s, damage12, no poise/knockback/crit/burn. Periodic environmental contact respects dodge/hurt invulnerability but does not interrupt counters or reroll crits. Successful enemy pulse grants mastery once per cast.
- Friendly targets ignored; hostile skeleton players follow existing teams. No collision. At most32 zones (reject release at cap); finite events. Remove zones on owner absence/death/extraction/team change and stopped/restarted rounds.
- Optional bounded snapshot zones default empty, host emits impact/pulse events. Guest prediction never spawns zones or applies damage. Procedural warning/fall/impact and flame line duration/pulse rendering remains visible reduced-motion. Reuse fire audio only on cast/meteor impact, no pulse spam.

## Verification plan
Commit design, add failing tests for learning/save/mastery and locked/delayed/pulsed host lifecycle, implement minimal content/world/network/render/audio/UI, run targeted and full regression with immutable baseline comparison. Native PC1280/touch390 academy learn/equip/cast and host/guest transport checks, source binding via ARPG_BASE_URL. Report any native/relay limits explicitly; no deployment.
