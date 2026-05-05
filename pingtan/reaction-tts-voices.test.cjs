const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

assert(html.includes('function reactionVoiceForPlayer'), 'reaction TTS should choose a natural voice per player');
assert(html.includes('ko-male') && html.includes('ko-female'), 'reaction TTS should use local natural Korean voices, not the default alloy voice');
assert(!/body: JSON\.stringify\(\{ model: \"cosyvoice\", input: text, voice: \"alloy\"/.test(html), 'reaction TTS must not use default alloy voice');
assert(html.includes('playerVoice'), 'reaction payloads should carry sender voice choice for consistent remote playback');
assert(html.includes('speakReaction(phrase, localTts, playerVoice'), 'reaction playback should pass player voice into TTS');
assert(html.includes('sendCustomReactionEmote') && html.includes('localTts: true'), 'custom text reactions should try local natural TTS before browser fallback');

console.log('PASS reaction natural per-player TTS');
