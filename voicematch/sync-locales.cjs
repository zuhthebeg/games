#!/usr/bin/env node
/* 로케일 페이지 동기화 — node sync-locales.js [--check]
 *
 * 왜 필요한가:
 *   ko/en/ja/es/tw/id 하위 페이지는 루트 index.html의 손복사본이다. 본문 로직을 고칠 때마다
 *   7개 파일을 따로 고쳐야 했고, 실제로 한 곳만 고치고 배포하면 다른 언어에서만 조용히 깨진다.
 *   본문(</head> 이후)은 루트가 유일한 정본이고, head(제목·OG·canonical)만 로케일 고유값이다.
 *
 * 하위 경로에서는 상대경로가 /voicematch/tw/xxx 로 잘못 잡히므로 자산 참조만 절대경로로 바꾼다.
 */
const fs = require('fs');
const path = require('path');

const LOCALES = ['ko', 'en', 'ja', 'es', 'tw', 'id'];
const ASSETS = ['i18n.js', 'analyzer.js', 'singers.json', 'ecapa_int8.onnx', 'catalog.json',
  'manifest.json', 'icon.svg', 'sw.js'];
const CHECK = process.argv.includes('--check');

function bodyOf(html) {
  const i = html.indexOf('</head>');
  if (i < 0) throw new Error('</head> 없음');
  return { head: html.slice(0, i + 7), body: html.slice(i + 7) };
}

function absolutize(body) {
  let out = body;
  for (const a of ASSETS) {
    // ('foo.json  /  ="foo.js  형태의 상대참조만 바꾼다(이미 / 나 http 로 시작하면 건드리지 않음)
    out = out.split("('" + a).join("('/voicematch/" + a);
    out = out.split('="' + a).join('="/voicematch/' + a);
  }
  return out;
}

const root = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const src = absolutize(bodyOf(root).body);

let changed = 0;
for (const l of LOCALES) {
  const p = path.join(__dirname, l, 'index.html');
  if (!fs.existsSync(p)) { console.log('  skip ' + l + ' (없음)'); continue; }
  const cur = fs.readFileSync(p, 'utf8');
  const { head, body } = bodyOf(cur);
  if (body === src) { console.log('  ok   ' + l); continue; }
  changed++;
  if (CHECK) { console.log('  DIFF ' + l + ' — 루트와 본문이 다르다'); continue; }
  fs.writeFileSync(p, head + src);
  console.log('  sync ' + l);
}
if (CHECK && changed) { console.error('본문이 루트와 어긋난 로케일 ' + changed + '개'); process.exit(1); }
console.log(changed ? '동기화 ' + changed + '개' : '전부 최신');
