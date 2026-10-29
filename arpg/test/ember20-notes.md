# Local C2 candidate, not release approval

Parent tuning: same ember ID/MP14/CD2600/windup/recovery; Lv20..30 replaces ground projectile with locked point warning then release+12 host tick impact. Circle equality includes target.r; inner12 overlap wins base60, outer117 overlap base36, once per target. Existing applyHit handles burn, crit, protection and credit. Shield/clash bodies no longer intercept falling impact (intended). Area117 vs78 =2.25x area; single recipient inner base60 versus outer36, up to N recipients once each: NOT DPS neutral. Warning fixed400ms vs old projectile travel0..1077ms.

Capacity: accepted unfired zone acts themselves reserve slots (zones.length + other unfired zone acts); existing zones use same accounting. Sequential deterministic entity order ensures no more than32 including four players. endAct removes reservation; release transfers to one zone. Owner death/terminal/channel/end/leave cancels ember pending; postrelease stagger/walking never moves/cancels point.

Historical conflict resolved: the bare level map and live setMastery values are render metadata, not evolved-combat admission. Validated rewardSave alone grants ember20 combat capability; unchanged skill-mastery-net.test.js passes all4 tests. The final origin-fix/review and parent release reports supersede this initial local-candidate note; it is not current release adjudication.

Focused10 C2 tests plus C1/zone/prediction/save/cloud/projectile suite68 pass. Additional handshake159 and VFX159 pass. Exact pinned fullworld/event comparisons10 original skills Lv1/19 and C1/meteor1..30 pass, no field exclusions. Full suite baseline2121/2060/61 reconfirmed. Final full suite separately logged.

Unverified: exhaustive shield/iframe/rewind and settlement reload per C2,100casts/resume every phase, every adversarial marker relation/range from original cast origin, actual browser PC/touch/cooperative attribution and production. Do not treat local candidate as satisfying all parent gates.
