// Presentation-only identity lookup. Never writes entities or reads simulation RNG.
export const PROFILE_FILES = Object.freeze(['bone-hit', 'dry-hit', 'ghost-hit', 'bone-death',
  'dry-death', 'ghost-death', 'beast-death', 'demon-death', 'goleling-death', 'slime-death', 'dragon-death',
  'blade-cast', 'blunt-cast', 'bow-cast', 'fire-cast', 'ice-cast', 'heal-cast', 'arcane-cast',
  'blade-impact', 'blunt-impact', 'bow-impact', 'fire-impact', 'ice-impact', 'heal-impact', 'arcane-impact',
  'perfect-dodge', 'counter-hit']);
const species = (hit, death, pitch = 1) => Object.freeze({ hit, death, pitch });
export const SPECIES_AUDIO = Object.freeze({
  skeleton_minion: species('bone-hit', 'bone-death', 1.12),
  skeleton_warrior: species('bone-hit', 'bone-death', .88),
  skeleton_rogue: species('bone-hit', 'bone-death', 1.28),
  skeleton_mage: species('bone-hit', 'bone-death', 1.02),
  ghoul: species('dry-hit', 'dry-death', .91),
  ghost: species('ghost-hit', 'ghost-death', 1.06),
  wolf: species('dry-hit', 'beast-death', 1.07),
  iron_boar: species('dry-hit', 'beast-death', .78),
  bat: species('dry-hit', 'beast-death', 1.3),
  poison_spider: species('dry-hit', 'dry-death', 1.2),
  demon: species('dry-hit', 'demon-death', .86),
  succubus: species('dry-hit', 'demon-death', 1.14),
  goleling: species('bone-hit', 'goleling-death', 1.15),
  slime: species('dry-hit', 'slime-death', .97),
  throne_dragon: species('dry-hit', 'dragon-death', .82),
  training_dragon: species('dry-hit', 'dragon-death', .94),
  spirit: species('ghost-hit', 'ghost-death', 1.2),
  rune_guardian: species('bone-hit', 'goleling-death', .75),
  gargoyle: species('bone-hit', 'goleling-death', .9),
});
const entity = (entities, id) => entities?.find(e => e.id === id);
const cue = (name, fallback, pitch = 1, gain = 1, key = name, cooldown = .025) =>
  ({ name, fallback, pitch, gain, key, cooldown });
const SKILLS = Object.freeze({ slash: 'blade', lunge: 'blade', whirl: 'blade', heavy_cleave: 'blade',
  ground_slam: 'blunt', armor_break: 'blunt', arrow: 'bow', volley: 'bow', pierce_shot: 'bow', triple_arrow: 'bow', evasion_shot: 'bow',
  blast_arrow: 'fire', ember_bolt: 'fire', flame_ring: 'fire', frost_lance: 'ice',
  focus_pulse: 'arcane', healing_light: 'heal' });
const SKILL_PITCH = Object.freeze({ lunge: 1.12, whirl: .94, heavy_cleave: .84,
  ground_slam: .8, armor_break: 1.08, volley: .94, pierce_shot: 1.16,
  blast_arrow: 1.13, ember_bolt: 1, flame_ring: .86, frost_lance: 1.1 });
export function skillAudio(ability, source) {
  const family = SKILLS[ability];
  return family === 'blade' && source?.weaponForm === 'blunt' ? 'blunt' : family;
}
export function eventCues(event, localId, entities = []) {
  const source = entity(entities, event.src ?? event.id);
  if (event.type === 'act' && event.id === localId) {
    // Healing confirms only at healCast; windup/act phases must not repeat its bell.
    if (event.ability === 'healing_light') return [];
    const family = skillAudio(event.ability, source);
    return [cue(family ? `${family}-cast` : 'swing', 'swing', SKILL_PITCH[event.ability] ?? 1, .72,
      `cast:${event.id}:${event.ability}`, .09)];
  }
  if (event.type === 'healCast' && event.id === localId)
    return [cue('heal-cast', 'level-up', 1, .7, 'heal-cast', .1)];
  if (event.type === 'heal' && event.src === localId)
    return [cue('heal-impact', 'level-up', 1, .6, 'heal-impact', .1)];
  if (event.type === 'perfectDodge' && event.id === localId)
    return [cue('perfect-dodge', 'dodge', 1, .8, 'perfect-dodge', .09)];
  if (event.type === 'dodge' && event.id === localId) return [cue('dodge', 'dodge')];
  if (event.type === 'hit') {
    if (event.dst === localId) return [cue('hurt', 'hurt')];
    // Only the actual confirmed hit flag is a counter payoff, not counter act,
    // ordinary crit/exposed, pendingCounter or a guessed post-dodge interval.
    if (event.counter === true && event.src === localId)
      return [cue('counter-hit', 'critical', 1, 1, 'counter-hit', .09)];
    const target = entity(entities, event.dst);
    const profile = target?.kind === 'monster' ? SPECIES_AUDIO[target.type] : null;
    const fallback = event.crit || event.critical || event.exposed ? 'critical' : 'hit';
    const cues = [cue(profile?.hit ?? fallback, fallback, profile?.pitch ?? 1,
      profile ? .85 : 1)];
    // Actual hit, separate from launch. Unknown remote source remains generic.
    const family = source?.kind === 'player' ? skillAudio(event.ability, source) : null;
    if (profile && fallback === 'critical') cues.push(cue('critical', 'critical', 1, .45));
    else if (family && event.src === localId) cues.push(cue(`${family}-impact`, null, SKILL_PITCH[event.ability] ?? 1, .5,
      `impact:${event.src}:${event.ability}`, .08));
    return cues;
  }
  if (event.type === 'kill') {
    // Kill carries authoritative species even if the entity already disappeared.
    const target = entity(entities, event.id);
    const profile = SPECIES_AUDIO[event.monster ?? (target?.kind === 'monster' ? target.type : '')];
    return [cue(profile?.death ?? 'kill', 'kill', profile?.pitch ?? 1, .88)];
  }
  if (event.type === 'death' && event.id === localId) return [cue('hurt', 'hurt')];
  return [];
}
