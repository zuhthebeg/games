// W2: one existing arena per sortie. Read historical clears directly; no save migration/schema.
import { STAGES } from './combat.js';
export const REGIONS = [
  { id:'outskirts', name:'마을 외곽', maps:['S1','S2','S3','S4'], pos:[50,8] },
  { id:'forest', name:'속삭이는 숲', maps:['S5','S6','S7'], pos:[50,27] },
  { id:'pass', name:'잿빛 고개', maps:['S8','S9','S10'], pos:[50,46] },
  { id:'mine', name:'녹슨 광산', maps:['S12','S17'], pos:[24,65] },
  { id:'swamp', name:'늑대 언덕·늪', maps:['S11','S13','S16','S18'], pos:[76,65] },
  { id:'castle', name:'무너진 성채', maps:['S14','S15','S19','S20'], pos:[50,89] },
];
export const REGION_EDGES = [['outskirts','forest'],['forest','pass'],['pass','mine'],['pass','swamp'],['mine','castle'],['swamp','castle']];
export const MAPS = Object.fromEntries(REGIONS.flatMap(region => region.maps.map((id, index) => [id, {
  id, regionId:region.id, mainQuest:id,
  // Castle accepts EITHER completed branch, never both.
  requires: index ? [region.maps[index - 1]] : {outskirts:[],forest:['S4'],pass:['S7'],mine:['S10'],swamp:['S10'],castle:['S17','S18']}[region.id],
}])));
export function mapUnlocked(save, id) {
  const map = MAPS[id];
  return !!map && (!!save.cleared?.[id] || !map.requires.length || map.requires.some(prior => !!save.cleared?.[prior]));
}
export const availableStages = save => Object.keys(STAGES).filter(id => mapUnlocked(save, id));
export const regionFor = id => REGIONS.find(region => region.id === MAPS[id]?.regionId);
export function mapState(save, id) {
  return save.cleared?.[id] ? 'clear' : mapUnlocked(save, id) ? 'depart' : 'lock';
}
export const arrivalNotice = (save, id) => `${regionFor(id)?.name || ''} · ${save.cleared?.[id] ? '퀘스트' : '새 퀘스트'}: ${STAGES[id]?.name || id}`;
