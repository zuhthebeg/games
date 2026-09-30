(function (root) {
  'use strict';
  const stats = {
    maxHp: 10, regen: 0, lifesteal: 0, dmg: 0, melee: 0, ranged: 0,
    atkSpd: 0, crit: 0, range: 0, armor: 0, dodge: 0, speed: 0,
    luck: 0, harvest: 0, pickup: 0, elemental: 0, explosion: 0,
    thorns: 0, projectiles: 0, knockback: 0
  };
  const chars = {
    basic: { name: '기본감자', weapon: 'pistol', stats: {}, trait: 'freeReroll' },
    muscle: { name: '근육감자', weapon: 'fist', stats: { maxHp: 8, armor: 2, melee: 4, speed: -3, ranged: -3 }, trait: 'strongKb' },
    science: { name: '과학감자', weapon: 'laser', stats: { elemental: 4, range: 40, maxHp: -2, atkSpd: 10 }, trait: 'elementalBoost' },
    lucky: { name: '행운감자', weapon: 'slingshot', stats: { luck: 25, harvest: 8, dmg: -10 }, trait: 'luckyCrate' },
    gunslinger: { name: '총잡이감자', weapon: 'pistol', weapons: [['pistol', 1], ['pistol', 1]],
      stats: { atkSpd: 5 }, trait: 'gunOnly' },
    berserker: { name: '광전사감자', weapon: 'stick', stats: { maxHp: 12, armor: -1 }, trait: 'rage' },
    vampire: { name: '흡혈감자', weapon: 'dagger', stats: { lifesteal: 15, maxHp: 5 }, trait: 'noRegen' },
    bomber: { name: '폭탄감자', weapon: 'rocket', stats: { explosion: 30 }, trait: 'deathBlast' },
    cyclops: { name: '외눈감자', weapon: 'crossbow', stats: { crit: 15, maxHp: 5, projectiles: 2 }, trait: 'oneSlot', pierce: 1 },
    ghost: { name: '유령감자', weapon: 'staff', stats: { dodge: 22, speed: 10 }, trait: 'dodgePower' },
    saver: { name: '저축감자', weapon: 'pistol', stats: { dmg: -5 }, trait: 'reserveInterest' },
    thorn: { name: '가시감자', weapon: 'fist', stats: { thorns: 8, maxHp: 8, armor: 2, speed: -8, dodge: -8 }, trait: 'barbedSkin' },
    // 규칙형 필드는 아이템과 공유(sim의 rules 합산): still=정지 중 스탯, enemies=적 수 %, waveEnd=웨이브 종료마다 영구 변화
    soldier: { name: '포대감자', weapon: 'pistol', stats: {}, trait: 'stationary', still: { dmg: 50, atkSpd: 50 }, moving: { atkSpd: -50 } },
    loud: { name: '시끌감자', weapon: 'stick', stats: { dmg: 30 }, trait: 'loud', enemies: 50, waveEnd: { harvest: -3 } },
    mutant: { name: '돌연변이감자', weapon: 'slingshot', stats: {}, trait: 'mutant', xpNeed: .5, priceMult: 1.5 }
  };
  const weapons = {
    fist: { name: '주먹', muzzle: [12, 0], artAngle: Math.PI / 2, classes: ['unarmed'], behavior: 'thrust', damage: 8, cool: .9, range: 110, kb: 220, price: 15 },
    dagger: { name: '단검', muzzle: [13, 0], artAngle: -Math.PI / 4, classes: ['blade', 'precise'], behavior: 'thrust', damage: 6,
      cool: .55, range: 100, kb: 80, crit: 10, status: 'bleed', price: 22 },
    spear: { name: '창', muzzle: [13, 0], artAngle: Math.PI * 2 / 3, classes: ['blade'], behavior: 'thrust', damage: 11,
      cool: 1.2, range: 200, kb: 150, price: 28 },
    stick: { name: '막대기', muzzle: [13, 0], artAngle: Math.PI * 3 / 4, classes: ['blunt'], behavior: 'sweep', damage: 12,
      cool: 1.3, range: 150, kb: 260, price: 20 },
    hammer: { name: '망치', muzzle: [12, 0], artAngle: Math.PI * 3 / 4, classes: ['blunt'], behavior: 'slam', damage: 26,
      cool: 2, range: 130, kb: 380, price: 38 },
    slingshot: { name: '새총', muzzle: [12, 0], artAngle: Math.PI * 3 / 4, classes: ['precise'], behavior: 'projectile', damage: 10,
      cool: 1.2, range: 380, kb: 60, bounce: 1, price: 18 },
    pistol: { name: '권총', muzzle: [14, 0], artAngle: Math.PI, classes: ['gun'], behavior: 'projectile', damage: 12,
      cool: 1, range: 420, kb: 80, price: 22 },
    shotgun: { name: '산탄총', muzzle: [14, 0], artAngle: Math.PI, classes: ['gun'], behavior: 'projectile', damage: 6,
      cool: 1.6, range: 280, kb: 140, count: 4, spread: 30, price: 30 },
    smg: { name: '기관단총', muzzle: [14, 0], artAngle: Math.PI, classes: ['gun'], behavior: 'projectile', damage: 4,
      cool: .25, range: 360, kb: 30, spread: 8, randomSpread: true, price: 32 },
    crossbow: { name: '석궁', muzzle: [13, 0], artAngle: -Math.PI * 3 / 4, classes: ['precise'], behavior: 'projectile', damage: 16,
      cool: 1.4, range: 480, kb: 90, crit: 15, price: 34 },
    laser: { name: '레이저', muzzle: [13, 0], artAngle: Math.PI * 3 / 4, classes: ['elemental', 'precise'], behavior: 'beam', damage: 18,
      cool: 1.8, range: 520, kb: 0, price: 38 },
    rocket: { name: '로켓', muzzle: [14, 0], artAngle: Math.PI / 2, classes: ['explosive', 'gun'], behavior: 'projectile', damage: 22,
      cool: 2.2, range: 450, kb: 200, radius: 70, price: 45 },
    flamethrower: { name: '화염방사기', muzzle: [12, 0], artAngle: Math.PI * 3 / 4, classes: ['elemental'], behavior: 'cone', damage: 3,
      cool: .15, range: 190, kb: 20, spread: 40, status: 'burn', price: 40 },
    staff: { name: '번개 지팡이', muzzle: [13, 0], artAngle: Math.PI / 2, classes: ['elemental'], behavior: 'chain', damage: 10,
      cool: 1.3, range: 400, kb: 0, chains: 3, price: 36 },
    boomerang: { name: '부메랑', muzzle: [13, 0], artAngle: 0, classes: ['precise'], behavior: 'projectile', damage: 9,
      cool: 1.4, range: 340, kb: 40, returning: true, price: 30 },
    hoe: { name: '괭이', muzzle: [13, 0], artAngle: Math.PI * 3 / 4, classes: ['blunt'], behavior: 'sweep', damage: 11,
      cool: 1.3, range: 145, kb: 200, killMat: .15, price: 24 },
    potato_cannon: { name: '감자 대포', muzzle: [14, 0], artAngle: Math.PI, classes: ['explosive', 'gun'], behavior: 'projectile', damage: 18,
      cool: 2.2, range: 400, kb: 140, radius: 42, split: .35, price: 42 },
    frost_wand: { name: '서리 지팡이', muzzle: [13, 0], artAngle: Math.PI / 2, classes: ['elemental'], behavior: 'projectile', damage: 9,
      cool: 1.3, range: 380, kb: 20, status: 'chill', price: 36 }
  };
  for (const v of Object.values(weapons)) v.kind = ['thrust', 'sweep', 'slam'].includes(v.behavior) ? 'melee' : 'ranged';
  // 아이템 v3(2026-09-28): 대부분 단점 동반(직교 페널티). tier 생략=1, T4=전설(10웨이브~).
  // 규칙형 필드: hook=처치 훅, pierce/bounce=탄, enemies/enemyHp=적 수·HP %, once=다음 웨이브 1회
  // (hp1/elite/peacock), waveEnd=웨이브 종료마다 영구, still=정지 중, perWeapon=무기 종류당,
  // xp=경험치 %, drain=2초마다 HP-, startHp=시작 HP 비율, noMaxHp=최대HP 증가 차단,
  // ramp=[시작 피해%, 증가%, 간격초], zap=주울 때 번개 확률, anvil=상점 입장 시 무기 티어+1
  // v4: chill=적중 확률(2초, 이동 -35%, 보스 절반), returnDmg=부메랑 귀환 피해 %,
  // chilledDmg=냉각된 적에게 피해 %, fragments=폭발 파편 피해 비율(3개, 재폭발 없음),
  // killMat=처치 재료 1 추가 확률, priceMult=상점 가격 배율, revive=웨이브당 1회 부활 HP 비율.
  // 무기 returning=왕복 각 1타, split=착탄 분열 비율(3개, 재분열 없음), killMat=괭이 처치 드롭(행운 적용).
  const items = {
    potato_armor: { name: '감자갑옷', price: 25, stats: { armor: 2, speed: -3 } },
    hot_sauce: { name: '핫소스', price: 30, stats: { dmg: 8, maxHp: -2 } },
    energy_drink: { name: '에너지음료', price: 30, stats: { atkSpd: 10, dmg: -3 } },
    magnet: { name: '자석', price: 20, stats: { pickup: 40 } },
    clover: { name: '네잎클로버', price: 25, stats: { luck: 10 } },
    bandage: { name: '붕대', price: 25, stats: { regen: 2 } },
    vampire_fang: { name: '흡혈송곳니', price: 35, stats: { lifesteal: 3, maxHp: -1 } },
    sneakers: { name: '운동화', price: 25, stats: { speed: 8, armor: -1 } },
    scope: { name: '조준경', price: 30, stats: { range: 40, crit: 3, atkSpd: -3 } },
    dumbbell: { name: '아령', price: 30, stats: { melee: 3, maxHp: 2, ranged: -2 } },
    battery: { name: '배터리', price: 30, stats: { ranged: 3, melee: -2 } },
    heart_jar: { name: '하트병', price: 35, stats: { maxHp: 6, speed: -2 } },
    garden_glove: { name: '정원장갑', price: 25, stats: { harvest: 5 } },
    helmet: { name: '헬멧', price: 30, stats: { armor: 3, dodge: -2 } },
    feather: { name: '깃털', price: 30, stats: { dodge: 6, maxHp: -2 } },
    lucky_coin: { name: '행운의 동전', price: 30, stats: { harvest: 3, luck: 5 } },
    thorn_armor: { name: '가시 갑옷', tier: 2, price: 45, stats: { armor: 2, thorns: 5, speed: -3 } },
    mirror: { name: '거울', tier: 3, price: 70, stats: { projectiles: 1, dmg: -12 } },
    firecracker: { name: '폭죽', tier: 2, price: 50, stats: {}, hook: 'firecracker' },
    jam_jar: { name: '잼 병', price: 25, stats: {}, hook: 'jam_jar' },
    coffee: { name: '커피', price: 30, stats: { atkSpd: 15, maxHp: -2 } },
    piggy_bank: { name: '돼지 저금통', tier: 2, price: 45, stats: {}, hook: 'piggy_bank', unique: true },
    glass_cannon: { name: '유리 대포', tier: 3, price: 65, stats: { dmg: 25, armor: -3 } },
    bandana: { name: '머리띠', price: 30, stats: { crit: 6, range: -10 } },
    piercing_prism: { name: '관통 프리즘', tier: 2, price: 50, stats: { dmg: -8 }, pierce: 1, max: 2 },
    cactus: { name: '선인장', price: 30, stats: { thorns: 3, maxHp: 3 } },
    whetstone: { name: '숫돌', tier: 2, price: 45, stats: { melee: 4, knockback: 30, ranged: -3 } },
    gunpowder: { name: '화약', tier: 2, price: 45, stats: { explosion: 25, armor: -1 } },
    spark_plug: { name: '점화 플러그', tier: 2, price: 50, stats: { elemental: 3 }, hook: 'spark_plug' },
    medkit: { name: '구급상자', tier: 2, price: 45, stats: { regen: 3, speed: -2 } },
    rabbit_foot: { name: '토끼 발', tier: 3, price: 70, stats: { luck: 25, dodge: 3, dmg: -4 } },
    turret: { name: '포탑', tier: 3, price: 80, stats: {}, hook: 'turret' },
    treasure_map: { name: '보물 지도', tier: 2, price: 40, stats: {}, hook: 'treasure_map' },
    fracture_round: { name: '균열 탄심', tier: 2, price: 50, stats: { armor: -2 }, unique: true },
    bounty_badge: { name: '회수 표식', tier: 2, price: 55, stats: { maxHp: -3 }, unique: true },
    thorn_coil: { name: '가시 코일', tier: 2, price: 50, stats: { thorns: 5, speed: -6 }, unique: true },
    // ── v3 신규 T1
    glasses: { name: '안경', price: 25, stats: { range: 25 } },
    bent_fork: { name: '휜 포크', price: 25, stats: { dmg: 6, range: -12 } },
    beanie: { name: '털모자', price: 20, stats: { speed: 5, range: -8 } },
    whistle: { name: '호루라기', price: 25, stats: { maxHp: 2, dmg: 5 }, enemies: 5 },
    ghost_sheet: { name: '유령 이불', price: 20, stats: { maxHp: 3 }, once: 'hp1' },
    // ── T2
    sunglasses: { name: '선글라스', tier: 2, price: 45, stats: { crit: 8, armor: -1 } },
    wheelbarrow: { name: '수레', tier: 2, price: 45, stats: { harvest: 12, armor: -1 } },
    bait: { name: '미끼', tier: 2, price: 40, stats: { dmg: 8 }, once: 'elite' },
    black_belt: { name: '검은 띠', tier: 2, price: 45, stats: { melee: 6, ranged: -3 } },
    white_flag: { name: '백기', tier: 2, price: 45, stats: { harvest: 5 }, enemies: -5, unique: true },
    vigil_ring: { name: '자경단 반지', tier: 2, price: 55, stats: {}, waveEnd: { dmg: 2 }, unique: true },
    robot_arm: { name: '로봇 팔', tier: 2, price: 50, stats: {}, waveEnd: { melee: 2, maxHp: -1 } },
    lightning_rod: { name: '피뢰침', tier: 2, price: 50, stats: {}, zap: .2 },
    // ── T3
    statue: { name: '감자 석상', tier: 3, price: 70, stats: { speed: -10 }, still: { atkSpd: 40 } },
    barricade: { name: '바리케이드', tier: 3, price: 65, stats: { knockback: 15, speed: -5 }, still: { armor: 6 } },
    alien_baby: { name: '외계 아기', tier: 3, price: 65, stats: { maxHp: 15 }, enemyHp: 10 },
    blood_pack: { name: '헌혈 팩', tier: 3, price: 70, stats: { harvest: 30 }, drain: 1 },
    handcuffs: { name: '수갑', tier: 3, price: 75, stats: { melee: 8, ranged: 8, elemental: 8 }, noMaxHp: true, unique: true },
    sad_tomato: { name: '시든 토마토', tier: 3, price: 70, stats: { regen: 8 }, startHp: .5, unique: true },
    wisdom_scroll: { name: '지혜의 두루마리', tier: 3, price: 75, stats: {}, ramp: [-15, 5, 5], unique: true },
    peacock_feather: { name: '공작 깃털', tier: 3, price: 65, stats: {}, xp: 25, once: 'peacock' },
    // ── T4 전설
    golden_potato: { name: '황금 감자', tier: 4, price: 110, stats: { maxHp: 3, regen: 2, lifesteal: 1, dmg: 5,
      atkSpd: 5, speed: 3, dodge: 3, armor: 1, luck: 5 } },
    mammoth_fur: { name: '매머드 털', tier: 4, price: 110, stats: { melee: 15, regen: 4, knockback: 30, dmg: -8, speed: -3 } },
    jetpack: { name: '제트팩', tier: 4, price: 105, stats: { speed: 15, dodge: 10, maxHp: -5, armor: -1 } },
    ricochet_coil: { name: '도탄 코일', tier: 4, price: 110, stats: { dmg: -25 }, bounce: 1, unique: true },
    focus_lens: { name: '집중 렌즈', tier: 4, price: 120, stats: { dmg: 30 }, perWeapon: { atkSpd: -3 } },
    anvil: { name: '모루', tier: 4, price: 100, stats: {}, anvil: true, unique: true },
    salt_shaker: { name: '소금통', price: 25, stats: { crit: 4, regen: -1 } },
    raincoat: { name: '우비', price: 25, stats: { armor: 1, dodge: 3, harvest: -3 } },
    birdseed: { name: '새 모이', price: 25, stats: { pickup: 30, luck: 3, dmg: -2 } },
    ice_pack: { name: '얼음 주머니', tier: 2, price: 45, stats: { elemental: 2, atkSpd: -3 }, chill: .10 },
    seed_potato: { name: '씨감자', tier: 2, price: 45, stats: { harvest: -2 }, waveEnd: { maxHp: 1 } },
    smoke_bomb: { name: '연막탄', tier: 2, price: 45, stats: { dodge: 10, range: -15 } },
    boomerang_strap: { name: '부메랑 끈', tier: 2, price: 45, stats: { atkSpd: -2 }, returnDmg: 30 },
    frost_crown: { name: '서리 왕관', tier: 3, price: 70, stats: { speed: -4 }, chilledDmg: 20, unique: true },
    shrapnel: { name: '파편 수류탄', tier: 3, price: 70, stats: { armor: -1 }, fragments: .20 },
    harvest_sickle: { name: '수확 낫', tier: 3, price: 70, stats: { harvest: 10, dmg: -5 }, hook: 'harvest_sickle', killMat: .05 },
    potato_crown: { name: '감자 왕관', tier: 4, price: 115, stats: { dmg: 20, atkSpd: 10 }, priceMult: 1.2, unique: true },
    phoenix_feather: { name: '불사조 깃털', tier: 4, price: 110, stats: { maxHp: -10 }, revive: .5, unique: true }
  };
  const enemies = {
    blob: { hp: 8, speed: 90, dmg: 1, first: 1, mats: 2, size: 40 },
    bug: { hp: 5, speed: 170, dmg: 1, first: 2, mats: 2, size: 40 },
    spitter: { hp: 10, speed: 60, dmg: 1, first: 3, mats: 3, size: 48 },
    charger: { hp: 14, speed: 80, dmg: 1.5, first: 5, mats: 3, size: 48 },
    exploder: { hp: 12, speed: 120, dmg: 0, first: 7, mats: 3, size: 44 },
    splitter: { hp: 16, speed: 70, dmg: 1, first: 5, mats: 3, size: 48 },
    tank: { hp: 40, speed: 50, dmg: 3, first: 6, mats: 6, size: 64 },
    shielder: { hp: 30, speed: 60, dmg: 1, first: 9, mats: 5, size: 56 },
    // 특수 적: looter=도망가다 12초 뒤 탈출(잡으면 재료+상자, 일반 스폰 풀 제외), egg=6초 뒤 돌격병 2마리 부화,
    // buffer=거리 유지하며 반경 160 적의 속도 ×1.3·접촉 피해 ×1.25.
    looter: { hp: 20, speed: 150, dmg: 0, first: 3, mats: 8, size: 48, special: true },
    egg: { hp: 22, speed: 0, dmg: 0, first: 6, mats: 2, size: 48 },
    buffer: { hp: 30, speed: 75, dmg: 1, first: 8, mats: 4, size: 52 },
    elite: { hp: 120, speed: 110, dmg: 3, first: 8, mats: 15, size: 72 },
    boss_1: { hp: 1500, speed: 70, dmg: 4, first: 10, mats: 60, size: 150 },
    boss_2: { hp: 6000, speed: 80, dmg: 5, first: 20, mats: 150, size: 190 }
  };
  const upgrades = {
    maxHp: 3, dmg: 5, atkSpd: 5, melee: 2, ranged: 2, armor: 1, speed: 3,
    crit: 3, range: 25, regen: 2, dodge: 3, luck: 10, harvest: 5,
    elemental: 2, explosion: 10, thorns: 2, knockback: 15
  };
  // 난이도·경제 곡선(밸런스 튜닝은 여기만). spawn=초당 마리 수, hp/dmgPerWave=웨이브당 증가율.
  const curve = { spawnBase: 0.9, spawnPerWave: 0.42, hpPerWave: 0.42, dmgPerWave: 0.14,
    goldStartWave: 5, goldDropPerWave: 0.04, goldFloor: 0.35 };
  const IFRAME = 0.45;
  // 근접 무기는 사거리 스탯의 절반만 받는다(브로테이토식). 판정 거리 = 모션이 실제로 뻗는 거리.
  const MELEE_RANGE_SCALE = .5;
  const WEAPON_ORBIT = 36, WEAPON_SIZE = 44; // 무기 궤도 반경·표시 크기(px). sim 원점 계산과 렌더가 공유
  const D = { stats, chars, weapons, items, enemies, upgrades, curve, IFRAME, MELEE_RANGE_SCALE, WEAPON_ORBIT, WEAPON_SIZE, W: 1600, H: 1200 };
  root.SPUD = root.SPUD || {};
  root.SPUD.data = D;
  if (typeof module !== 'undefined') module.exports = D;
})(typeof window !== 'undefined' ? window : globalThis);
