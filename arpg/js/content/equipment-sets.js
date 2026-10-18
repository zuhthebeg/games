// Distinct equipped slots only. Legacy IDs acquire metadata without rewriting saves.
export const EQUIPMENT_SETS = Object.freeze({
  boar: {name:'멧돼지',parts:3,bonuses:[{count:2,label:'최대 HP +12',maxHp:12},{count:3,label:'소지 한도 +8 kg',capacity:8}]},
  warden: {name:'파수꾼',parts:2,bonuses:[{count:2,label:'방어력 +8 · HP 재생 +0.15/초',ac:8,hpRegen:.15}]},
  bone: {name:'뼈',parts:5,bonuses:[{count:5,label:'출정당 1회 HP 30% 해골 부활',boneRevival:true}]},
});
