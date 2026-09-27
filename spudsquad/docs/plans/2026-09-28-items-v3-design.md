# 감자특공대 아이템 v3 · 캐릭터 3종 설계 (2026-09-28)

근거: `2026-09-28-brotato-research.md`(원작 위키 1.1.15.4 수치). 원작 수치·명칭·아트를 복제하지 않고 원칙만 가져온다.

## 원칙
1. **모든 티어에 단점**(원작 약 2/3). 순수 이득은 저가 T1 소형 스탯, 확률 트리거·소환, 최상위 보상에만.
2. **직교 페널티**: 단점은 그 아이템 빌드가 덜 쓰는 축에 붙인다(근접템→원거리 피해, 피해템→사거리/방어/HP, 경제템→방어/속도).
3. **크기**: 페널티 ≈ 이득 가치의 1/3~1/2. 환산 기준 방어 1 ≈ 사거리 10 ≈ 피해 3~4% ≈ 최대HP 2~3.
4. **티어가 오를수록** 수치가 커지고 규칙을 바꾸는 unique가 늘어난다. T4(전설) 신설: 10웨이브부터, 확률 3%+행운/1000.
5. 규칙 변경형(이자·HP 고정·시작 HP 등)은 `unique: true`.

## 기존 아이템 조정 (id 유지)
T1: hot_sauce 피해+8·최대HP-2 / energy_drink 공속+10·피해-3 / vampire_fang 흡혈+3·최대HP-1 / sneakers 속도+8·방어-1 / scope 사거리+40·치명+3·공속-3 / dumbbell 근접+3·최대HP+2·원거리-2 / battery 원거리+3·근접-2 / heart_jar 최대HP+6·속도-2 / feather 회피+6·최대HP-2 / bandana 치명+6·사거리-10. 순수 유지: magnet, clover, bandage, garden_glove, lucky_coin, jam_jar, cactus. 그대로: potato_armor, helmet, coffee.
T2: thorn_armor +속도-3 / whetstone +원거리-3 / gunpowder +방어-1 / piggy_bank unique. 순수 유지: firecracker, spark_plug, treasure_map. 그대로: medkit, piercing_prism(max 2), fracture_round, bounty_badge, thorn_coil.
T3: mirror 피해 -8→-12 / rabbit_foot 행운+25·회피+3·피해-4. 그대로: glass_cannon, turret.

## 신규 아이템 22종
**T1** glasses 안경: 사거리+25(순수) · bent_fork 휜 포크: 피해+6·사거리-12 · beanie 털모자: 속도+5·사거리-8 · whistle 호루라기: 최대HP+2·피해+5·적 수+5% · ghost_sheet 유령 이불: 최대HP+3, 구매 직후 다음 웨이브를 HP 1로 시작(1회).
**T2** sunglasses 선글라스: 치명+8·방어-1 · wheelbarrow 수레: 수확+12·방어-1 · bait 미끼: 피해+8, 다음 웨이브 시작 시 엘리트 1마리(1회) · black_belt 검은 띠: 근접+6·원거리-3 · white_flag 백기: 수확+5·적 수-5% (unique) · vigil_ring 자경단 반지: 웨이브 종료마다 피해+2% 영구 (unique) · robot_arm 로봇 팔: 웨이브 종료마다 근접+2·최대HP-1 · lightning_rod 피뢰침: 재료 주울 때 20%로 무작위 적에게 번개(8+원소).
**T3** statue 감자 석상: 정지 중 공속+40%, 속도-10 · barricade 바리케이드: 정지 중 방어+6, 넉백+15·속도-5 · alien_baby 외계 아기: 최대HP+15, 적 HP+10% · blood_pack 헌혈 팩: 수확+30, 2초마다 HP-1(1 미만으로는 안 떨어짐) · handcuffs 수갑: 근접·원거리·원소+8, 이후 최대HP 증가 불가 (unique) · sad_tomato 시든 토마토: 재생+8, 웨이브를 HP 50%로 시작 (unique) · wisdom_scroll 지혜의 두루마리: 피해-15%로 시작, 웨이브 중 5초마다 피해+5% (unique) · peacock_feather 공작 깃털: XP+25%, 다음 웨이브 XP 2배·적 피해+50%(1회).
**T4** golden_potato 황금 감자: 최대HP+3·재생+2·흡혈+1·피해+5·공속+5·속도+3·회피+3·방어+1·행운+5(순수) · mammoth_fur 매머드 털: 근접+15·재생+4·넉백+30, 피해-8·속도-3 · jetpack 제트팩: 속도+15·회피+10, 최대HP-5·방어-1 · ricochet_coil 도탄 코일: 직선 탄 튕김+1, 피해-25 (unique) · focus_lens 집중 렌즈: 피해+30, 서로 다른 무기 1종마다 공속-3 · anvil 모루: 상점 입장마다 무작위 무기 1개 티어+1 (unique).

## 신규 캐릭터 3종
- soldier 포대감자(권총): 정지 중 피해·공속 +50%, **이동 중 공격 불가**.
- loud 시끌감자(막대기): 피해+30, **적 수+50%**, 웨이브 종료마다 수확-3.
- mutant 돌연변이감자(새총): 레벨업 필요 XP -50%, **아이템·무기 가격 +50%**.

## 근접
판정·표적 사거리 = 기본 + 사거리 스탯×0.5. 모션은 판정 거리까지 실제로 뻗는다(찌르기·휘두르기 호·내려찍기 비행). 사거리 보너스 100당 쿨다운 +5% (원작: 뻗는 거리만큼 소폭 느려짐).

## 검증
각 신규 효과 단위 테스트, 3개 언어 이름·설명 100% 존재(설명 없는 아이템 0개) 테스트, 16시드 밸런스 pass 유지.
