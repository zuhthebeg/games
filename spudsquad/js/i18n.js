(function (root) {
  'use strict';
  const P = root.SPUD = root.SPUD || {};
  const stats = {
    ko: ['최대 HP',
      '재생',
      '흡혈',
      '공격력',
      '근접 피해',
      '원거리 피해',
      '공격 속도',
      '치명타',
      '사거리',
      '방어력',
      '회피',
      '이동 속도',
      '행운',
      '수확',
      '흡수 범위',
      '원소 피해',
      '폭발 범위',
      '가시',
      '추가 탄환',
      '넉백'],
    en: ['Max HP',
      'Regen',
      'Lifesteal',
      'Damage',
      'Melee',
      'Ranged',
      'Attack speed',
      'Critical',
      'Range',
      'Armor',
      'Dodge',
      'Speed',
      'Luck',
      'Harvest',
      'Pickup radius',
      'Elemental',
      'Explosion',
      'Thorns',
      'Projectiles',
      'Knockback'],
    'zh-TW': ['最大生命', '生命回復', '吸血', '攻擊力', '近戰傷害', '遠程傷害', '攻擊速度', '暴擊', '射程', '護甲', '閃避', '移動速度', '幸運', '收穫', '拾取範圍', '元素傷害', '爆炸範圍', '反傷', '額外彈丸', '擊退']
  };
  const statKeys = Object.keys(P.data.stats);
  const percentStats = new Set(['dmg', 'atkSpd', 'crit', 'dodge', 'speed',
    'luck', 'pickup', 'lifesteal', 'explosion', 'knockback']);
  const names = {
    chars: {
      en: ['Starter Spud',
        'Muscle Spud',
        'Science Spud',
        'Lucky Spud',
        'Gunslinger Spud',
        'Berserker Spud',
        'Vampire Spud',
        'Bomber Spud',
        'Cyclops Spud',
        'Ghost Spud', 'Reserve Spud', 'Briar Spud'],
      'zh-TW': ['基本馬鈴薯', '肌肉馬鈴薯', '科學馬鈴薯', '幸運馬鈴薯', '槍手馬鈴薯', '狂戰士馬鈴薯', '吸血馬鈴薯', '炸彈馬鈴薯', '獨眼馬鈴薯', '幽靈馬鈴薯', '儲蓄馬鈴薯', '荊棘馬鈴薯']
    },
    weapons: {
      en: ['Fist', 'Dagger', 'Spear', 'Stick', 'Hammer', 'Slingshot', 'Pistol', 'Shotgun', 'SMG', 'Crossbow', 'Laser', 'Rocket', 'Flamethrower', 'Staff'],
      'zh-TW': ['拳頭', '匕首', '長矛', '木棍', '戰錘', '彈弓', '手槍', '霰彈槍', '衝鋒槍', '弩', '雷射', '火箭', '火焰噴射器', '閃電法杖']
    },
    items: {
      en: ['Potato Armor',
        'Hot Sauce',
        'Energy Drink',
        'Magnet',
        'Clover',
        'Bandage',
        'Vampire Fang',
        'Sneakers',
        'Scope',
        'Dumbbell',
        'Battery',
        'Heart Jar',
        'Garden Glove',
        'Helmet',
        'Feather',
        'Lucky Coin',
        'Thorn Armor',
        'Mirror',
        'Firecracker',
        'Jam Jar',
        'Coffee',
        'Piggy Bank',
        'Glass Cannon',
        'Bandana',
        'Piercing Prism',
        'Cactus',
        'Whetstone',
        'Gunpowder',
        'Spark Plug',
        'Medkit',
        'Rabbit Foot',
        'Turret',
        'Treasure Map', 'Fracture Core', 'Recovery Badge', 'Briar Coil'],
      'zh-TW': ['馬鈴薯盔甲',
        '辣醬',
        '能量飲料',
        '磁鐵',
        '四葉草',
        '繃帶',
        '吸血尖牙',
        '運動鞋',
        '瞄準鏡',
        '啞鈴',
        '電池',
        '愛心瓶',
        '園藝手套',
        '頭盔',
        '羽毛',
        '幸運硬幣',
        '荊棘盔甲',
        '鏡子',
        '鞭炮',
        '果醬罐',
        '咖啡',
        '撲滿',
        '玻璃大砲',
        '頭巾',
        '穿透稜鏡',
        '仙人掌',
        '磨刀石',
        '火藥',
        '火花塞',
        '醫療包',
        '兔腳',
        '砲塔',
        '藏寶圖', '裂痕彈芯', '回收徽章', '荊棘線圈']
    }
  };
  const features = {
    ko: ['찌르기', '치명 출혈', '선분 관통', '120° 휘두르기', '착지 충격파',
      '한 번 튕김', '단일 표적 탄환', '30° 산탄 4발', '8° 탄퍼짐', '정밀 단일 탄환',
      '무한 관통 빔', '반경 70 폭발', '40° 원뿔 화상', '번개 3회 연쇄'],
    en: ['Thrust', 'Critical bleed', 'Piercing thrust', '120° sweep', 'Impact shockwave',
      'One bounce', 'Single-target shot', 'Four pellets', '8° spread', 'Precise single-target bolt',
      'Infinite beam', 'Radius 70 explosion', 'Burning cone', 'Three chain jumps'],
    'zh-TW': ['刺擊', '暴擊流血', '穿透刺擊', '120°橫掃', '落地衝擊波',
      '反彈一次', '單體子彈', '四發散彈', '8°散射', '精準單體弩箭',
      '無限穿透光束', '半徑70爆炸', '扇形燃燒', '連鎖閃電三次']
  };
  const traits = {
    ko: ['매 웨이브 첫 상점 리롤 무료', '넉백 50% 강화', '원소 피해 25% 강화',
      '처치 시 상자 2% 확률', '총 피해 +20% · 상점에 근접 무기 없음',
      '잃은 HP 10%마다 피해 +6% · 재생 0', '재생 0 · 웨이브 시작 HP 절반',
      '처치 시 10% 폭발 · 자폭 피해 없음', '무기 1칸 · 피해 3배, 공속 +60%, 투사체 +2',
      '회피 시 0.5초 무적 · 다음 공격 확정 치명',
      '웨이브 시작 시 보유 재화의 8% 추가 (최대 12) · 피해 -10%',
      '피격 시 가시 피해 8 · 최대 HP +8 · 방어 +2 · 이동 속도 -8% · 회피 -8%'],
    en: ['First shop reroll free each wave', 'Knockback +50%', 'Elemental damage +25%',
      '2% crate on kill', 'Gun damage +20% · no melee in shop',
      '+6% damage per 10% HP lost · no regen', 'No regen · start waves at half HP',
      '10% death explosion · no self-damage', 'One weapon slot · 3× damage, +60% speed, +2 projectiles',
      'Dodge grants 0.5s immunity and guaranteed crit',
      'Gain 8% of saved currency at wave start (max 12) · damage -10%',
      'Return 8 damage when hit · Max HP +8 · armor +2 · speed -8% · dodge -8%'],
    'zh-TW': ['每波商店首次重抽免費', '擊退 +50%', '元素傷害 +25%',
      '擊殺時 2% 掉落寶箱', '槍械傷害 +20% · 商店無近戰武器',
      '每失去10%生命增加6%傷害 · 無回復', '無回復 · 每波半血開始',
      '擊殺時10%爆炸 · 不會自傷', '僅一個武器欄 · 傷害3倍、攻速+60%、投射物+2',
      '閃避後無敵0.5秒，下次攻擊必暴擊',
      '每波開始獲得存款8%（最多12）· 傷害 -10%',
      '受擊反彈8點傷害 · 最大HP +8 · 護甲 +2 · 移速 -8% · 閃避 -8%']
  };
  const itemEffects = {
    ko: { piercing_prism: '직선 투사체 추가 관통 +1 (최대 2) · 관통 후 피해 75%',
      fracture_round: '관통 후 피해 90% 유지 (기본 75%) · 중복 불가',
      bounty_badge: '처치 보상 재화 확률 +12%p (최대 100%) · 중복 불가',
      thorn_coil: '피격 시 가시 반격 강화 · 중복 불가' },
    en: { piercing_prism: '+1 straight-shot pierce (max 2) · 75% damage after each pierce',
      fracture_round: 'Retain 90% damage after piercing (normally 75%) · unique',
      bounty_badge: '+12 percentage points to kill-currency chance (max 100%) · unique',
      thorn_coil: 'Stronger thorn retaliation on hit · unique' },
    'zh-TW': { piercing_prism: '直線彈丸額外穿透 +1（最多2次）· 穿透後傷害75%',
      fracture_round: '穿透後保留90%傷害（原為75%）· 不可重複',
      bounty_badge: '擊殺金幣機率 +12個百分點（最多100%）· 不可重複',
      thorn_coil: '強化受擊反傷 · 不可重複' }
  };
  const grades = { ko: ['일반', '희귀', '에픽', '전설'],
    en: ['Common', 'Rare', 'Epic', 'Legendary'], 'zh-TW': ['普通', '稀有', '史詩', '傳說'] };
  const strings = {
    ko: {
      title: '감자특공대', subtitle: '함께 버텨라, 끝까지!', solo: '혼자 하기', multi: '같이 하기',
      choose: '특공대를 골라!', ready: '준비 완료', wait: '동료를 기다리는 중…', balanced: '균형형',
      shop: '전투 준비', buy: '구매', reroll: '다시 뽑기', stats: '내 스탯', merge: '합치기', sell: '판매',
      items: '획득한 아이템', locked: '잠금', wave: '웨이브', win: '감자특공대 승리!', lose: '전멸했다!',
      back: '처음으로', next: '다음 웨이브', left: '남은 선택', damage: '피해', cool: '간격', reach: '사거리',
      weapon: '시작 무기', selected: '선택한 무기', slots: '무기 슬롯', seconds: '초', empty: '아직 없음', crate: '상자 열기', take: '가져가기', recycle: '재활용'
    },
    en: {
      title: 'Spud Squad', subtitle: 'Stick together. Survive the horde.', solo: 'Play Solo', multi: 'Play Co-op',
      choose: 'Choose your spud!', ready: 'Ready', wait: 'Waiting for your squad…', balanced: 'Balanced',
      shop: 'Supply Shop', buy: 'Buy', reroll: 'Reroll', stats: 'My Stats', merge: 'Merge', sell: 'Sell',
      items: 'Collected Items', locked: 'Lock', wave: 'Wave', win: 'Spud Squad Wins!', lose: 'Squad Defeated',
      back: 'Main Menu', next: 'Next Wave', left: 'Choices left', damage: 'Damage', cool: 'Cooldown', reach: 'Range',
      weapon: 'Starting weapon', selected: 'Selected weapon', slots: 'Weapon slots', seconds: 's', empty: 'None yet',
      crate: 'Open crate', take: 'Take', recycle: 'Recycle'
    },
    'zh-TW': {
      title: '馬鈴薯特攻隊', subtitle: '團結到底，撐過每一波！', solo: '單人遊玩', multi: '多人合作',
      choose: '選擇你的馬鈴薯！', ready: '準備完成', wait: '等待隊友…', balanced: '均衡型',
      shop: '補給商店', buy: '購買', reroll: '重抽', stats: '我的屬性', merge: '合併', sell: '出售',
      items: '已獲得道具', locked: '鎖定', wave: '波次', win: '馬鈴薯特攻隊勝利！', lose: '全軍覆沒',
      back: '回主選單', next: '下一波', left: '剩餘選擇', damage: '傷害', cool: '冷卻', reach: '射程',
      weapon: '起始武器', selected: '選定武器', slots: '武器欄', seconds: '秒', empty: '尚無', crate: '開寶箱', take: '拿取', recycle: '回收'
    }
  };
  let language = (navigator.language || 'ko').startsWith('zh') ? 'zh-TW'
    : (navigator.language || 'ko').startsWith('en') ? 'en' : 'ko';
  const keys = group => Object.keys(P.data[group]);
  P.i18n = {
    get language() { return language; },
    toggle() {
      language = language === 'ko' ? 'en' : language === 'en' ? 'zh-TW' : 'ko';
      document.documentElement.lang = language;
    },
    t(key) { return strings[language][key] || key; },
    stat(key) { return stats[language][statKeys.indexOf(key)] || key; },
    name(group, id) {
      const entry = P.data[group][id];
      if (!entry) return id;
      if (language === 'ko') return entry.name;
      return names[group]?.[language]?.[keys(group).indexOf(id)] || entry.name;
    },
    feature(id) { return features[language][keys('weapons').indexOf(id)] || id; },
    trait(id) { return traits[language][keys('chars').indexOf(id)] || id; },
    itemEffect(id) {
      const item = P.data.items[id];
      return [itemEffects[language][id], ...(item ? this.effect(item.stats) : [])].filter(Boolean).join(' · ');
    },
    grade(n) { return grades[language][n - 1] || ''; },
    effect(changes) {
      return Object.entries(changes).map(([key, n]) =>
        `${this.stat(key)} ${n > 0 ? '+' : ''}${Math.round(n)}${percentStats.has(key) ? '%' : ''}`
      );
    }
  };
  // ---- 스탯 시트·도감·디버그 UI 문자열 (아이템 표와 분리해 둔다) ----
  Object.assign(strings.ko, {
    secAttack: '공격', secSurvival: '생존', secUtility: '유틸', weapons: '무기', sets: '세트 보너스',
    close: '닫기', perHit: '1타', shots: '발사', noSets: '같은 계열 무기 2개부터 세트 보너스가 켜져요',
    setActive: '{n}단계 활성', setNext: '{n}개부터 다음 단계', setMax: '최대 단계', tapItem: '아이템을 누르면 효과가 보여요',
    collection: '콜렉션', tabChars: '캐릭터', tabWeapons: '무기', tabItems: '아이템', tabEnemies: '적',
    loginBanner: '로그인하면 클리어할 때마다 도감이 채워져요',
    collectionHint: '웨이브를 클리어하면 사용한 캐릭터·무기·아이템과 만난 적이 등록돼요',
    best: '최고', wins: '승리', firstWave: '첫 등장', speed: '속도', debugAll: 'DEBUG · 전체 공개',
    debug: '디버그', soloOnly: '디버그 패널은 솔로 전용이에요', grant: '지급', setMats: '재화 설정',
    jumpWave: '웨이브 이동', god: '무적', ranges: '사거리 원', killAll: '적 전멸', spawn: '소환',
    on: '켜짐', off: '꺼짐', waveOnly: '웨이브 중에만 가능해요', slotsFull: '무기 슬롯이 가득 찼어요',
    capped: '더 가질 수 없는 아이템이에요', done: '완료', count: '수', tier: '등급', hp: 'HP'
  });
  Object.assign(strings.en, {
    secAttack: 'Offense', secSurvival: 'Survival', secUtility: 'Utility', weapons: 'Weapons', sets: 'Set bonuses',
    close: 'Close', perHit: 'Per hit', shots: 'Shots', noSets: 'Two weapons of the same class activate a set bonus',
    setActive: 'Stage {n} active', setNext: 'Next stage at {n}', setMax: 'Max stage', tapItem: 'Tap an item to see its effect',
    collection: 'Collection', tabChars: 'Heroes', tabWeapons: 'Weapons', tabItems: 'Items', tabEnemies: 'Enemies',
    loginBanner: 'Log in and every cleared wave fills your collection',
    collectionHint: 'Clear waves to register the hero, weapons and items you used and the enemies you met',
    best: 'Best', wins: 'Wins', firstWave: 'First wave', speed: 'Speed', debugAll: 'DEBUG · all revealed',
    debug: 'Debug', soloOnly: 'The debug panel is solo only', grant: 'Grant', setMats: 'Set currency',
    jumpWave: 'Jump to wave', god: 'God mode', ranges: 'Range circles', killAll: 'Kill all', spawn: 'Spawn',
    on: 'On', off: 'Off', waveOnly: 'Only during a wave', slotsFull: 'Weapon slots are full',
    capped: 'You cannot hold more of this item', done: 'Done', count: 'Count', tier: 'Tier', hp: 'HP'
  });
  Object.assign(strings['zh-TW'], {
    secAttack: '攻擊', secSurvival: '生存', secUtility: '輔助', weapons: '武器', sets: '套裝加成',
    close: '關閉', perHit: '每擊', shots: '發射', noSets: '同系列武器達2把即啟動套裝加成',
    setActive: '第{n}階段啟動', setNext: '{n}把啟動下一階段', setMax: '最高階段', tapItem: '點擊道具查看效果',
    collection: '圖鑑', tabChars: '角色', tabWeapons: '武器', tabItems: '道具', tabEnemies: '敵人',
    loginBanner: '登入後每次通關波次都會填滿圖鑑',
    collectionHint: '通關波次即可登錄使用過的角色、武器、道具與遇到的敵人',
    best: '最佳', wins: '勝利', firstWave: '首次出現', speed: '速度', debugAll: 'DEBUG · 全部公開',
    debug: '除錯', soloOnly: '除錯面板僅限單人', grant: '給予', setMats: '設定貨幣',
    jumpWave: '跳至波次', god: '無敵', ranges: '射程圈', killAll: '消滅全部', spawn: '召喚',
    on: '開', off: '關', waveOnly: '僅能在波次中使用', slotsFull: '武器欄已滿',
    capped: '此道具無法再持有', done: '完成', count: '數量', tier: '等級', hp: 'HP'
  });
  // 스탯 한 줄 설명(시트용). 근접 무기는 사거리 스탯의 50%만 받는다(D.MELEE_RANGE_SCALE).
  const statDesc = {
    ko: { maxHp: '최대 체력', regen: '초당 (수치 × 0.2) HP 회복', lifesteal: '타격마다 수치% 확률로 HP 1 회복 (초당 최대 10)',
      dmg: '모든 무기 피해를 % 만큼 증가', melee: '근접 무기 1타에 고정 피해 추가', ranged: '원거리 무기·포탑 1타에 고정 피해 추가',
      elemental: '화염·번개·레이저 1타와 화상 피해 추가', atkSpd: '무기 공격 간격 단축',
      crit: '치명타 확률 · 치명타는 피해 2배', range: '원거리 사거리 증가 · 근접은 50%만 적용',
      armor: '받는 피해 감소 (음수면 증가)', dodge: '공격을 완전히 피할 확률 (최대 60%)',
      speed: '이동 속도 증가', luck: '처치 시 재화 추가 · 상점·상자·레벨업 등급 확률 증가',
      harvest: '웨이브가 끝날 때마다 재화 지급 (매 웨이브 5% 성장)', pickup: '재화·상자를 끌어오는 범위 증가',
      explosion: '폭발 범위와 폭발 피해 증가', thorns: '나를 때린 적에게 반사 피해',
      projectiles: '원거리 무기 발사 수 추가', knockback: '적을 밀쳐내는 힘 증가' },
    en: { maxHp: 'Maximum health', regen: 'Heal (value × 0.2) HP per second', lifesteal: 'Value % chance to heal 1 HP per hit (max 10/s)',
      dmg: 'Increases all weapon damage by %', melee: 'Flat damage added to each melee hit', ranged: 'Flat damage added to ranged and turret hits',
      elemental: 'Flat damage for fire, lightning, laser hits and burns', atkSpd: 'Shortens weapon cooldowns',
      crit: 'Critical chance · crits deal double damage', range: 'Longer ranged reach · melee gets only 50%',
      armor: 'Reduces damage taken (negative increases it)', dodge: 'Chance to fully avoid a hit (max 60%)',
      speed: 'Faster movement', luck: 'Extra currency on kills · better shop, crate and level-up grades',
      harvest: 'Currency paid at the end of each wave (grows 5% per wave)', pickup: 'Larger radius for pulling in currency and crates',
      explosion: 'Bigger explosions that hit harder', thorns: 'Damage reflected to enemies that hit you',
      projectiles: 'Extra shots for ranged weapons', knockback: 'Pushes enemies back harder' },
    'zh-TW': { maxHp: '最大生命值', regen: '每秒回復（數值 × 0.2）生命', lifesteal: '每次命中有數值%機率回復1生命（每秒最多10）',
      dmg: '所有武器傷害提高 %', melee: '近戰武器每擊追加固定傷害', ranged: '遠程武器與砲塔每擊追加固定傷害',
      elemental: '火焰、閃電、雷射每擊與燃燒追加傷害', atkSpd: '縮短武器攻擊間隔',
      crit: '暴擊機率 · 暴擊造成2倍傷害', range: '提高遠程射程 · 近戰只套用50%',
      armor: '減少受到的傷害（負值則增加）', dodge: '完全閃避攻擊的機率（最多60%）',
      speed: '提高移動速度', luck: '擊殺額外貨幣 · 提高商店、寶箱、升級品質機率',
      harvest: '每波結束時獲得貨幣（每波成長5%）', pickup: '擴大吸取貨幣與寶箱的範圍',
      explosion: '爆炸範圍與傷害提高', thorns: '對攻擊你的敵人反彈傷害',
      projectiles: '遠程武器額外發射數', knockback: '擊退敵人的力道提高' }
  };
  const setNames = {
    ko: { unarmed: '맨손', blade: '칼날', blunt: '둔기', gun: '총기', precise: '정밀', explosive: '폭발', elemental: '원소' },
    en: { unarmed: 'Unarmed', blade: 'Blade', blunt: 'Blunt', gun: 'Gun', precise: 'Precise', explosive: 'Explosive', elemental: 'Elemental' },
    'zh-TW': { unarmed: '徒手', blade: '刀刃', blunt: '鈍器', gun: '槍械', precise: '精準', explosive: '爆炸', elemental: '元素' }
  };
  const enemyText = {
    ko: { blob: ['말랑이', '천천히 다가오는 기본 적'], bug: ['벌레', '빠르게 달려드는 약한 적'],
      spitter: ['침뱉이', '거리를 두고 침을 쏜다'], charger: ['돌진이', '주기적으로 빠르게 돌진한다'],
      exploder: ['폭탄이', '가까이 오면 자폭한다'], splitter: ['분열이', '쓰러지면 말랑이 둘로 갈라진다'],
      tank: ['탱크', '단단하고 넉백에 강하다'], shielder: ['방패병', '주변 적이 받는 피해를 절반으로'], looter: ['도둑 두더지', '도망다니다 12초 뒤 사라진다 · 잡으면 재료 8개와 상자'], egg: ['괴물 알', '6초 안에 못 깨면 돌격병 2마리가 부화한다'], buffer: ['응원단장', '거리를 두고 주변 적의 속도·피해를 올린다(빨간 테두리)'],
      elite: ['엘리트', '8방향 탄막을 뿌리는 강적'], boss_1: ['중간 보스', '10웨이브 보스 · 탄막과 부하 소환'],
      boss_2: ['최종 보스', '20웨이브 보스 · 돌진·탄막·자폭병 소환'] },
    en: { blob: ['Blob', 'Slow, basic chaser'], bug: ['Bug', 'Fast but fragile'],
      spitter: ['Spitter', 'Keeps distance and spits'], charger: ['Charger', 'Dashes in bursts'],
      exploder: ['Exploder', 'Self-destructs up close'], splitter: ['Splitter', 'Splits into two blobs'],
      tank: ['Tank', 'Tough and hard to knock back'], shielder: ['Shielder', 'Halves damage to nearby enemies'], looter: ['Looter Mole', 'Flees and escapes after 12s · drops 8 materials and a crate'], egg: ['Monster Egg', 'Hatches two chargers unless broken within 6s'], buffer: ['Cheerleader', 'Keeps away and boosts nearby enemies\' speed and damage (red ring)'],
      elite: ['Elite', 'Fires 8-way bullet rings'], boss_1: ['Mid Boss', 'Wave 10 boss · bullets and minions'],
      boss_2: ['Final Boss', 'Wave 20 boss · dashes, bullets, exploders'] },
    'zh-TW': { blob: ['軟泥怪', '緩慢靠近的基本敵人'], bug: ['甲蟲', '衝得快但很脆弱'],
      spitter: ['吐液怪', '保持距離吐出酸液'], charger: ['衝鋒怪', '週期性高速衝撞'],
      exploder: ['自爆怪', '靠近後自爆'], splitter: ['分裂怪', '倒下後分裂成兩隻軟泥怪'],
      tank: ['坦克', '堅硬且不易被擊退'], shielder: ['盾衛', '周圍敵人受到的傷害減半'], looter: ['小偷鼴鼠', '到處逃跑，12秒後消失 · 擊倒掉落8個素材和寶箱'], egg: ['怪物蛋', '6秒內未打破會孵出2隻衝鋒者'], buffer: ['啦啦隊長', '保持距離並強化周圍敵人的速度與傷害（紅圈）'],
      elite: ['精英', '發射八方向彈幕的強敵'], boss_1: ['中頭目', '第10波頭目 · 彈幕與召喚'],
      boss_2: ['最終頭目', '第20波頭目 · 衝撞、彈幕、召喚自爆怪'] }
  };
  Object.assign(P.i18n, {
    statDesc(key) { return statDesc[language][key] || ''; },
    percent(key) { return percentStats.has(key); },
    setName(key) { return setNames[language][key] || key; },
    enemy(id) { return enemyText[language][id]?.[0] || id; },
    enemyDesc(id) { return enemyText[language][id]?.[1] || ''; }
  });
})(window);
