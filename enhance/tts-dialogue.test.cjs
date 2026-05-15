const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

assert(html.includes('function normalizeKoreanTtsText'), 'TTS text should normalize numeric symbols before speech');
assert(html.includes('koreanNumberToWords'), 'TTS should convert digits to Korean words so levels are not read in English');
assert(html.includes('function getBossVoiceProfile'), 'boss TTS should choose voice profile from the actual monster');
assert(html.includes('FEMALE_BOSS_HINTS'), 'female-form monsters should use a female voice profile');
assert(html.includes('speakBossDialogue(dialogue, huntState?.monster, bossData.emotion)'), 'boss dialogue should pass the monster object for voice selection');
assert(html.includes('_enhanceTtsAudio.addEventListener(\'ended\''), 'boss dialogue should wait for TTS playback to finish before auto-dismiss');
assert(html.includes('dismissBossDialogue({ stopAudio: false })'), 'auto-dismiss should not cut off active TTS audio');
assert(html.includes('function speakEnhanceOutcome'), 'enhance results should have spoken feedback');
assert(html.includes('buildEnhanceOutcomeLine'), 'enhance result speech should mention the weapon name and outcome creatively');
assert(html.includes('normalizeKoreanTtsText(line)'), 'enhance result speech should also normalize numbers to Korean');

console.log('PASS enhance TTS dialogue behavior');
