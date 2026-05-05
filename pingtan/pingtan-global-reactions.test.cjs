const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

assert(html.includes('const PINGTAN_BRAND = "삥탄"'), 'Pingtan brand should remain Korean and unlocalized');
assert(html.includes('const PINGTAN_I18N'), 'Pingtan should have a local, game-scoped i18n dictionary');
assert(html.includes('function pt('), 'Pingtan should use a local translation helper, not a shared global module');
assert(html.includes('navigator.language'), 'Pingtan should pick an initial language from browser language');
assert(html.includes('document.documentElement.lang = PINGTAN_LANG'), 'Pingtan should sync html lang for global users');
assert(html.includes('function setPingtanLang'), 'Pingtan should expose a local KR/EN language switch');
assert(html.includes('renderPingtanLangSwitch()'), 'Pingtan lobby should render the local language switch');

assert(html.includes('sanitizeReactionSpeech'), 'Reaction TTS should sanitize display text before speech');
assert(/\.replace\(\/ㅋㅋ\+\|ㅋ\+\/g/.test(html), 'Reaction TTS should strip ㅋㅋ/ㅋ runs before speech');
assert(html.includes('langs: ["en"]'), 'Sibal reaction should be available only outside Korean UI');
assert(html.includes('function visibleReactionEmotes'), 'Reaction panel should filter language-specific emotes');
assert(html.includes('phraseByLang: { en: "삥뜯겼다 시발" }'), 'Korean UI should use clean ppinged copy while English can keep K-slang edge');
assert(html.includes('핑탄') === false, 'Do not accidentally transliterate brand as 핑탄');

console.log('PASS pingtan scoped i18n and Korean reaction polish');
