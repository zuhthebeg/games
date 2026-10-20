# Protective shield real mastery growth

Mastery stays Lv1–30 and existing successful-cast XP policy is unchanged.

- Charges: Lv1–9 = 1, Lv10–19 = 2, Lv20–30 = 3.
- Duration: `8000 + floor((level - 1) * 4000 / 29)` ms; simulation rounds to its existing nearest 30Hz tick. Lv1 8s, Lv30 12s.
- MP22, cooldown12s, radius160, all weapon families: unchanged. No continuous invulnerability.
- Capture growth at accepted cast start. Every living friendly pawn inside the radius receives its own charge pool.
- Recast replaces with the new caster's max charges and full duration, never adds pools or preserves a stronger old pool.
- Every valid hostile damaging contact consumes one charge and prevents that contact's damage/status effects. Invalid/dodged/iframe-rejected contacts do not consume charges. Shield blocking creates no extra hurt iframe: simultaneous projectiles and separate simultaneous AoE contacts each consume one charge in deterministic simulation order, overflow damages normally. A single AoE consumes one per eligible target, not one shared party pool. Existing attack target dedup remains unchanged.
- Preserve existing burn/DoT behavior: positive hostile periodic ticks consume charges, bypassing ordinary direct-hit dodge/hurt gates as before. Physical perfect guard still resolves first and does not consume the spell shield.
- Expiry and death remove both duration and charges. Host alone grants/consumes; the snapshot transports charges and expiry; guest prediction copies presentation and does not grant/consume them.
- Static shield-shaped pips on each shielded pawn represent remaining charges (max three); no new text HUD clutter or animation. Compatible with reduced-motion. Current/next skill descriptions share canonical growth.

| Mastery | Before charges/duration | After charges/duration (authored ms) |
|---|---|---|
| 1 | 1 / 8s | 1 / 8s |
| 5 | 1 / 8s | 1 / 8.551s |
| 10 | 1 / 8s | 2 / 9.241s |
| 15 | 1 / 8s | 2 / 9.931s |
| 20 | 1 / 8s | 3 / 10.620s |
| 25 | 1 / 8s | 3 / 11.310s |
| 30 | 1 / 8s | 3 / 12s |

Existing support-magic Lv1 fixed assertions are retained explicitly as Lv1 behavior; staff-magic's INT/weapon independence regression now checks mastery levels 1/10/20/30 rather than implying all mastery is fixed.

Trainer/detail legacy UI tests now assert the concise Lv1 `1회 방어 · 8초` wording; first full comparison found only these two stale wording expectations beyond identical pre-existing failures, and both are intentionally updated.
