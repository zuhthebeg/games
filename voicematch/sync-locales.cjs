#!/usr/bin/env node
/* 로케일 페이지 동기화 — node sync-locales.js [--check]
 *
 * 왜 필요한가:
 *   ko/en/ja/es/tw/id 하위 페이지는 루트 index.html의 손복사본이다. 본문 로직을 고칠 때마다
 *   7개 파일을 따로 고쳐야 했고, 실제로 한 곳만 고치고 배포하면 다른 언어에서만 조용히 깨진다.
 *   본문(</head> 이후)은 루트가 유일한 정본이고, head(제목·OG·canonical)만 로케일 고유값이다.
 *
 * 하위 경로에서는 상대경로가 /voicematch/tw/xxx 로 잘못 잡히므로 자산 참조만 절대경로로 바꾼다.
 *
 * head 안의 <style>도 동기화한다(2026-08-13 추가):
 *   CSS는 head에 있는데 예전엔 body만 동기화해서, 루트에 새 CSS를 넣어도 7개 로케일엔 영원히
 *   안 갔다. 실제로 #r-req(가수 추가 요청)·.ft-copy·.inapp-bar 스타일이 전 로케일에서 빠져
 *   있었고, 보이스 리포트도 루트에서만 카드로 보였다. head의 나머지(제목·OG·canonical)는
 *   로케일 고유값이라 그대로 두고 <style> 블록만 루트 것으로 덮는다.
 *   (덮기 전 확인: 7개 로케일 전부 루트 CSS의 부분집합이었다 — 로케일 전용 규칙 0개)
 */
const fs = require('fs');
const path = require('path');

const LOCALES = ['ko', 'en', 'ja', 'es', 'pt', 'tw', 'id'];
const ASSETS = ['i18n.js', 'analyzer.js', 'singers.json', 'ecapa_int8.onnx', 'catalog.json',
  'manifest.json', 'icon.svg', 'sw.js'];
const CHECK = process.argv.includes('--check');

function bodyOf(html) {
  const i = html.indexOf('</head>');
  if (i < 0) throw new Error('</head> 없음');
  return { head: html.slice(0, i + 7), body: html.slice(i + 7) };
}

// head 안 첫 <style>…</style>의 내용 범위. body에도 <style>이 하나 더 있으니 head만 넘길 것.
function styleBody(head) {
  const a = head.indexOf('<style>');
  if (a < 0) return null;
  const b = head.indexOf('</style>', a);
  if (b < 0) return null;
  return { s: a + 7, e: b, css: head.slice(a + 7, b) };
}

function withRootStyle(head, css) {
  const r = styleBody(head);
  if (!r) return head;   // <style>이 없는 로케일은 건드리지 않는다
  return head.slice(0, r.s) + css + head.slice(r.e);
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
const rootParts = bodyOf(root);
const src = absolutize(rootParts.body);
const rootCss = styleBody(rootParts.head);
if (!rootCss) throw new Error('루트 head에 <style> 없음');

let changed = 0;
for (const l of LOCALES) {
  const p = path.join(__dirname, l, 'index.html');
  if (!fs.existsSync(p)) { console.log('  skip ' + l + ' (없음)'); continue; }
  const cur = fs.readFileSync(p, 'utf8');
  const { head, body } = bodyOf(cur);
  const newHead = withRootStyle(head, rootCss.css);
  const bodyOk = body === src, cssOk = newHead === head;
  if (bodyOk && cssOk) { console.log('  ok   ' + l); continue; }
  changed++;
  const what = !bodyOk && !cssOk ? '본문+CSS' : bodyOk ? 'CSS' : '본문';
  if (CHECK) { console.log('  DIFF ' + l + ' — 루트와 ' + what + '이 다르다'); continue; }
  fs.writeFileSync(p, newHead + src);
  console.log('  sync ' + l + ' (' + what + ')');
}
if (CHECK && changed) { console.error('루트와 어긋난 로케일 ' + changed + '개'); process.exit(1); }
console.log(changed ? '동기화 ' + changed + '개' : '전부 최신');
