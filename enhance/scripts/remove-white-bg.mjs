#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const monstersDir = path.resolve(__dirname, '../img/monsters');

async function loadJimp() {
  try {
    const mod = await import('jimp');
    return mod.Jimp || mod.default || mod;
  } catch {
    console.error('jimp가 필요합니다.');
    console.error('실행: npm i jimp');
    process.exit(1);
  }
}

function shouldRemoveWhite(r, g, b) {
  // 흰 배경 + 옅은 회색 배경 제거
  const min = Math.min(r, g, b);
  const max = Math.max(r, g, b);
  const nearWhite = min > 225;
  const lowSaturation = (max - min) < 20;
  return nearWhite && lowSaturation;
}

async function processFile(Jimp, fullPath) {
  const img = await Jimp.read(fullPath);

  img.scan(0, 0, img.bitmap.width, img.bitmap.height, function (x, y, idx) {
    const r = this.bitmap.data[idx + 0];
    const g = this.bitmap.data[idx + 1];
    const b = this.bitmap.data[idx + 2];

    if (shouldRemoveWhite(r, g, b)) {
      this.bitmap.data[idx + 3] = 0; // alpha
    }
  });

  const out = fullPath.replace(/\.(jpg|jpeg)$/i, '.png');
  await img.write(out);
  return path.basename(out);
}

async function main() {
  const Jimp = await loadJimp();

  if (!fs.existsSync(monstersDir)) {
    console.error(`폴더 없음: ${monstersDir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(monstersDir)
    .filter((f) => /\.(jpg|jpeg)$/i.test(f));

  if (!files.length) {
    console.log('변환할 JPG 파일이 없습니다.');
    return;
  }

  const results = [];
  for (const file of files) {
    const out = await processFile(Jimp, path.join(monstersDir, file));
    results.push(out);
  }

  console.log('완료:');
  for (const r of results) console.log(` - ${r}`);
  console.log('\n다음 단계: index.html의 몬스터 이미지 경로를 .png로 교체');
}

main();
