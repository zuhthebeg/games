(function (root) {
  'use strict';
  const P = root.SPUD = root.SPUD || {};
  const stats = {
    ko: ['최대 HP', '재생', '흡혈', '공격력', '근접 피해', '원거리 피해', '공격 속도', '치명타', '사거리', '방어력', '회피', '이동 속도', '행운', '수확', '흡수 범위'],
    en: ['Max HP', 'Regen', 'Lifesteal', 'Damage', 'Melee', 'Ranged', 'Attack speed', 'Critical', 'Range', 'Armor', 'Dodge', 'Speed', 'Luck', 'Harvest', 'Pickup radius'],
    'zh-TW': ['最大生命', '生命回復', '吸血', '攻擊力', '近戰傷害', '遠程傷害', '攻擊速度', '暴擊', '射程', '護甲', '閃避', '移動速度', '幸運', '收穫', '拾取範圍']
  };
  const statKeys = Object.keys(P.data.stats);
  const names = {
    chars: {
      en: ['Starter Spud', 'Muscle Spud', 'Science Spud', 'Lucky Spud'],
      'zh-TW': ['基本馬鈴薯', '肌肉馬鈴薯', '科學馬鈴薯', '幸運馬鈴薯']
    },
    weapons: {
      en: ['Fist', 'Stick', 'Slingshot', 'Pistol', 'Shotgun', 'SMG', 'Laser', 'Rocket'],
      'zh-TW': ['拳頭', '木棍', '彈弓', '手槍', '霰彈槍', '衝鋒槍', '雷射', '火箭']
    },
    items: {
      en: ['Potato Armor', 'Hot Sauce', 'Energy Drink', 'Magnet', 'Clover', 'Bandage', 'Vampire Fang', 'Sneakers', 'Scope', 'Dumbbell', 'Battery', 'Heart Jar', 'Garden Glove', 'Helmet', 'Feather', 'Lucky Coin'],
      'zh-TW': ['馬鈴薯盔甲', '辣醬', '能量飲料', '磁鐵', '四葉草', '繃帶', '吸血尖牙', '運動鞋', '瞄準鏡', '啞鈴', '電池', '愛心瓶', '園藝手套', '頭盔', '羽毛', '幸運硬幣']
    }
  };
  const features = {
    ko: ['근접 찌르기', '전방 90° 휘두르기', '한 번 튕기는 탄환', '적 한 명 관통', '30° 산탄 4발', '8° 탄퍼짐', '무한 관통 빔', '반경 70 폭발'],
    en: ['Close-range jab', '90° sweeping strike', 'Bounces once', 'Pierces one target', 'Four pellets in a 30° spread', '8° bullet spread', 'Infinite-piercing beam', 'Explosion radius 70'],
    'zh-TW': ['近距離刺擊', '前方 90° 揮擊', '彈跳一次', '穿透一個目標', '30° 散射四發', '8° 子彈擴散', '無限穿透光束', '半徑 70 爆炸']
  };
  const strings = {
    ko: {
      title: '감자특공대', subtitle: '함께 버텨라, 끝까지!', solo: '혼자 하기', multi: '같이 하기',
      choose: '특공대를 골라!', ready: '준비 완료', wait: '동료를 기다리는 중…', balanced: '균형형',
      shop: '전투 준비', buy: '구매', reroll: '다시 뽑기', stats: '내 스탯', merge: '합치기', sell: '판매',
      items: '획득한 아이템', locked: '잠금', wave: '웨이브', win: '감자특공대 승리!', lose: '전멸했다!',
      back: '처음으로', next: '다음 웨이브', left: '남은 선택', damage: '피해', cool: '간격', reach: '사거리',
      weapon: '시작 무기', selected: '선택한 무기', slots: '무기 슬롯', seconds: '초', empty: '아직 없음'
    },
    en: {
      title: 'Spud Squad', subtitle: 'Stick together. Survive the horde.', solo: 'Play Solo', multi: 'Play Co-op',
      choose: 'Choose your spud!', ready: 'Ready', wait: 'Waiting for your squad…', balanced: 'Balanced',
      shop: 'Supply Shop', buy: 'Buy', reroll: 'Reroll', stats: 'My Stats', merge: 'Merge', sell: 'Sell',
      items: 'Collected Items', locked: 'Lock', wave: 'Wave', win: 'Spud Squad Wins!', lose: 'Squad Defeated',
      back: 'Main Menu', next: 'Next Wave', left: 'Choices left', damage: 'Damage', cool: 'Cooldown', reach: 'Range',
      weapon: 'Starting weapon', selected: 'Selected weapon', slots: 'Weapon slots', seconds: 's', empty: 'None yet'
    },
    'zh-TW': {
      title: '馬鈴薯特攻隊', subtitle: '團結到底，撐過每一波！', solo: '單人遊玩', multi: '多人合作',
      choose: '選擇你的馬鈴薯！', ready: '準備完成', wait: '等待隊友…', balanced: '均衡型',
      shop: '補給商店', buy: '購買', reroll: '重抽', stats: '我的屬性', merge: '合併', sell: '出售',
      items: '已獲得道具', locked: '鎖定', wave: '波次', win: '馬鈴薯特攻隊勝利！', lose: '全軍覆沒',
      back: '回主選單', next: '下一波', left: '剩餘選擇', damage: '傷害', cool: '冷卻', reach: '射程',
      weapon: '起始武器', selected: '選定武器', slots: '武器欄', seconds: '秒', empty: '尚無'
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
    effect(changes) {
      return Object.entries(changes).map(([key, n]) =>
        `${this.stat(key)} ${n > 0 ? '+' : ''}${n}${['dmg', 'atkSpd', 'crit', 'dodge', 'speed', 'luck', 'pickup', 'lifesteal'].includes(key) ? '%' : ''}`
      );
    }
  };
})(window);
