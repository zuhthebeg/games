import { HUMAN_ID } from './encounter.js';
export const ART_BINDINGS = Object.freeze({ blade: 'skeleton-warrior', [HUMAN_ID]: 'hero-sword' });

// Only the asynchronous asset-loading identity is adapted. Factory update() receives
// the real simulation entity. No alias manifest, combat entity rename or team flip.
export function installEncounterArt(provider) {
  const skeleton = provider.factories.get('skeleton_warrior');
  const human = provider.factories.get('blade');
  if (!skeleton || !human) throw new Error('Required registered atlas factory missing');
  provider.register('blade', (entity, options) => skeleton(
    { ...entity, kind: 'monster', type: 'skeleton_warrior' }, { ...options, color: 0xffffff, equipment: null }));
  provider.register(HUMAN_ID, (entity, options) => human(
    { ...entity, kind: 'player', weapon: 'blade' }, { ...options, color: 0xffffff, equipment: null }));
}
