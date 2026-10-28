// W2: one existing arena per sortie. Read historical clears directly; no save migration/schema.
import { STAGES } from './combat.js';
import { OBJECTIVE_QUESTS } from './quest-expansion.js';
export const REGIONS = [
  { id:'outskirts', name:'마을 외곽', maps:['S1','S2','S3','S4'], pos:[50,8] },
  { id:'forest', name:'속삭이는 숲', maps:['S5','S6','S7'], pos:[50,24] },
  { id:'pass', name:'잿빛 고개', maps:['S8','S9','S10'], pos:[50,40] },
  { id:'mine', name:'녹슨 광산', maps:['S12','S17'], pos:[24,56] },
  { id:'swamp', name:'늑대 언덕·늪', maps:['S11','S13','S16','S18'], pos:[76,56] },
  { id:'throne', name:'왕좌 앞뜰', maps:['TD1'], pos:[24,92] },
  { id:'graveyard', name:'버려진 묘지', maps:['S21','S22','S23'], pos:[76,74] },
  { id:'necropolis', name:'망자의 지하묘역', maps:['S24','S25','S26','S27'], pos:[76,92] },
  { id:'cinder', name:'잿불 황야', maps:['S28','S29','S30'], pos:[50,92] },
  { id:'frost', name:'서리 동굴', maps:['S31','S32','S33'], pos:[24,108] },
  { id:'mire', name:'독안개 수렁', maps:['S34','S35','S36'], pos:[76,124] },
  { id:'dunes', name:'작열하는 사구', maps:['S37','S38','S39'], pos:[24,124] },
  { id:'spore', name:'포자 군락지', maps:['S40','S41','S42'], pos:[76,124] },
  { id:'abyss', name:'심연 해구', maps:['S43','S44','S45'], pos:[50,140] },
  { id:'clockwork', name:'태엽 폐허', maps:['S46','S47','S48'], pos:[24,156] },
  { id:'sky', name:'구름 첨탑', maps:['S49','S50','S51'], pos:[76,172] },
  { id:'orbital', name:'성층 궤도항', maps:['S52','S53','S54'], pos:[24,188] },
  { id:'lunar', name:'월면 생태정원', maps:['S55','S56','S57'], pos:[76,204] },
  { id:'castle', name:'무너진 성채', maps:['S14','S15','S19','S20'], pos:[24,74] },
];
export const REGION_EDGES = [['outskirts','forest'],['forest','pass'],['pass','mine'],['pass','swamp'],['mine','castle'],['swamp','castle'],['castle','throne'],['castle','graveyard'],['graveyard','necropolis'],['necropolis','cinder'],['cinder','frost'],['frost','mire'],['mire','dunes'],['dunes','spore'],['spore','abyss'],['abyss','clockwork'],['clockwork','sky'],['sky','orbital'],['orbital','lunar']];
export const MAPS = Object.fromEntries(REGIONS.flatMap(region => region.maps.map((id, index) => [id, {
  id, regionId:region.id, mainQuest:id,
  // Castle accepts EITHER completed branch, never both.
  requires: index ? [region.maps[index - 1]] : {outskirts:[],forest:['S4'],pass:['S7'],mine:['S10'],swamp:['S10'],castle:['S17','S18'],throne:['S20'],graveyard:['S20'],necropolis:['S23'],cinder:['S27'],frost:['S30'],mire:['S33'],dunes:['S36'],spore:['S39'],abyss:['S42'],clockwork:['S45'],sky:['S48'],orbital:['S51'],lunar:['S54']}[region.id],
}])));
for (const q of Object.values(OBJECTIVE_QUESTS)) MAPS[q.mapId] = { id:q.mapId, regionId:q.regionId, questId:q.id, requires:q.requires };
// Append after legacy gates were derived: QC1 never changes TD1's S20 requirement.
REGIONS.find(r => r.id === 'throne').maps.push('M_THRONE_GARGOYLE');
// Appended after all original campaign dependencies were derived.
const DRAGON_HUNTS={D_EMBER:['cinder','S30',29],D_FROST:['frost','S33',30],D_VENOM:['mire','S36',30]};
for(const [id,[regionId,gate]] of Object.entries(DRAGON_HUNTS)) {
 MAPS[id]={id,regionId,questId:id,requires:[gate]};
 REGIONS.find(r=>r.id===regionId).maps.push(id);
}
export function mapUnlocked(save, id) {
  const map = MAPS[id];
  if(DRAGON_HUNTS[id] && (!save.cleared?.[DRAGON_HUNTS[id][1]] || save.level<DRAGON_HUNTS[id][2])) return false;
  // Historical trial clears stay saved, but never bypass the official late-game gate.
  if (MAPS[id]?.regionId === 'graveyard' && !save.cleared?.S20) return false;
  if (map?.regionId === 'necropolis' && (!save.cleared?.S20 || !save.cleared?.S23)) return false;
  if (map?.regionId === 'cinder' && (!save.cleared?.S20 || !save.cleared?.S27)) return false;
  if (map?.regionId === 'frost' && (!save.cleared?.S20 || !save.cleared?.S27 || !save.cleared?.S30)) return false;
  if (map?.regionId === 'mire' && (!save.cleared?.S20 || !save.cleared?.S27 || !save.cleared?.S30 || !save.cleared?.S33)) return false;
  if (map?.regionId === 'dunes' && (!save.cleared?.S20 || !save.cleared?.S27 || !save.cleared?.S30 || !save.cleared?.S33 || !save.cleared?.S36)) return false;
  if (map?.regionId === 'lunar' && (!save.cleared?.S20 || !save.cleared?.S27 || !save.cleared?.S30 || !save.cleared?.S33 || !save.cleared?.S36 || !save.cleared?.S39 || !save.cleared?.S42 || !save.cleared?.S45 || !save.cleared?.S48 || !save.cleared?.S51 || !save.cleared?.S54)) return false;
  if (map?.regionId === 'orbital' && (!save.cleared?.S20 || !save.cleared?.S27 || !save.cleared?.S30 || !save.cleared?.S33 || !save.cleared?.S36 || !save.cleared?.S39 || !save.cleared?.S42 || !save.cleared?.S45 || !save.cleared?.S48 || !save.cleared?.S51)) return false;
  if (map?.regionId === 'sky' && (!save.cleared?.S20 || !save.cleared?.S27 || !save.cleared?.S30 || !save.cleared?.S33 || !save.cleared?.S36 || !save.cleared?.S39 || !save.cleared?.S42 || !save.cleared?.S45 || !save.cleared?.S48)) return false;
  if (map?.regionId === 'clockwork' && (!save.cleared?.S20 || !save.cleared?.S27 || !save.cleared?.S30 || !save.cleared?.S33 || !save.cleared?.S36 || !save.cleared?.S39 || !save.cleared?.S42 || !save.cleared?.S45)) return false;
  if (map?.regionId === 'abyss' && (!save.cleared?.S20 || !save.cleared?.S27 || !save.cleared?.S30 || !save.cleared?.S33 || !save.cleared?.S36 || !save.cleared?.S39 || !save.cleared?.S42)) return false;
  if (map?.regionId === 'spore' && (!save.cleared?.S20 || !save.cleared?.S27 || !save.cleared?.S30 || !save.cleared?.S33 || !save.cleared?.S36 || !save.cleared?.S39)) return false;
  if (id === 'TD1' || id === 'M_THRONE_GARGOYLE') return !!save.cleared?.S20;
  return !!map && (!!save.cleared?.[id] || !map.requires.length || map.requires.some(prior => !!save.cleared?.[prior]));
}
// Discovery is the playable frontier, not the entire authored catalogue. Keep late gates authoritative.
export const discoveredMaps = save => Object.keys(MAPS).filter(id => mapUnlocked(save, id));
export const discoveredRegions = save => {
  const maps = discoveredMaps(save);
  return REGIONS.filter(region => maps.some(id => MAPS[id].regionId === region.id));
};
// Flow-grid slots preserve the fork/rejoin route without absolute-positioned touch targets.
// 새 지역은 좌/우를 번갈아 배치, 막 관문은 0.
export const REGION_ROUTE = {
  outskirts:[1,0], forest:[2,0], pass:[3,0], mine:[4,1], swamp:[4,2],
  castle:[5,0], throne:[6,1], graveyard:[6,2], necropolis:[7,2], cinder:[8,0], frost:[9,1], mire:[10,2], dunes:[11,1], spore:[12,2], abyss:[13,0], clockwork:[14,1], sky:[15,2], orbital:[16,1], lunar:[17,2],
};
export const availableStages = save => Object.keys(STAGES).filter(id => mapUnlocked(save, id));
export const regionFor = id => REGIONS.find(region => region.id === MAPS[id]?.regionId);
export function mapState(save, id) {
  return !mapUnlocked(save, id) ? 'lock' : save.cleared?.[id] ? 'clear' : 'depart';
}
export const arrivalNotice = (save, id) => `${regionFor(id)?.name || ''} · ${save.cleared?.[id] ? '퀘스트' : '새 퀘스트'}: ${STAGES[id]?.name || id}`;
