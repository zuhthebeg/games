// Distinct equipped slots only. Legacy IDs acquire metadata without rewriting saves.
export const EQUIPMENT_SETS = Object.freeze({
  boar: {name:'멧돼지',parts:3,bonuses:[{count:2,label:'최대 HP +12',maxHp:12},{count:3,label:'소지 한도 +8 kg',capacity:8}]},
  warden: {name:'파수꾼',parts:2,bonuses:[{count:2,label:'방어력 +8 · HP 재생 +0.15/초',ac:8,hpRegen:.15}]},
  hunter: {name:'사냥꾼',parts:2,bonuses:[{count:2,label:'이동속도 +3% · 소지 한도 +5 kg',speed_pct:3,capacity:5}]},
  ossuary: {name:'납골당',parts:2,bonuses:[{count:2,label:'최대 HP +16 · 방어력 +4',maxHp:16,ac:4}]},
  soulfire: {name:'넋불',parts:2,bonuses:[{count:2,label:'MP 재생 +0.25/초',mpRegen:.25}]},
  dragon: {name:'수호룡',parts:2,bonuses:[{count:2,label:'최대 HP +20 · 무기 공격력 +5%',maxHp:20,atk_pct:5}]},
  bone: {name:'뼈',parts:5,bonuses:[{count:5,label:'출정당 1회 HP 30% 해골 부활',boneRevival:true}]},
});
