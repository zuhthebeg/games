# Brotato 디자인 다이제스트 (감자특공대용)

출처: brotato.wiki.spellsandguns.com의 MediaWiki API(`api.php?action=parse`)로 wikitext를 직접 받아서 정리했다. 위키 표기 버전은 1.1.15.4이고, 조사일은 2026-09-28이다.
숫자는 위키의 데이터 템플릿(Template:Item Data / Character Data / Weapon Data)에서 그대로 옮겼다. "(추정)"이나 "(미검증)"이 붙은 항목은 위키에서 확인하지 못한 내용이다.
아이템 통계는 **바닐라만** 셌다(Abyssal Terrors DLC 제외).

---

## 1. 아이템 트레이드오프 설계 (Tier 1~4)

### 핵심 발견: "저티어=순수 보너스, 고티어=페널티" 가설은 틀렸다
단점 줄이 붙은 아이템 비율이 **모든 티어에서 2/3 안팎**이다. 티어가 올라갈 때 바뀌는 건 페널티가 붙느냐가 아니라 수치의 크기와 규칙을 비트는 효과(unique)다.

| Tier | 바닐라 수 | 음수 스탯 줄 있음 | 조건부 단점 포함 | 순수 이득 | unique(1개 제한) |
|---|---|---|---|---|---|
| I (흰) | 57 | 38 | 41 | 16 | 4 |
| II (파) | 60 | 33 | 39 | 21 | 9 |
| III (보) | 58 | 35 | 43 | 15 | 19 |
| IV (빨) | 36 | 22 | 27 | 9 | 14 |

- 가격: T1은 기본가 15~30, T2는 30~65, T3는 50~100, T4는 90~130이다. 상점 가격 공식은 `(Base + Wave + Base*0.1*Wave) * 가격배율`이다(Shop 페이지).
- 등장 웨이브: T2는 2웨이브부터, T3는 4웨이브부터, T4는 8웨이브부터 나온다. 웨이브당 확률 증가폭과 최대치는 T2 +6%/60%, T3 +2%/25%, T4 +0.23%/8%이고, 여기에 `(100%+Luck)`이 곱해진다.

### 대표 아이템 25개 (정확한 수치)
**Tier I**
- Coffee: +10% Attack Speed, -2% Damage
- Head Injury: +6% Damage, -8 Range
- Injection: +7% Damage, -2 Max HP
- Helmet: +1 Armor, -2% Speed
- Beanie: +4% Speed, -6 Range
- Gentle Alien: +2 Max HP, +5% Damage, **+5% Enemies** (적 수 증가가 페널티)
- Weird Ghost: +3 Max HP, **다음 웨이브를 HP 1로 시작**
- Glasses: +20 Range (순수 이득) / Pencil: +1 Engineering (순수 이득, $8)
- Lumberjack Shirt: 나무가 한 방에 죽음 (unique)
- Ugly Tooth: 적중 시 적 속도 -5%(최대 -20%), 대신 자기 -3% Speed (unique)

**Tier II**
- Cyclops Worm: +12% Damage, -12 Range
- Mastery: +6 Melee Damage, -3 Ranged Damage (빌드를 고정시키는 형태)
- Sunglasses: +10% Crit, -1 Armor
- Wheelbarrow: +16 Harvesting, -1 Armor
- Bait: +8% Damage, **다음 웨이브 시작 때 특수 적 등장**
- Piggy Bank: 웨이브 시작 시 보유 재료의 +20%(이자), wave 20에 끝남 (unique)
- White Flag: +5 Harvesting, -5% Enemies (unique)

**Tier III**
- Glass Cannon: +25% Damage, -3 Armor
- Alien Baby: +15 Max HP, **+10% Enemy health**
- Statue: 가만히 있을 때 +40% Attack Speed, -10% Speed
- Barricade: +3 Knockback, 가만히 있을 때 +8 Armor, -5% Speed
- Blood Donation: +40 Harvesting, **초당 1 피해**
- Handcuffs: 근접/원거리/속성 피해 각 +8, **Max HP가 현재값으로 고정** (unique)
- Sad Tomato: +8 HP Regen, **웨이브를 HP -50%로 시작** (unique)
- Wisdom: 5초마다 +5% Damage(웨이브 끝까지 누적), 시작 -15% Damage (unique, 시간 누적형)
- Peacock: +25% XP, 다음 웨이브 XP +100%, **다음 웨이브 적 피해 +50%** (일회성 도박)

**Tier IV**
- Potato: +3 MaxHP, +2 Regen, +1% LS, +5% Dmg, +5% AS, +3% Speed, +3% Dodge, +1 Armor, +5 Luck (전부 이득, Well Rounded로 클리어해야 해금)
- Mammoth: +20 Melee, +5 Regen, +5 Knockback, -8% Damage, -3% Speed
- Jet Pack: +15% Speed, +10% Dodge, -5 Max HP, -1 Armor
- Ricochet: 투사체 튕김 +1, -25% Damage
- Focus: +30% Damage, 보유한 서로 다른 무기 1종마다 -3% Attack Speed
- Torture: +15 Max HP, 초당 5 회복, **다른 모든 회복 불가** (unique)
- Anvil: 상점에 들어갈 때 무작위 무기 1개 티어업 (unique, Arms Dealer 클리어로 해금)

### 패턴 요약
1. **직교 페널티.** 단점은 대개 "지금 빌드가 잘 안 쓰는 스탯"에 붙는다. 근접 아이템은 Ranged Damage를 깎고, 피해 아이템은 Range·Armor·MaxHP를, 경제 아이템은 Armor·Speed·Dodge를 깎는다. 아이템 하나를 고르는 순간 빌드 방향이 정해지게 만드는 장치다. 가장 자주 깎이는 스탯은 %Damage, Range, Speed, Attack Speed, Armor, HP Regen, Luck, Harvesting 순이다.
2. **크기 비율.** 대체로 페널티가 이득 가치의 1/3~1/2 정도다(+10%AS/-2%Dmg, +25%Dmg/-3Armor). 스탯 간 환산은 대략 Armor 1 ≈ Range 8~10 ≈ Damage 3~4% ≈ MaxHP 2~3 수준이다(가격대 비교로 본 추정).
3. **순수 이득 아이템**은 T1 저가 소형 스탯(Glasses, Pencil, Lemonade, Dynamite), 소환 계열(Turret, Landmines, Garden, Ratzilla), 확률 트리거(Baby Elephant, Cyberball), 그리고 최상위 보상(Potato, Silver Bullet)이다.
4. **Unique/limit.** unique(1개 제한)는 T3·T4에 몰려 있다. 효과가 "규칙 변경"이라 중첩되면 게임이 깨지는 것들이다(스탯 캡, 회복 방식 변경, 이자, 스탯 간 변환). 일반 아이템에도 스택 제한이 있다: Coupon 5, Bag 3, Baby Gecko 4, Dangerous Bunny 3, Metal Detector 20.
5. **변환형 스탯**(빌드 엔진 역할): Coil(Knockback 1당 +1% Dmg), Power Generator(Speed 1%당 Dmg 1%), Stone Skin(Armor 1당 MaxHP 1), Lucky Coin(Crit 1%당 Luck 2), Retromation's Hoodie(Dodge 1%당 AS 2%, -80 Range).
6. **조건부/트리거 효과**
   - 처치 시: Rip and Tear(20% 확률로 폭발), Baby with a Beard(시체에서 총알 발사), Cyberball, Tentacle(치명타 처치 시 회복)
   - 피격 시: Triangle of Power(+20% Dmg였다가 피격마다 -2%), Masochist(피격마다 +5%)
   - 회피 시: Riposte(반격), Adrenaline(50% 확률로 5 회복)
   - 웨이브 시작/종료: Piggy Bank, Vigilante Ring(종료마다 +3% Dmg 영구), Robot Arm(종료마다 +3 Melee, -1 MaxHP), Grind's Magical Leaf, Ashes(종료마다 -1 Armor)
   - 정지 시: Statue, Barricade, Chameleon(+20% Dodge)
   - 재료 획득 시: Cute Monkey(8% 확률로 1 회복), Baby Elephant(25% 확률로 무작위 적에게 피해)
   - 레벨업 시: Decomposing Flesh(+1% LS / -1 MaxHP), Baby Squid
7. **"적을 강하게 만드는" 페널티**(+% Enemies, +Enemy health, 특수적 소환)는 재료와 XP를 더 주는 리스크-리워드 구조로 쓰인다.

---

## 2. 스탯 목록과 사거리(Range)

**1차 스탯**(아이템과 레벨업으로 올린다): Max HP, HP Regeneration, % Life Steal, % Damage, Melee Damage, Ranged Damage, Elemental Damage, % Attack Speed, % Crit Chance, Engineering, Range, Armor, % Dodge, % Speed, Luck, Harvesting.
**2차 스탯**: Consumable Heal, XP Gain, Pickup Range, Items Price, Explosion Dmg/Size, Bounce, Piercing, Knockback, Burn speed/spread, Structure attack speed, Trees, % Enemies, Enemy Speed, Free Rerolls, Reroll price.

주요 공식
- Armor: 5 → 25% 감소, 15 → 50% 감소. 이 두 값은 `reduction = A/(A+15)`와 일치한다(위키 예시에 들어맞는 식이고, 공식 자체가 명시된 건 아니다). 1점당 유효 HP +6.66%이고, 음수면 받는 피해가 늘어난다(-15 → 150%).
- Dodge: 상한 60%(Cryptid 70%, Ghost 90%). 음수는 0으로 취급한다.
- 무기 피해 = `기본 + 스탯×스케일%`. 예: T4 Knife는 20(80% Melee)이라 Melee 30이면 44. 여기에 %Damage가 곱해진다.
- Harvesting: 웨이브가 끝날 때 +x 재료와 XP를 준 뒤 **5% 복리로 증가**한다(Crown +8%p, Farmer +3%p).
- Luck: 소모품 드랍, 상자 확률, 상점과 레벨업의 티어에 영향을 준다. 100 Luck이면 적 처치 상자 확률이 약 4배가 된다.

### 근거리 무기와 Range (Range 페이지)
- **원거리 무기**: 실제 사거리 = 무기 사거리 + Range 스탯.
- **근접 무기**: Range 스탯의 **절반만** 반영된다(음수도 절반). 모든 무기의 최소 사거리는 25다.
- 근접은 **thrust(찌르기, 직선)**와 **sweep(휘두르기, 호)** 두 종류다. Range가 높으면 thrust는 더 멀리 뻗고 sweep은 더 넓게 휩쓴다. 무기가 캐릭터 몸에서 튀어나가 목표까지 "런지"했다가 **짧은 딜레이 후 돌아오는** 방식이고, 경로에 있는 적을 모두 맞힌다.
- 뻗는 거리가 늘어난 만큼 쿨다운도 **약간 길어진다**. +10 Range에서 약 0.01초, +100에서 약 0.05초(3~10% 느려짐)이고, 빠른 무기(Fist)일수록 체감이 크다.
- 기본 사거리(T1)
  - 근접: Fist/Knife/Hand 150, Stick 175, Wrench 175(sweep), Cacti Club 200(sweep), Chopper 135(sweep), Spear 350, Jousting Lance 250
  - 원거리: SMG 400(0.17s), Pistol 400(1.2s), Revolver 450, Slingshot 300, Shotgun 350, Laser Gun 500, Taser 200
  - 캐릭터 기본 이동속도는 450이다(Enemies 페이지).
- 무기 종류 구성(T1 데이터 기준): thrust 26, sweep 18. 동일한 무기 2개를 합치면 한 티어 위가 된다(최대 T4).

### 무기 클래스 세트 보너스 (2~6개 보유, 구현하기 쉬움)
Blade는 Melee 피해와 LS를 올리고, Blunt는 Armor와 MaxHP를 올리는 대신 Speed가 깎인다. Ethereal은 Dodge를 올리는 대신 Armor가 깎이고, Gun은 Range(+10~+50), Heavy는 %Dmg(+5~25%), Precise는 Crit(+3~15%), Primitive는 MaxHP(+3~15), Unarmed는 Dodge, Support는 Harvesting을 올린다. Legendary는 **MaxHP -20~-100**이라 세트 보너스 자체가 페널티다.

---

## 3. 캐릭터 (정확한 장단점)

- **Well Rounded**: +5 MaxHP, +5% Speed, +8 Harvesting (기본 캐릭터)
- **Brawler**: Unarmed 무기 AS +50%, +15% Dodge / -50 Range, -50 Ranged Damage
- **Ranger**: +50 Range, Ranged Damage 증가량 +50% / 근접 무기 장착 불가, MaxHP 증가량 -25%
- **Chunky**: MaxHP 증가량 +25%, MaxHP 3당 +1% Dmg, 소모품 회복 +3 / LS -100%, Regen·Dodge 증가량 -50%, **Speed 증가량 -100%**
- **Loud**: +30% Damage, **+50% Enemies**, 웨이브 종료마다 Harvesting -3
- **Mutant**: 레벨업 필요 XP -66% / 아이템 가격 +50% (레벨업으로 성장하는 구조)
- **Pacifist**: 웨이브 종료 시 **살아있는 적 1마리당 재료·XP 0.65**, Lumberjack Shirt로 시작 / Damage -100%, Engineering -100 (피하기만 하는 캐릭터)
- **One Armed**: AS +200%, Damage 증가량 +100% / **무기 1개만** 장착
- **Masochist**: 피격마다 +5% Dmg(웨이브 끝까지), +10 MaxHP, +20 Regen, +8 Armor / -100% Damage
- **Knight**: Armor 1당 +2 Melee, +3 Armor / 원거리 불가, T2 이상 무기만, AS 증가량 -50%, Harvesting 증가량 -80%
- **Streamer**: 정지 중 초당 재료 +3%(최대 25), 이동 중 +40% Dmg·AS, 구조물 1개당 +2 Armor / 재료 드랍 -50%, 재료 15당 -1% Dmg, 재료 30당 -1% Speed
- **Entrepreneur**: 아이템 가격 -25%, Harvesting 증가량 +50%, 재활용 +25% / **웨이브 시작마다 재료 전부 소실**, Damage 증가량 -50%
- **Sick**: +12 MaxHP, +25% LS / **초당 1 피해**, Regen -100
- **Ghost**: Ethereal 무기 +10 Dmg, +30% Dodge, Dodge 상한 90% / Armor -100
- **Farmer**: +20 Harvesting, 복리 +3%p, 만피일 때 소모품을 먹으면 +1 Harvesting / 재료 드랍 -50%
- **Soldier**: 정지 중 +50% Dmg·AS, +200% 픽업 범위, +15 Knockback / **이동 중 공격 불가**
- **Bull**: +20 MaxHP, +15 Regen, +10 Armor, **피격 시 자폭 30(각 스탯 300% 스케일)** / 무기 장착 불가
- **Old**: 적 속도 -25%, **맵 크기 -33%**, 적 수 -10% / 자기 Speed -10%
- **Explorer**: 나무가 많이 생성됨, 맵 +33%, 픽업 +50%, +10% Speed / 적 +25%, 적 속도 +10%, 적 재료 -50%, Damage -40%
- **Lucky**: +100 Luck, 재료 획득 시 75% 확률로 무작위 적에게 피해 / AS -60%, XP -50%
- **Golem**: +20 MaxHP, HP 50% 미만일 때 +40% AS·+20% Speed / **어떤 방법으로도 회복 불가**
- **Jack**: 보스·엘리트 상대 피해 +125%, 재료 +200%, **적 -70%** / 적 HP +175%, 적 피해 +35% (소수 정예 모드)
- **Wounded**: **한 방에 죽음**, 상점에서 방어 계열 아이템이 제외됨 (Nightmare 클리어 보상)
- **Baby**: 무기 슬롯 1개로 시작, **레벨업 때 스탯 대신 무기 슬롯**(최대 24)
- **Demon**: **아이템을 재료 대신 Max HP로 구매**, 웨이브 종료 시 재료 50%를 MaxHP로 변환
- **Lumberjack**은 캐릭터가 아니다. 같은 이름의 업적("Kill 50 trees")이 있고 그걸 깨면 Explorer가 해금된다. 아이템 Lumberjack Shirt도 있다.

**소규모 게임에서 구현하기 좋은 것**: 이동/정지 이분법(Soldier, Streamer, Statue), 적 수 배율(Loud, Jack, Old), 피격 누적 버프(Masochist), 무기 슬롯 제한(One Armed, Baby), 회복 규칙 비틀기(Sick, Golem, Torture), 재화 규칙 비틀기(Entrepreneur, Demon, Pacifist), 한 방 사망(Wounded). 대부분 스탯 배율 한 줄이나 이벤트 훅 하나로 끝난다.

---

## 4. 적 기믹 / 엘리트 / 웨이브 이벤트

**웨이브 구조**: 총 20웨이브. 길이는 20초로 시작해 웨이브마다 +5초씩 늘어 60초가 상한이고, 20웨이브(보스)는 90초다. 웨이브가 끝나면 남은 재료는 자동으로 "가방"에 들어가 다음 웨이브 드랍에 +1씩 붙어 나온다(손실 없음). 그다음 상자 개봉 → 레벨업 선택 → 상점 순서로 진행된다.

**일반 적 행동 패턴**(Enemies 페이지)
- Baby Alien은 추적만 한다. Chaser는 떼로 온다.
- Charger/Bruiser는 2.5~3.5초 쿨다운으로 돌진한다.
- **Pursuer**: 매초 가속한다(150 → 600).
- **Spitter**: 가까이 가면 도망가면서 투사체를 쏜다.
- **Buffer**: 도망다니면서 주변 적에게 HP +150%, 피해 +25%, 속도 +50%를 준다(빨간 외곽선).
- **Healer**: 주변 적을 치유한다.
- **Fly**: 원거리 무기에 맞으면 50% 확률로 사방에 탄을 쏜다. 근접으로 잡으면 안전하다.
- **Spawner**: 죽으면 Junkie 3마리를 낳는다.
- **Slasher Egg**: 5초 안에 못 깨면 Slasher가 부화한다.
- **Looter**: 도망다니며, 잡으면 상자와 재료 8개를 준다(10% 확률로 25초에 등장).
- **Gobbler**: 바닥의 재료를 먹고 커진다. 잡으면 먹은 재료를 1~3배로 돌려준다.
- **나무(중립)**: 10초마다 생성 판정이 있다. 8번 맞으면 무조건 죽고, 재료 3개와 소모품 100%(그중 20%는 상자)를 준다.
- 화면 동시 적은 100마리가 상한이다. 넘치면 무작위 적이 드랍 없이 사라진다. 바닥 재료는 50개가 상한이고 넘치면 기존 덩어리에 값이 합쳐진다.

**엘리트/호드**(Danger 2 이상)
- Danger 2~3에서는 11~12웨이브에 1회, Danger 4~5에서는 3회(11~12 / 14~15 / 17~18, 마지막은 엘리트 확정) 나온다. 엘리트 60%, 호드 40%이고 **상점에서 다가오는 웨이브를 미리 보여준다**.
- 엘리트(Rhino, Butcher, Monk, Croc 등)는 **HP 비율이나 경과 시간에 따라 페이즈(Mutation)가 바뀐다.** 예: Rhino는 HP 60% 또는 25초가 되면 돌진 주기가 2초에서 1.3초로 줄어든다. 처치하면 **T4 확정 전설 상자와 100 HP 회복**을 준다. 같은 런에서 같은 엘리트는 다시 나오지 않는다.
- 호드는 적을 추가로 스폰하고, 대신 1마리당 재료 드랍이 -35%다.
- 보스는 20웨이브의 Predator 또는 Invoker다. Danger 5에서는 둘이 동시에 나오고 각각 HP 75%다.

**Danger 레벨**(누적 적용)
- D0: 수정치 없음
- D1: 새 적 등장
- D2: 엘리트/호드 1회
- D3: 적 피해·HP +12%
- D4: 엘리트/호드 3회, 적 +26%
- D5: 적 +40%, 보스 2마리
- Nightmare: 적 +60%, 적 속도 +10%, 환경 투사체, 시야 안개
- 각 Danger를 클리어하면 다음 Danger와 새 캐릭터가 하나씩 해금된다.

**아이템이 일으키는 이벤트**: Bait(특수 적 소환), Lure(루트 에일리언 +2), Celery Tea(다음 웨이브 적 HP +100%, XP +50%), Candy Bag(10% 확률로 엘리트 추가 등장).

---

## 5. 수집/해금 시스템

- 캐릭터 62명 중 5명만 처음부터 쓸 수 있다. 나머지는 도전과제로 해금된다.
  1. **누적 카운터 사다리**: 적 처치 300/2천/5천/1만/2만마다 Old/Mutant/Loud/Wildling/Gladiator. 재료 300~2만마다 Lucky/Generalist/Multitasker/Pacifist/Saver.
  2. **극단 스탯 도달**: Dodge 60% → Ghost, Speed +50% → Speedy, Speed -20% → Streamer, Range 300 → Hunter, Harvesting 200 → Farmer, Regen -5 → Sick, LS 40% → Vampire. **플레이 스타일을 극단까지 밀어붙이면 그 스타일의 캐릭터가 열리는 구조.**
  3. **행동 도전**: 처음 죽으면 Chunky, 나무 50그루면 Explorer, 한 폭발로 15킬이면 Artificer, 무기 12개 재활용이면 Arms Dealer, 6웨이브 전 레벨 10이면 Baby, 1 HP로 웨이브 종료면 Golem.
  4. **Danger 클리어 사다리**: D0 → One Armed, D1 → Bull, D2 → Soldier, D3 → Masochist, D4 → Knight, D5 → Demon, Nightmare → Wounded.
- **캐릭터별 첫 클리어 보상**: "Win a run with X"를 달성하면 그 캐릭터 전용 테마의 아이템이나 무기가 풀 전체에 추가된다. 예: Well Rounded → Potato, Pacifist → Panda, One Armed → Focus, Loud → Rip and Tear. 캐릭터 수만큼 해금 보상이 생기므로 컬렉션 도감 1칸 = 캐릭터 1명 클리어 = 새 아이템 1개 공개가 된다.
- 이스터에그 해금도 있다. Hourglass(웨이브 마지막 5초에 메인메뉴로 갔다가 재개), Candy Bag(잠금 없이 클리어), Gobbler 5회 처치 → Gobbler's Hat, 크리티컬 100% → Vorpal Sword.
- (미검증) 캐릭터 선택 화면에 캐릭터별 최고 클리어 Danger가 표시된다는 건 커뮤니티에서 흔히 알려진 얘기지만, 위키 페이지에서는 확인하지 못했다.

**감자특공대에 적용하는 방법**: 도감을 캐릭터 × 난이도 격자로 만들고, 각 칸을 클리어하면 아이템이 하나씩 드러나게 한다. 여기에 누적 카운터 해금과 극단 스탯 해금을 섞으면 실패한 런도 진행도로 쌓인다.

---

## 6. 작고 재미있고 구현이 싼 아이디어 10개

1. **직교 페널티 아이템**: 아이템마다 `{+A, -B}` 두 줄만 둔다. B는 A와 다른 빌드 축에 붙인다. 데이터 테이블만 있으면 되고 선택마다 고민이 생긴다.
2. **근접 런지 + 사거리 절반 규칙**: thrust는 직선으로 뻗었다 돌아오고 sweep은 호를 그린다. `meleeRange = base + Range*0.5`, 쿨다운에는 이동 거리 비례 소폭 가산. 무기가 몸에서 튀어나가는 모션 자체가 손맛이다.
3. **이동/정지 이분법 캐릭터와 아이템**(Soldier, Statue, Streamer): `isMoving` 플래그 하나로 조작 방식이 완전히 달라진다.
4. **적 수 배율 다이얼**(Loud +50%, Jack -70%): 스폰 테이블에 배율 하나만 곱하면 난이도와 보상이 같이 움직인다.
5. **Harvesting 복리 이자 + Piggy Bank**: 웨이브가 끝날 때 `+x`를 주고 `x *= 1.05`. "지금 강해질래, 나중에 부자 될래"라는 경제 선택이 생긴다.
6. **다음 웨이브 도박 아이템**(Peacock, Celery Tea, Bait): 다음 웨이브 하나에만 걸리는 버프·디버프 쌍. 상점에서 사는 일회성 리스크다.
7. **HP/시간 페이즈 엘리트**: `hp<60% || t>25s`이면 패턴 교체. 확정 전설 상자를 주고, 상점에서 "다가오는 엘리트 웨이브"를 미리 보여준다.
8. **특수 행동 적 3종**: Buffer(주변 강화, 빨간 외곽선), Egg(n초 안에 못 깨면 부화), Gobbler(재료를 먹고 커짐, 잡으면 되돌려줌). 각각 우선순위 판단을 강제한다.
9. **나무(중립 오브젝트)**: 일정 주기로 생성되고 8타 확정 파괴, 드랍은 재료와 상자. Lumberjack Shirt와 Pocket Factory 같은 나무 시너지 아이템이 하나의 소빌드가 된다.
10. **극단 스탯 해금과 캐릭터 클리어 보상 아이템 도감**: "Dodge 60% 도달 → 유령 캐릭터", "X로 클리어 → 전용 아이템 공개". 칸이 점점 채워지는 수집 동기가 생긴다.

보너스(규칙을 비트는 캐릭터 3종, 각각 코드 한 줄): 한 방에 죽음(Wounded), 무기 1개 + AS +200%(One Armed), MaxHP로 아이템 구매(Demon).

---

## 가져온 위키 페이지
- https://brotato.wiki.spellsandguns.com/Items (목록) + /Template:Item_Data (수치 원본)
- https://brotato.wiki.spellsandguns.com/Characters + /Template:Character_Data
- https://brotato.wiki.spellsandguns.com/Weapons + /Template:Weapon_Data + /Weapon_Classes
- https://brotato.wiki.spellsandguns.com/Range, /Stats, /Armor, /Dodge, /Luck, /Harvesting, /Materials
- https://brotato.wiki.spellsandguns.com/Shop, /Upgrades, /Crate, /Structures
- https://brotato.wiki.spellsandguns.com/Enemies, /Trees, /Waves, /Elite_and_Horde_Waves, /Danger_Levels
- https://brotato.wiki.spellsandguns.com/Achievements (해금 조건), /Progress
- 없는 페이지: /Elites, /Tiers, /Danger (모두 missingtitle. 위 페이지들로 대체했다)
