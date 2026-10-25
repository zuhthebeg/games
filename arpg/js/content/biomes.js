// New frost palette: deployment-safe content-addressed import.
// Presentation-only palettes. No collision, simulation RNG or network state.
const biome = (tiles, path, accent, boundary, props) => ({ tiles, path, accent, boundary, props });
export const BIOMES = {
  lunar_garden: biome([0x202638,0x252b3d,0x1c2234,0x293044],0x34384c,0x3b3a56,'roots',
    ['bush','flowers','roots','slab','rune','water','reeds','pebbles']),
  orbital_dock: biome([0x1d2934,0x22303d,0x192630,0x293644],0x334553,0x304858,'wall',['slab','beam','rails','crack','crate','rune','pebbles','brazier']),
  sky_spire: biome([0x2e2a3a, 0x322d3f, 0x2a2636, 0x363144], 0x433b52, 0x4a4060, 'wall',
    ['slab', 'column', 'broken_column', 'rune', 'urn', 'rubble', 'brazier', 'pebbles']),
  clockwork_ruins: biome([0x2d2925, 0x312c27, 0x29251f, 0x35302a], 0x463b2c, 0x4c3c2b, 'wall',
    ['wheel', 'rails', 'slab', 'crack', 'beam', 'rubble', 'crate', 'brazier']),
  abyssal_trench: biome([0x152a33, 0x172e38, 0x13262f, 0x1a323c], 0x22404a, 0x2b4752, 'rocks',
    ['water', 'reeds', 'stones', 'crack', 'rune', 'broken_column', 'urn', 'pebbles']),
  spore_hollow: biome([0x1f2433, 0x222837, 0x1c2130, 0x252b3a], 0x2c3b46, 0x3a3550, 'roots',
    ['mushroom', 'roots', 'stones', 'bush', 'crack', 'pebbles', 'log', 'rune']),
  sun_dunes: biome([0x3a3226, 0x3e3529, 0x352d22, 0x42392b], 0x4a3f2e, 0x524430, 'rocks',
    ['drygrass', 'stones', 'boulder', 'crack', 'pebbles', 'broken_column', 'urn', 'splinters']),
  mire_fen: biome([0x20302a, 0x24352b, 0x1d2d24, 0x29392d], 0x314336, 0x354735, 'roots',
    ['water', 'reeds', 'lily', 'roots', 'log', 'mushroom', 'bush', 'stones']),
  frost_cavern: biome([0x25343a, 0x2b3b42, 0x213138, 0x304048], 0x30464b, 0x31484d, 'rocks',
    ['stones', 'crack', 'rune', 'boulder', 'column', 'water', 'pebbles', 'broken_column']),
  cinder_wastes: biome([0x302a29, 0x342d2a, 0x292625, 0x3a3029], 0x493631, 0x5c3b30, 'rocks',
    ['ash', 'crack', 'drygrass', 'stones', 'boulder', 'splinters', 'rune', 'brazier']),
  village_outskirts: biome([0x252f23, 0x283225, 0x222c21, 0x2b3427], 0x39362b, 0x42402f, 'fence',
    ['grass', 'pebbles', 'flowers', 'stump', 'barrel', 'fence', 'hay', 'tree']),
  forest: biome([0x182b27, 0x1b2e29, 0x152824, 0x1e302b], 0x293831, 0x304338, 'roots',
    ['fern', 'roots', 'mushroom', 'log', 'bush', 'stones', 'stump', 'tree']),
  ash_pass: biome([0x333236, 0x363539, 0x302f33, 0x39383c], 0x414044, 0x444045, 'rocks',
    ['ash', 'crack', 'drygrass', 'stones', 'wheel', 'cart', 'boulder', 'splinters']),
  mine: biome([0x342e23, 0x373126, 0x312b20, 0x3a3429], 0x423b2d, 0x46402e, 'timber',
    ['rails', 'ore', 'splinters', 'barrel', 'beam', 'cart', 'stones', 'crate']),
  marsh: biome([0x1e3037, 0x21333a, 0x1b2d34, 0x24363d], 0x293d43, 0x304346, 'rocks',
    ['water', 'reeds', 'lily', 'roots', 'log', 'bush', 'stones', 'mushroom']),
  fortress: biome([0x2b313f, 0x2e3442, 0x282e3c, 0x313745], 0x394150, 0x3c4750, 'wall',
    ['slab', 'crack', 'rune', 'stones', 'column', 'rubble', 'shield', 'brazier']),
  nest: biome([0x30273b, 0x332a3e, 0x2d2438, 0x362d41], 0x3d3447, 0x413849, 'roots',
    ['web', 'eggs', 'roots', 'stones', 'cocoon', 'bush', 'crack', 'mushroom']),
  throne_forecourt: biome([0x302c31, 0x332f34, 0x2d292e, 0x363237], 0x40383b, 0x494248, 'wall',
    ['slab', 'crack', 'rune', 'broken_column', 'brazier', 'shield', 'rubble', 'urn']),
  graveyard: biome([0x242b32, 0x272e35, 0x21282f, 0x2a3138], 0x353b41, 0x3d4349, 'wall',
    ['slab', 'crack', 'broken_column', 'urn', 'rubble', 'drygrass', 'stones', 'brazier']),
  throne: biome([0x39262b, 0x3c292e, 0x362328, 0x3f2c31], 0x4b3039, 0x493840, 'wall',
    ['carpet', 'slab', 'rune', 'column', 'brazier', 'shield', 'rubble', 'urn'])
};
export const STAGE_BIOMES = Object.fromEntries([
  ...[55,56,57].map(n => ['S' + n, 'lunar_garden']),
  ...[52,53,54].map(n => ['S' + n, 'orbital_dock']),
  ...[49,50,51].map(n => ['S' + n, 'sky_spire']),
  ...[46,47,48].map(n => ['S' + n, 'clockwork_ruins']),
  ...[43,44,45].map(n => ['S' + n, 'abyssal_trench']),
  ...[40,41,42].map(n => ['S' + n, 'spore_hollow']),
  ...[37,38,39].map(n => ['S' + n, 'sun_dunes']),
  ...[34,35,36].map(n => ['S' + n, 'mire_fen']),
  ...[31,32,33].map(n => ['S' + n, 'frost_cavern']),
  ...[28,29,30].map(n => ['S' + n, 'cinder_wastes']),
  ...[1, 2, 3, 4].map(n => [`S${n}`, 'village_outskirts']),
  ...[5, 6, 7, 11, 16].map(n => [`S${n}`, 'forest']),
  ...[8, 9, 10].map(n => [`S${n}`, 'ash_pass']),
  ['M_THRONE_GARGOYLE', 'fortress'], ['M_MARSH_MARKERS', 'marsh'], ['M_MINE_CART', 'mine'], ['S12', 'mine'], ['S13', 'marsh'],
  ...[14, 15, 17, 19].map(n => [`S${n}`, 'fortress']),
  ...[24,25,26,27].map(n => [`S${n}`, 'graveyard']), ['S21','graveyard'], ['S22','graveyard'], ['S23','graveyard'], ['S18', 'nest'], ['S20', 'throne'], ['TD1', 'throne_forecourt']
]);
export const biomeForStage = stageId => STAGE_BIOMES[stageId] || 'village_outskirts';
// Derived solely from stageId; guest snapshots do not carry simulation RNG/seed.
export function biomeSeed(stageId = 'S1') {
  let seed = 2166136261;
  for (const char of stageId) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  return seed >>> 0;
}
