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
      '한 번 튕김', '한 명 관통', '30° 산탄 4발', '8° 탄퍼짐', '두 명 관통',
      '무한 관통 빔', '반경 70 폭발', '40° 원뿔 화상', '번개 3회 연쇄'],
    en: ['Thrust', 'Critical bleed', 'Piercing thrust', '120° sweep', 'Impact shockwave',
      'One bounce', 'Pierces one', 'Four pellets', '8° spread', 'Pierces two',
      'Infinite beam', 'Radius 70 explosion', 'Burning cone', 'Three chain jumps'],
    'zh-TW': ['刺擊', '暴擊流血', '穿透刺擊', '120°橫掃', '落地衝擊波',
      '反彈一次', '穿透一名', '四發散彈', '8°散射', '穿透兩名',
      '無限穿透光束', '半徑70爆炸', '扇形燃燒', '連鎖閃電三次']
  };
  const traits = {
    ko: ['매 웨이브 첫 상점 리롤 무료', '넉백 50% 강화', '원소 피해 25% 강화',
      '처치 시 상자 2% 확률', '총 피해 +20% · 상점에 근접 무기 없음',
      '잃은 HP 10%마다 피해 +6% · 재생 0', '재생 0 · 웨이브 시작 HP 절반',
      '처치 시 10% 폭발 · 자폭 피해 없음', '무기 1칸 · 피해 3배, 공속 +60%, 투사체 +2',
      '회피 시 0.5초 무적 · 다음 공격 확정 치명',
      '웨이브 시작 시 보유 재화의 8% 추가 (최대 12) · 피해 -15%',
      '피격 시 가시 피해 6 · 이동 속도 -12% · 회피 -8%'],
    en: ['First shop reroll free each wave', 'Knockback +50%', 'Elemental damage +25%',
      '2% crate on kill', 'Gun damage +20% · no melee in shop',
      '+6% damage per 10% HP lost · no regen', 'No regen · start waves at half HP',
      '10% death explosion · no self-damage', 'One weapon slot · 3× damage, +60% speed, +2 projectiles',
      'Dodge grants 0.5s immunity and guaranteed crit',
      'Gain 8% of saved currency at wave start (max 12) · damage -15%',
      'Return 6 damage when hit · speed -12% · dodge -8%'],
    'zh-TW': ['每波商店首次重抽免費', '擊退 +50%', '元素傷害 +25%',
      '擊殺時 2% 掉落寶箱', '槍械傷害 +20% · 商店無近戰武器',
      '每失去10%生命增加6%傷害 · 無回復', '無回復 · 每波半血開始',
      '擊殺時10%爆炸 · 不會自傷', '僅一個武器欄 · 傷害3倍、攻速+60%、投射物+2',
      '閃避後無敵0.5秒，下次攻擊必暴擊',
      '每波開始獲得存款8%（最多12）· 傷害 -15%',
      '受擊反彈6點傷害 · 移速 -12% · 閃避 -8%']
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
})(window);
