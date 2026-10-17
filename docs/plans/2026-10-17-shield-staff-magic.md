# Shield, weapon dodge and staff magic implementation plan

**Goal:** Implement approved next task shield/weapon-specific dodge, plus user's explicit staff/non-staff magic rules.
**Architecture:** Shared content rules drive save/loadout/UI/prediction and host-authoritative simulation. No hidden client-only enforcement; preserve old saves and input queue bounds.
**Tech Stack:** JavaScript native modules, deterministic Node tests, Pixi browser app.

## User constraints
- Non-focus equipment may still cast ordinary magic, but offensive spells and healing are weaker; intelligence scaling remains. Protective shield is exempt.
- Turn Undead and Flame Ring require a magic implement (existing focus family: wand/staff). No payment or phantom cast when blocked.
- FINAL user steering supersedes additional penalty design: '보통 지팡이에 지력, 지혜 수치를 알파로 주면되겟네'. Add native INT/WIS bonuses to magic implement definitions, derive only while actually equipped; no raw save stat grants, no new non-staff penalty mechanism.
- Simple tuning default: each focus weapon grants INT+6/WIS+6 (existing6point unit), independently from random affixes. Existing non-focus offensive share0.6 stays unchanged and applies once. Healing gains existing magic INT factor `1+focusDamage*eff(effectiveInt)` so gear INT naturally strengthens it, while retaining base30%/holy bonus/missingHP cap. Do not apply weapon power or a new0.6healing multiplier. Protective shield unchanged.
- Preserve ranges, status durations and visuals. Turn/FlameRing focus-only. Both wand/staff count as existing magic-implement family. Display actual innate stats and preserve existing saves across equip/unequip/reload.
- Physical shield/weapon-specific dodge follows existing counter-identity-v1 architecture; inspect actual equipment/render paths before minimal real integration. Numeric defaults may reuse documented proposal; describe them and don't claim separately user-chosen.

## Sequential implementation ownership
1. Read-only shield/weapon preflight identifies save/equipment/render/host/prediction paths. Parent writes accepted scope after report.
2. One implementer changes magic damage/heal/gating first, TDD then focused regressions, commit and report. Keep shared sim changes sequential with shield implementation.
3. Same owner implements physical shields/weapon-specific counter identity once context/scope delivered; real acquisition/equip/save/combat/HUD/net, not debug-only.
4. Independent spec review then quality review. Fix blockers with same implementer and re-review.
5. Parent stamps ordinary/lab entries, integrates/pushes, verifies Pages and live source binding, native PC390/actual cooperative behavior. No screenshots/user-save access.

## Verification
- Real INT/WIS bonus derived exactly once only when equipped, stacking existing affixes without permanent allocated changes. Existing non-focus offense share once, low/high INT healing, undead healing damage, shield exemption.
- Rejected staff-only skill equipped on other weapon costs neither MP nor cooldown, host/prediction/UI agree, saved learned/loadout history retained.
- Guard frontal/side/rear and cooldown, genuine contact-only perfect counter, focus blink+bounded reset, bow critical/blade double attack once, timestamps and queue bounds preserved.
- Existing known unrelated frozen trace failures distinguished by baseline reproduction; don't rewrite fixtures to hide behavior.
- Task completion/failure report files registered in ops/task-notify/reports.json; exact #PASS/#BLOCKED final report triggers immediate user notification. Parent follows through to release.
