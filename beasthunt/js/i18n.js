const D = {
  ko: {
menu:"메뉴",ready:"준비",ready_cancel:"준비 취소",begin:"시작",leave:"나가기",room:"방 코드",copy_link:"링크 복사",waiting:"대기",host:"방장",quick:"빠른 입장",create_room:"방 만들기",join_room:"입장",close:"닫기",rooms:"공개 방",solo:"솔로",
back_lobby:"로비",party: "파티",coop: "협동 · 2–4",version_mismatch: "버전: 불일치",connecting: "연결: 대기",hunt_locked: "사냥: 진행 중",disconnected: "연결: 종료",
    sub: '거수 사냥', tab_quest: '의뢰', tab_forge: '대장간', depart: '출발', locked: '잠김', reward: '보수', best: '최고 기록',
    currency: '휘석', rank0: '새벽', rank1: '황혼', q_hunt: '수렵', w_gs: '대검', w_db: '쌍검', w_bow: '활', armor: '방어구',
    t_iron: '철', t_boar: '가시엄니', t_frost: '서리갈기', t_ember: '잿불뿔', t_starforge: '별벼림',
    mon_boar: '브램블터스크', mon_frost: '프로스트메인', mon_ember: '엠버혼', m_b: '가시엄니', m_f: '서리갈기', m_e: '잿불뿔',
    p_hide: '가죽', p_fang: '송곳니', p_horn: '뿔', p_tail: '꼬리', p_gem: '심장결정',
    atk: '공격', def: '방어', hp: '체력', upgrade: '강화', max: '최대', equip: '장착', equipped: '장착 중', mats: '소재', none: '없음',
    faint: '기절', brk_head: '머리 파괴', brk_tail: '꼬리 절단', topple: '넘어뜨림', enrage: '분노', slain: '토벌 완료', timeout: '시간 초과',
    res_win: '퀘스트 클리어', res_fail: '퀘스트 실패', time: '소요 시간', loot: '획득 소재', back: '귀환', resume: '계속', abandon: '포기', paused: '일시정지',
    gold: '골드', record: '신기록', rage: '분노', faints: '기절',
    c_move: '이동', c_atk: '공격', c_heavy: '강공격(홀드)', c_roll: '회피', c_sprint: '달리기', c_potion: '물약', c_lock: '록온', c_cam: '시점',
    k_mouse: '마우스', k_lmb: '좌클릭', k_rmb: '우클릭', k_stick: '스틱', k_drag: '드래그', k_stickfar: '스틱 끝까지',
  },
  en: {
menu:"Menu",ready:"Ready",ready_cancel:"Not ready",begin:"Start",leave:"Leave",room:"Room code",copy_link:"Copy link",waiting:"Waiting",host:"Host",quick:"Quick join",create_room:"Create room",join_room:"Join",close:"Close",rooms:"Open rooms",solo:"Solo",
back_lobby:"Lobby",party: "Party",coop: "Co-op · 2–4",version_mismatch: "Version: mismatch",connecting: "Connection: waiting",hunt_locked: "Hunt: in progress",disconnected: "Connection: lost",
    sub: 'Hunt the Colossi', tab_quest: 'Quests', tab_forge: 'Forge', depart: 'Depart', locked: 'Locked', reward: 'Reward', best: 'Best',
    currency: 'Luma', rank0: 'Dawn', rank1: 'Dusk', q_hunt: 'Hunt', w_gs: 'Greatblade', w_db: 'Twin Fangs', w_bow: 'Bow', armor: 'Armor',
    t_iron: 'Iron', t_boar: 'Bramble', t_frost: 'Frost', t_ember: 'Ember', t_starforge: 'Starforge',
    mon_boar: 'Brambletusk', mon_frost: 'Frostmane', mon_ember: 'Emberhorn', m_b: 'Bramble', m_f: 'Frost', m_e: 'Ember',
    p_hide: 'Hide', p_fang: 'Fang', p_horn: 'Horn', p_tail: 'Tail', p_gem: 'Heartcrystal',
    atk: 'ATK', def: 'DEF', hp: 'HP', upgrade: 'Upgrade', max: 'MAX', equip: 'Equip', equipped: 'Equipped', mats: 'Materials', none: 'None',
    faint: 'Fainted', brk_head: 'Head Broken', brk_tail: 'Tail Severed', topple: 'Toppled', enrage: 'Enraged', slain: 'Target Slain', timeout: 'Time Up',
    res_win: 'Quest Clear', res_fail: 'Quest Failed', time: 'Time', loot: 'Rewards', back: 'Return', resume: 'Resume', abandon: 'Abandon', paused: 'Paused',
    gold: 'Gold', record: 'New Record', rage: 'RAGE', faints: 'Faints',
    c_move: 'Move', c_atk: 'Attack', c_heavy: 'Heavy (hold)', c_roll: 'Dodge', c_sprint: 'Sprint', c_potion: 'Potion', c_lock: 'Lock-on', c_cam: 'Camera',
    k_mouse: 'Mouse', k_lmb: 'LMB', k_rmb: 'RMB', k_stick: 'Stick', k_drag: 'Drag', k_stickfar: 'Stick to edge',
  },
  'zh-TW': {
menu:"選單",ready:"準備",ready_cancel:"取消準備",begin:"開始",leave:"離開",room:"房間代碼",copy_link:"複製連結",waiting:"等待",host:"房主",quick:"快速加入",create_room:"建立房間",join_room:"加入",close:"關閉",rooms:"公開房間",solo:"單人",
back_lobby:"大廳",party: "隊伍",coop: "合作 · 2–4",version_mismatch: "版本: 不符",connecting: "連線: 等待",hunt_locked: "狩獵: 進行中",disconnected: "連線: 中斷",
    sub: '巨獸狩獵', tab_quest: '委託', tab_forge: '鍛造', depart: '出發', locked: '未解鎖', reward: '報酬', best: '最佳紀錄',
    currency: '輝石', rank0: '曙光', rank1: '暮光', q_hunt: '狩獵', w_gs: '大劍', w_db: '雙劍', w_bow: '弓', armor: '防具',
    t_iron: '鐵', t_boar: '棘牙', t_frost: '霜鬃', t_ember: '燼角', t_starforge: '星鑄',
    mon_boar: '棘牙獸', mon_frost: '霜鬃獸', mon_ember: '燼角龍', m_b: '棘牙', m_f: '霜鬃', m_e: '燼角',
    p_hide: '皮', p_fang: '利牙', p_horn: '角', p_tail: '尾', p_gem: '心晶',
    atk: '攻擊', def: '防禦', hp: '體力', upgrade: '強化', max: '最高', equip: '裝備', equipped: '裝備中', mats: '素材', none: '無',
    faint: '昏厥', brk_head: '頭部破壞', brk_tail: '尾巴切斷', topple: '倒地', enrage: '憤怒', slain: '討伐完成', timeout: '時間到',
    res_win: '任務完成', res_fail: '任務失敗', time: '花費時間', loot: '獲得素材', back: '返回', resume: '繼續', abandon: '放棄', paused: '暫停',
    gold: '金幣', record: '新紀錄', rage: '憤怒', faints: '昏厥',
    c_move: '移動', c_atk: '攻擊', c_heavy: '重擊(長按)', c_roll: '迴避', c_sprint: '奔跑', c_potion: '藥水', c_lock: '鎖定', c_cam: '視角',
    k_mouse: '滑鼠', k_lmb: '左鍵', k_rmb: '右鍵', k_stick: '搖桿', k_drag: '拖曳', k_stickfar: '搖桿推到底',
  },
};
const ORDER = ['ko', 'en', 'zh-TW'];
let lang = 'ko';
try {
  const s = localStorage.getItem('beasthunt_lang');
  if (s && D[s]) lang = s; else { const n = (navigator.language || 'ko').toLowerCase(); lang = n.startsWith('ko') ? 'ko' : n.startsWith('zh') ? 'zh-TW' : 'en'; }
} catch (_) { /* default ko */ }
export const t = (k) => (D[lang] && D[lang][k]) || D.en[k] || k;
export const getLang = () => lang;
export function nextLang() { lang = ORDER[(ORDER.indexOf(lang) + 1) % ORDER.length]; try { localStorage.setItem('beasthunt_lang', lang); } catch (_) { /* ignore */ } return lang; }
export const matName = (id) => { const [m, p] = id.split('_'); return t('m_' + m) + ' ' + t('p_' + p); };
export const LANG_LABEL = { ko: '한국어', en: 'English', 'zh-TW': '繁體中文' };
