#!/usr/bin/env node
/* 로케일 페이지 생성/동기화 — node sync-locales.cjs [--check]
 *
 * 왜 필요한가:
 *   ?lang=en 쿼리만으로는 검색엔진이 언어별 페이지로 안 잡는다. 실제로 색인되려면
 *   /animalface/en/ 처럼 경로가 있어야 하고, 그 경로의 head(title·description·canonical)가
 *   그 언어여야 한다. 본문은 루트 index.html이 유일한 정본이고 여기서 복사한다.
 *   (루트만 고치고 배포하면 하위 언어에서만 조용히 깨지는 사고를 막으려고 --check도 둔다)
 *
 * 하위 경로에서는 상대참조가 /animalface/en/img/... 로 잘못 잡히므로 자산만 절대경로로 바꾼다.
 */
const fs = require('fs');
const path = require('path');

const SITE = 'https://game.cocy.io/animalface/';
const LOCALES = {
  en: { htmlLang: 'en', ogLocale: 'en_US',
    title: 'Animal Face Reader — which animal is your face?',
    desc: 'One photo, 468 facial points measured on your device. Find your animal face among 39 types, see look-alike celebrities, and share a card. Your photo never leaves the device.' },
  ja: { htmlLang: 'ja', ogLocale: 'ja_JP',
    title: '動物顔診断 — あなたの顔はどの動物？',
    desc: '写真1枚で顔の468点を実測し、39種の動物顔から探します。似ている芸能人や表情GIFも。写真は端末から出ません。' },
  tw: { htmlLang: 'zh-Hant', ogLocale: 'zh_TW',
    title: '動物臉診斷 — 我的臉是哪種動物？',
    desc: '一張照片，實測臉部468個點，從39種動物臉中找出你的那一種。還有相似藝人與表情GIF。照片不會離開你的裝置。' },
};
const HREF = { ko: '', en: 'en/', ja: 'ja/', tw: 'tw/' };
const HREFLANG = { ko: 'ko', en: 'en', ja: 'ja', tw: 'zh-Hant' };
const CHECK = process.argv.includes('--check');
const esc = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

const root = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const cut = root.indexOf('</head>');
if (cut < 0) throw new Error('</head> 없음');
const rootHead = root.slice(0, cut);
let body = root.slice(cut);

// 자산 경로 절대화 — 상대경로로 두면 하위 로케일에서 전부 404
body = body
  .split("fetch('animals.json").join("fetch('/animalface/animals.json")
  .split("fetch('celebs.json").join("fetch('/animalface/celebs.json")
  .split('img/${').join('/animalface/img/${')
  .split("src = 'img/").join("src = '/animalface/img/")
  .split("'lib/gif.js").join("'/animalface/lib/gif.js")
  .split("'lib/gif.worker.js").join("'/animalface/lib/gif.worker.js");

function headFor(lang) {
  const L = LOCALES[lang];
  const url = SITE + HREF[lang];
  let h = rootHead
    .replace(/<html lang="[^"]*"/, `<html lang="${L.htmlLang}"`)
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(L.title)}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(L.desc)}">`)
    .replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(L.title)}">`)
    .replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(L.desc)}">`)
    .replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${url}">`)
    .replace(/<meta name="twitter:title" content="[^"]*">/, `<meta name="twitter:title" content="${esc(L.title)}">`)
    .replace(/<meta name="twitter:description" content="[^"]*">/, `<meta name="twitter:description" content="${esc(L.desc)}">`)
    .replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${url}">`)
    // 자산 참조도 절대경로로
    .split('src="js/i18n.js').join('src="/animalface/js/i18n.js')
    .split('href="icon.svg').join('href="/animalface/icon.svg')
    .split('src="/lib/').join('src="/lib/');
  // hreflang은 통째로 다시 깐다(루트에 박힌 ?lang= 형태를 경로형으로 교체)
  h = h.replace(/\n<link rel="alternate"[^>]*>/g, '');
  const alts = Object.keys(HREF).map(l =>
    `<link rel="alternate" hreflang="${HREFLANG[l]}" href="${SITE + HREF[l]}">`).join('\n')
    + `\n<link rel="alternate" hreflang="x-default" href="${SITE}">`;
  h = h.replace('<link rel="canonical"', alts + '\n<link rel="canonical"');
  return h;
}

let changed = 0;
for (const lang of Object.keys(LOCALES)) {
  const dir = path.join(__dirname, lang);
  const p = path.join(dir, 'index.html');
  const html = headFor(lang) + body;
  const cur = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
  if (cur === html) { console.log('  ok   ' + lang); continue; }
  changed++;
  if (CHECK) { console.log('  DIFF ' + lang + ' — 루트와 어긋남'); continue; }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, html);
  console.log('  write ' + lang);
}
if (CHECK && changed) { console.error('로케일 ' + changed + '개가 루트와 어긋났다'); process.exit(1); }
console.log(changed ? '생성/갱신 ' + changed + '개' : '전부 최신');
