# 감자특공대 v2 — 전투감·빌드 다양성 업그레이드 브리프

v1(`2026-09-27-spudsquad-brief.md`)은 유효하다. 이 문서는 v1 위에 얹는 변경만 정의한다. 충돌하면 **이 문서가 우선**.
목표: "쏘고 맞추는 맛"과 "판마다 다른 빌드". 판단 기준은 한 줄 — **플레이어가 선택으로 빌드 정체성을 만들 수 있는가, 맞출 때 손맛이 있는가.**

작업 레포 `/mnt/c/Users/user/games`, 게임 `spudsquad/`. 규칙은 v1 §2 그대로(전역 충돌 금지, SharedWallet, no-cache, node --check 등). 추가로:
- 이번에 손대는 파일은 **일반 포맷**(한 줄 ≤ 160자). `data.js`도 표 형태로 풀어 써라.
- 새 에셋은 `spudsquad/assets/`에 생성 중(§8). 없으면 폴백 렌더.

## 1. 전투감(타격감) — 가장 먼저, 가장 중요

### 1.1 명중 피드백 (모든 무기 공통)
- **적 흰 플래시** 0.08s + **스쿼시**(명중 순간 x1.25/y0.8 → 0.12s 복귀).
- **넉백**: 무기별 `kb`(px/s 초기속도, 0.15s 감쇠). tank·boss·shielder는 넉백 ×0.25. 넉백은 호스트 시뮬에 실제 위치로 반영(게스트는 스냅샷 보간으로 자연히 보임).
- **히트스톱**: 치명타 또는 적 처치 시 **로컬 렌더만** 40ms 정지(시뮬은 계속, 네트워크 영향 0). 초당 최대 4회(연쇄 처치 때 끊김 방지).
- **데미지 숫자**: 튀어오르며(위로 30px + 좌우 랜덤) 0.6s 페이드. 일반=흰, 치명=노랑+1.5배+"!", 원소=주황/하늘. 같은 적에게 0.1s 내 연타는 숫자 합산.
- **처치 연출**: 스쿼시 팝 → 적 색 파티클 8~14개 방사 + 재료 튀어나옴(포물선 0.25s). 보스 처치는 화면 흰 번쩍 + 슬로모 0.4s(로컬 렌더 속도 0.3).
- **화면 흔들림**: 본인 피격(4px), 폭발(반경 내 있으면 3px), 보스 등장/처치(8px). 설정 토글로 끌 수 있게(접근성, localStorage).

### 1.2 무기 연출
- **원거리**: 발사 시 총구 섬광(무기 스프라이트 끝 6프레임 흰-노랑 원), 무기 반동(발사 방향 반대로 6px 밀렸다 복귀), 투사체 꼬리(최근 3위치 잔상), 착탄 스파크(4~6점).
- **근접**: 무기 스프라이트가 **실제로 움직여야 한다**.
  - `thrust`(주먹/단검/창): 대상 방향으로 사거리만큼 0.12s 뻗었다 0.15s 복귀. 판정은 뻗는 선분.
  - `sweep`(막대기): 대상 방향 기준 −60°→+60° 호를 0.18s에 휘두름 + 흰 초승달 트레일. 판정은 호 안 전원.
  - `slam`(망치): 0.2s 들어올렸다 내려찍음 → 착지 지점 반경 원형 충격파 링 + 흔들림 2px.
- **궤도 배치**: 무기 슬롯이 캐릭터 주위 원(반경 34px)에 균등 배치, 각 무기는 자기 목표를 향해 회전. 근접 무기는 공격 중에만 궤도를 벗어남.

### 1.3 사운드 (WebAudio 절차 합성, 파일 없음)
`SPUD.sfx(name, {pitch})` 구현. 이름: `shot`(짧은 노이즈 탭), `laser`(사인 하강 스윕), `boom`(저역 노이즈 버스트), `swing`(필터 노이즈 휙), `hit`(짧은 클릭), `crit`(hit+고음), `kill`(팝), `pick`(재료, 음정 연속 상승 — 0.3s 내 연속 줍기면 반음씩 올라감), `hurt`, `lvl`, `buy`, `wave`.
- 동일 사운드 초당 상한(shot 12, hit 16) + 피치 ±8% 랜덤. 마스터 볼륨·음소거 토글(🔊 버튼, localStorage). 첫 사용자 입력 전엔 AudioContext 생성 금지.

## 2. 무기: 8 → 14종, 클래스 + 세트 보너스 + 상태이상

클래스(한 무기가 여러 클래스 가능): `unarmed` `blade` `blunt` `gun` `precise` `explosive` `elemental`.
**세트 보너스**: 같은 클래스 무기를 2/3/4/6개 들면 아래 보너스(서로 다른 무기·같은 무기 중복 모두 카운트). 상점·스탯 패널에 현재 세트 단계 표시.

| 클래스 | 2 | 3 | 4 | 6 |
|---|---|---|---|---|
| unarmed | dodge+3 | dodge+6 | dodge+9, melee+2 | dodge+15, melee+4 |
| blade | lifesteal+2 | +4 | +6, crit+5 | +10, crit+10 |
| blunt | maxHp+3 | +6, armor+1 | +9, armor+2 | +15, armor+4 |
| gun | range+20 | +40 | +60, atkSpd+5 | +100, atkSpd+10 |
| precise | crit+3 | +6 | +9 | +15 |
| explosive | explosion+10% | +20% | +30% | +50% |
| elemental | elemental+2 | +4 | +6 | +10 |

| id | 클래스 | 동작 | 피해(T1) | 쿨 | 사거리 | kb | 특수 | 가격 |
|---|---|---|---|---|---|---|---|---|
| fist | unarmed | thrust | 8 | 0.9 | 110 | 220 | — | 15 |
| dagger(신) | blade,precise | thrust | 6 | 0.55 | 100 | 80 | 치명 시 출혈(2초간 초당 피해의 25%), 치명 +10 | 22 |
| spear(신) | blade | thrust | 11 | 1.2 | 200 | 150 | 선분 관통(경로 전원) | 28 |
| stick | blunt | sweep | 12 | 1.3 | 150 | 260 | — | 20 |
| hammer(신) | blunt | slam | 26 | 2.0 | 130 | 380 | 착지 반경 80 전원 | 38 |
| slingshot | precise | projectile | 10 | 1.2 | 380 | 60 | 튕김 1 | 18 |
| pistol | gun | projectile | 12 | 1.0 | 420 | 80 | 관통 1 | 22 |
| shotgun | gun | projectile×4 | 6 | 1.6 | 280 | 140 | 30° 산탄 | 30 |
| smg | gun | projectile | 4 | 0.25 | 360 | 30 | 8° 퍼짐 | 32 |
| crossbow(신) | precise | projectile | 16 | 1.4 | 480 | 90 | 관통 2, 치명 +15 | 34 |
| laser | elemental,precise | beam | 18 | 1.8 | 520 | 0 | 무한 관통 | 38 |
| rocket | explosive,gun | projectile | 22 | 2.2 | 450 | 200 | 반경 70 폭발 | 45 |
| flamethrower(신) | elemental | cone | 3 | 0.15 | 190 | 20 | 40° 원뿔, 화상(3초 초당 2+elemental), 중첩 안 됨(갱신) | 40 |
| staff(신) | elemental | chain | 10 | 1.3 | 400 | 0 | 번개 연쇄 3회(연쇄당 피해 ×0.8, 400px 내 다음 적) | 36 |

- 피해 공식: `(base×tierMul + 해당스탯) × (1+dmg%)`. 해당스탯: thrust/sweep/slam=melee, projectile/beam=ranged, cone/chain/화상/출혈=elemental, 폭발은 ranged 후 `×(1+explosion%)`. 티어 배율 v1 유지(×1.6/티어, 쿨 ×0.9).
- 새 스탯: `elemental`(정수), `explosion`(%), `thorns`(정수, 접촉 피격 시 가해자에게), `projectiles`(정수, projectile 무기 발사 수 +n, 5°씩 퍼짐), `knockback`(%).

## 3. 캐릭터: 4 → 10종 (규칙을 바꾸는 특성이 핵심)

수치 보정만 있는 캐릭터는 금지. 각자 **하나 이상의 규칙 변경**을 가진다. 선택 화면에 특성 문장 1~2줄(3개국어).

| id | 이름 | 시작무기 | 보정 | 규칙 변경 |
|---|---|---|---|---|
| basic | 기본감자 | pistol | 없음 | 상점 첫 리롤 매 웨이브 무료 |
| muscle | 근육감자 | fist | maxHp+5, melee+3, speed−5, ranged−3 | 근육 넉백 +50% |
| science | 과학감자 | laser | elemental+3, range+40, maxHp−3 | 원소 피해 +25% |
| lucky | 행운감자 | slingshot | luck+25, harvest+8, dmg−10 | 적 처치 시 2% 확률 상자 드롭 |
| gunslinger(신) | 총잡이감자 | pistol×2 | atkSpd+10 | gun 클래스 피해 +20%, **근접무기 상점에 안 나옴** |
| berserker(신) | 광전사감자 | stick | maxHp+10, armor−2 | 잃은 HP 10%당 dmg +6%(최대 +60%), regen 0 고정 |
| vampire(신) | 흡혈감자 | dagger | lifesteal+10 | regen 항상 0, 웨이브 시작 HP 50% |
| bomber(신) | 폭탄감자 | rocket | explosion+30 | 적 처치 시 10% 확률 반경 60 폭발(8+explosion%), 자폭 피해 없음 |
| cyclops(신) | 외눈감자 | crossbow | crit+10 | **무기 슬롯 1개**, 그 무기 피해 ×2.5·공속 +40% |
| ghost(신) | 유령감자 | staff | dodge+30, speed+10, maxHp−50%(반올림) | 회피 성공 시 0.5초 무적 + 다음 공격 확정 치명 |

## 4. 성장 전략 레이어

### 4.1 레벨업 등급
업그레이드 4지선다 각각 등급 롤: 일반(회) 70 / 희귀(파) 22 / 에픽(보) 7 / 전설(주황) 1 (%), luck 1당 희귀 이상 확률 상대 +1%. 수치 배율 ×1 / ×1.6 / ×2.4 / ×3.5. 카드 테두리 색 + 등급명. 업그레이드 목록에 새 스탯(elemental, explosion%, thorns, knockback%) 추가, **리롤 1회/레벨업**(비용 = 웨이브 수 재료).

### 4.2 아이템: 16 → 32종 + 등급
기존 16은 등급 T1. 신규 16(아이콘 생성 중):
| id | 등급 | 효과 | 가격 |
|---|---|---|---|
| thorn_armor | T2 | armor+2, thorns+5 | 45 |
| mirror | T3 | projectiles+1, dmg−8 | 70 |
| firecracker | T2 | 적 처치 시 8% 반경 60 폭발(8) | 50 |
| jam_jar | T1 | 재료 줍기 시 3% 확률 HP+1 | 25 |
| coffee | T1 | atkSpd+15, maxHp−2 | 30 |
| piggy_bank | T2 | 웨이브 시작 시 보유 재료 10% 이자(최대 +20) | 45 |
| glass_cannon | T3 | dmg+25, armor−3 | 65 |
| bandana | T1 | crit+6, melee+1 | 30 |
| cactus | T1 | thorns+3, maxHp+3 | 30 |
| whetstone | T2 | melee+4, knockback+30 | 45 |
| gunpowder | T2 | explosion+25 | 45 |
| spark_plug | T2 | elemental+3, 원소 피해 +15% | 50 |
| medkit | T2 | regen+3, speed−2 | 45 |
| rabbit_foot | T3 | luck+20, dodge+3 | 70 |
| turret | T3 | 웨이브 시작 시 내 위치에 포탑(1.5s마다 가장 가까운 적에게 8+ranged, 사거리 350) 중첩 시 포탑 수 증가 | 80 |
| treasure_map | T2 | 상자 드롭률 +50% | 40 |

상점 등급 출현: 웨이브 1~3 T1만, 4+ T2(확률 25%+luck/4), 8+ T3(10%+luck/6), 15+ T4 무기만. 아이템 가격도 웨이브 스케일(v1 공식). 아이템 카드에 등급 색.

### 4.3 상자(crate) — 아이템 파밍 루프
- 웨이브당 기본 1개 확률 드롭(적 처치 시 1.5%, 웨이브당 최대 2개, treasure_map/lucky 보정), 바닥에 `item_crate` 스프라이트 + 반짝임.
- 줍기 → 웨이브 종료 후 상점 전에 **상자 열기 화면**: 무작위 아이템 1개(웨이브 기준 등급) → [가져가기] / [재활용: 가격 50% 재료]. 협동은 주운 사람만.

### 4.4 적 다양화 (신규 2)
| id | HP | 속도 | 접촉 | 첫 | 행동 | 재료 |
|---|---|---|---|---|---|---|
| exploder | 12 | 120 | 0 | 4 | 플레이어 60px 내 접근 시 0.6s 깜빡임 후 반경 70 폭발(3+w/4), 처치 시에도 폭발(적에게도 피해) | 2 |
| shielder | 30 | 60 | 1 | 7 | 반경 140 아군에 보호막(받는 피해 −50%, 청록 원), 플레이어와 거리 300 유지 | 3 |
보스 패턴에 exploder 소환 추가(boss_2).

## 5. 넷코드 추가
- fx 이벤트 추가: `['sw', uid, slot, angle, action]`(근접 모션: thrust/sweep/slam), `['bm', x1,y1,x2,y2,kind]`(빔/연쇄 번개/화염 원뿔), `['ex', x, y, r]`(폭발), `['st', eid, status]`(화상/출혈/보호막 표시), `['cr', id, x, y]`/`['crp', id, uid]`(상자 생성/획득), `['bt', uid]`(유령 무적 발동).
- 스냅샷 적 배열에 상태 비트 필드 1개 추가(`flags`: 1=화상,2=출혈,4=보호막,8=흰플래시). 크기 목표 < 8KB 유지.
- 히트스톱·슬로모·흔들림·사운드는 **전부 로컬 렌더 효과**, 시뮬 시간에 영향 금지(호스트 시뮬이 느려지면 전원이 느려진다).
- 협동 동료 이름: roster의 `nick` 사용(현재 uid 노출 버그). 동료 HP바 옆에 캐릭터 아이콘.

## 6. v1 잔여 버그/폴리시
- 배경 `bg_ground` 교체됨(밝은 톤) — 필요 시 타일 이음새 보정(가장자리 크로스페이드).
- 모바일 상점: 카드 설명 2줄 말줄임 + 카드 탭 시 상세 시트.
- 대기실 문구는 공용 로비(한국어 고정) — 건드리지 말고 NOTES에 기록만.

## 7. 코드 구조 변경
- `sim.js` `step()` 거대 함수 분해: `behaviors = {thrust, sweep, slam, projectile, beam, cone, chain}` 테이블 + `applyStatus`, `explode(w, x, y, r, dmg, owner)`, `onKill` 훅 체인(캐릭터·아이템 트리거). 캐릭터/아이템 특수효과는 data.js 선언 + sim의 훅 레지스트리로(if 사다리 금지).
- 새 파일 `js/sfx.js`(WebAudio), `js/fx.js`(파티클·숫자·트레일·히트스톱 로컬 이펙트) — render.js 비대화 방지.

## 8. 에셋 (생성 중, 이름 고정)
캐릭터 `char_{gunslinger,berserker,vampire,bomber,cyclops,ghost}`, 무기 `weapon_{dagger,spear,hammer,flamethrower,staff,crossbow}`, 적 `enemy_{exploder,shielder}`, 아이템 `item_{thorn_armor,mirror,firecracker,jam_jar,coffee,piggy_bank,glass_cannon,bandana,cactus,whetstone,gunpowder,spark_plug,medkit,rabbit_foot,turret,treasure_map}`, 상자 `item_crate`, 배경 `bg_ground`(교체). 크기 규칙 v1 §7, exploder 44 / shielder 56.

## 9. 검증 (완료 조건)
1. 기존+신규 node 테스트 전부 통과. 신규 최소: 세트 보너스 단계 계산, 14무기 각 behavior 명중 판정(thrust 선분/sweep 호/slam 원/cone/chain 3연쇄 감쇠), 화상 갱신·출혈, 캐릭터 10종 규칙(총잡이 상점 근접 제외, 외눈 슬롯1·배율, 광전사 HP비례, 흡혈 regen0·시작50%, 유령 회피 무적), 레벨업 등급 분포(10만 롤 ±1%), 상자 드롭 상한, exploder 폭발 피아 피해, shielder 감쇠, 스냅샷 < 8KB(flags 포함).
2. **밸런스 시뮬** `spudsquad/test/balance.mjs`: 헤드리스 솔로 봇(가장 가까운 적 반대 방향 카이팅 + 재료 쪽 이동 가중, 상점은 "현재 세트 클래스 우선 → 없으면 가장 비싼 살 수 있는 것", 레벨업은 등급 높은 것) × 캐릭터 10종 × 시드 20판, 결과표(평균 도달 웨이브, 중앙값, 20웨이브 클리어율)를 `spudsquad/BALANCE.md`에 기록. 목표: 기본감자 평균 도달 웨이브 9~14, **어떤 캐릭터도 평균이 전체 평균의 ±40% 밖이면 안 됨**, 보스 웨이브 클리어율 0% 또는 100%인 캐릭터 없음. 벗어나면 data.js 수치만 조정해 재실행(최대 5회, 조정 내역 기록).
3. ws-smoke, 모든 js node --check, index.html 인라인 추출 체크, 헤드리스 브라우저 솔로 20초(에러 0).
4. 커밋(push 금지). 최종 보고: 커밋 해시, BALANCE.md 표, 테스트 출력 요약, 미구현/한계.

## 10. 범위 밖
호스트 마이그레이션, 영구 해금/메타 진행, PvP, 음악(BGM).
