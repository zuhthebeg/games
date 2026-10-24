// Presentation-only identity lookup. Never writes entities or reads simulation RNG.
export const PROFILE_FILES = Object.freeze(['bone-hit', 'dry-hit', 'ghost-hit', 'bone-death',
  'dry-death', 'ghost-death', 'demon-death', 'slime-death',
  'wolf-hit', 'wolf-death', 'boar-hit', 'boar-death', 'bat-hit', 'bat-death',
  'spider-hit', 'spider-death', 'goblin-hit', 'goblin-death', 'stone-hit', 'stone-death',
  'slime-hit', 'demon-hit', 'dragon-hit', 'dragon-death',
  'blade-cast', 'blunt-cast', 'bow-cast', 'fire-cast', 'ice-cast', 'heal-cast', 'arcane-cast',
  'blade-impact', 'blunt-impact', 'bow-impact', 'fire-impact', 'ice-impact', 'heal-impact', 'arcane-impact',
  'perfect-dodge', 'counter-hit']);
const species = (hit, death, pitch = 1) => Object.freeze({ hit, death, pitch });
export const SPECIES_AUDIO = Object.freeze({
  sky_armabee: species('slime-hit', 'boar-death', 1.4),
  sky_pigeon: species('dry-hit', 'boar-death', 1.25),
  sky_birb: species('stone-hit', 'dragon-death', .85),
  clock_drone: species('stone-hit', 'dry-death', 1.32),
  clock_walker: species('stone-hit', 'stone-death', 1.1),
  clock_colossus: species('stone-hit', 'dragon-death', .7),
  abyss_glub: species('slime-hit', 'boar-death', 1.08),
  drowned_skull: species('bone-hit', 'ghost-death', 1.22),
  abyss_squidle: species('slime-hit', 'stone-death', .8),
  spore_mushnub: species('slime-hit', 'slime-death', 1.18),
  gale_hywirl: species('ghost-hit', 'ghost-death', 1.3),
  spore_king: species('boar-hit', 'stone-death', .74),
  dune_cactoro: species('dry-hit', 'goblin-death', .88),
  sun_totem: species('ghost-hit', 'ghost-death', 1.12),
  crown_alpaking: species('bat-hit', 'bat-death', .78),
  marsh_wasp: species('bat-hit', 'bat-death', 1.25),
  bog_wizard: species('ghost-hit', 'ghost-death', .92),
  mire_frog: species('boar-hit', 'boar-death', 1.16),
  orc_raider: species('goblin-hit', 'goblin-death', .83),
  frost_yeti: species('boar-hit', 'boar-death', .9),
  stone_giant: species('stone-hit', 'stone-death', .7),
  ash_reaver: species('dry-hit', 'dry-death', .84),
  veil_stalker: species('dry-hit', 'dry-death', 1.2),
  cinder_oracle: species('ghost-hit', 'ghost-death', .95),
  necropolis_lord: species('bone-hit', 'bone-death', .75),
  skeleton_minion: species('bone-hit', 'bone-death', 1.12),
  skeleton_warrior: species('bone-hit', 'bone-death', .88),
  skeleton_rogue: species('bone-hit', 'bone-death', 1.28),
  skeleton_mage: species('bone-hit', 'bone-death', 1.02),
  goblin_grunt: species('goblin-hit', 'goblin-death', 1.05),
  goblin_slinger: species('goblin-hit', 'goblin-death', 1.14),
  goblin_chief: species('goblin-hit', 'goblin-death', .85),
  scarecrow: species('dry-hit', 'dry-death'),
  undead_lab_human_melee: species('dry-hit', 'dry-death', .96),
  ghoul: species('dry-hit', 'dry-death', .91),
  ghost: species('ghost-hit', 'ghost-death', 1.06),
  wolf: species('wolf-hit', 'wolf-death', 1.07),
  iron_boar: species('boar-hit', 'boar-death', .98),
  bat: species('bat-hit', 'bat-death', 1.08),
  poison_spider: species('spider-hit', 'spider-death', 1.02),
  demon: species('demon-hit', 'demon-death', .86),
  succubus: species('demon-hit', 'demon-death', 1.14),
  goleling: species('stone-hit', 'stone-death', 1.15),
  slime: species('slime-hit', 'slime-death', .97),
  throne_dragon: species('dragon-hit', 'dragon-death', .82),
  training_dragon: species('dragon-hit', 'dragon-death', .94),
  spirit: species('ghost-hit', 'ghost-death', 1.2),
  rune_guardian: species('stone-hit', 'stone-death', .75),
  gargoyle: species('stone-hit', 'stone-death', .9),
});
const entity = (entities, id) => entities?.find(e => e.id === id);
const cue = (name, fallback, pitch = 1, gain = 1, key = name, cooldown = .025) =>
  ({ name, fallback, pitch, gain, key, cooldown });
const SKILLS = Object.freeze({ poison_arrow:'bow', cursed_hands:'arcane', blood_spear:'arcane', dead_explosion:'blunt', slash: 'blade', lunge: 'blade', whirl: 'blade', heavy_cleave: 'blade',
  ground_slam: 'blunt', armor_break: 'blunt', arrow: 'bow', volley: 'bow', pierce_shot: 'bow', triple_arrow: 'bow', evasion_shot: 'bow',
  rain_arrow: 'bow', spinning_shot: 'bow', meteor: 'fire', firewall: 'fire', blast_arrow: 'fire', ember_bolt: 'fire', flame_ring: 'fire', frost_lance: 'ice',
  focus_pulse: 'arcane', healing_light: 'heal' });
const SKILL_PITCH = Object.freeze({ poison_arrow:.86,cursed_hands:.65,blood_spear:.8,dead_explosion:.6,lunge: 1.12, whirl: .94, heavy_cleave: .84,
  ground_slam: .8, armor_break: 1.08, volley: .94, pierce_shot: 1.16,
  blast_arrow: 1.13, ember_bolt: 1, flame_ring: .86, frost_lance: 1.1 });
export function skillAudio(ability, source) {
  const family = SKILLS[ability];
  return family === 'blade' && source?.weaponForm === 'blunt' ? 'blunt' : family;
}
export function eventCues(event, localId, entities = []) {
  const source = entity(entities, event.src ?? event.id);
  if (event.zonePulse || event.type === 'zonePulse') return [];
  if (event.type === 'handsBurst') return [cue('bone-hit','hit',.65,.7,'hands-burst',.15)];
  if (event.type === 'explode' && event.ability === 'dead_explosion') return [cue('blunt-impact','critical',.55,1,'dead-explosion',.2)];
  if (event.type === 'explode' && event.ability === 'meteor') return [cue('fire-impact', 'hit', .8, .75, 'meteor-impact', .1)];
  if (event.type === 'turnUndead') return [event.success
    ? cue('heal-cast', 'level-up', 1.35, .8, 'holy-success', .12)
    : cue('blunt-impact', 'hit', .65, .55, 'holy-resist', .12)];
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
    if (event.dst === localId) return event.crit === true || event.critical === true ? [cue('hurt', 'hurt')] : [];
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
    else if (family && event.src === localId && event.ability !== 'meteor') cues.push(cue(`${family}-impact`, null, SKILL_PITCH[event.ability] ?? 1, .5,
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
