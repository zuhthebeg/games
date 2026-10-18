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

## Authorized dependent bow extension (msg30584)
Same owner/tree; no new writers. Add `rain_arrow` (레인 애로우) and `spinning_shot` (회전 사격), AGI45 books, three-slot/save/mastery lifecycle.

- Rain arrow: 300G, MP24, cooldown8s; windup300ms/recovery250ms; locked/clamped existing aim (range360/fallback280), radius90; release delay300ms, four 16-damage pulses at .3/.6/.9/1.2s after release, lifetime1.5s from release. No crit/poise/knockback; physical bow scaling/silver specialization and armor apply, no blade twohand bonus. Dodgeable contact each pulse, allies safe. Finite falling-arrow geometry, not mapwide.
- Spinning shot: 280G, MP22, cooldown7s; windup200ms/active1200ms/recovery250ms; twelve single physical arrows at 100ms intervals, headings 0/30/…/330deg relative to initial facing, actual actor turns through 360deg over active. Damage14/poise5/knockback35, speed650/range420/radius6. Normal projectile collision and hostile-only damage. Interrupt stops unreleased arrows; caster departure/death/extraction clears these projectiles. No extra charge per arrow.

Extend tests first, then scheduler/prediction/presentation/registries/native PC+touch cases. Shared `ui/hub.js:openSkill` currently assumes every skill has shape/projectile/etc and crashes for new zone delivery; reserved owner/parent must add a zone range branch before release. No shared hub/main/lobby/session writes from this owner.
