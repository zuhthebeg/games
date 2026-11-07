import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { minify } from 'terser';

const toolsDir = dirname(fileURLToPath(import.meta.url));
const gameDir = resolve(toolsDir, '..');
const cachePath = join(gameDir, '.cache/three-0.187.0.tgz');
const vendorDir = join(gameDir, 'vendor/three-0.187.0');
const tarballUrl = 'https://registry.npmjs.org/three/-/three-0.187.0.tgz';
const tarballSha256 = 'ff540832ded0cfe919764d24a3d88f3e2a05f23303f876423e4f893841e90728';

function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

async function ensureTarball() {
  await mkdir(dirname(cachePath), { recursive: true });
  let tarball;
  try {
    tarball = await readFile(cachePath);
  } catch {
    const response = await fetch(tarballUrl);
    if (!response.ok) throw new Error(`Three.js download failed: ${response.status}`);
    tarball = Buffer.from(await response.arrayBuffer());
    await writeFile(cachePath, tarball);
  }
  const actualSha256 = sha256(tarball);
  if (actualSha256 !== tarballSha256) {
    throw new Error(`Three.js tarball SHA-256 mismatch: ${actualSha256}`);
  }
  return tarball;
}

function extract(tarballPath, member) {
  return execFileSync('tar', ['-xOf', tarballPath, `package/${member}`], {
    maxBuffer: 24 * 1024 * 1024,
  });
}

async function save(relativePath, data) {
  const outputPath = join(vendorDir, relativePath);
  const content = typeof data === 'string' ? Buffer.from(data) : data;
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, content);
  console.log(`${relativePath} ${content.byteLength} bytes ${sha256(content)}`);
}

await ensureTarball();
const moduleSource = extract(cachePath, 'build/three.module.js').toString('utf8');
const coreSource = extract(cachePath, 'build/three.core.js').toString('utf8');
const license = extract(cachePath, 'LICENSE');
const moduleResult = await minify(
  { 'three.module.js': moduleSource.replaceAll('./three.core.js', './three.core.min.js') },
  { module: true, compress: { passes: 2 }, mangle: true, format: { comments: false } },
);
const coreResult = await minify(
  { 'three.core.js': coreSource },
  { module: true, compress: { passes: 2 }, mangle: true, format: { comments: false } },
);
if (!moduleResult.code || !coreResult.code) throw new Error('Three.js minification produced no output');

await mkdir(vendorDir, { recursive: true });
await save('three.module.min.js', moduleResult.code);
await save('three.core.min.js', coreResult.code);
await save('addons/loaders/GLTFLoader.js', extract(cachePath, 'examples/jsm/loaders/GLTFLoader.js'));
await save('addons/utils/SkeletonUtils.js', extract(cachePath, 'examples/jsm/utils/SkeletonUtils.js'));
await save('addons/utils/BufferGeometryUtils.js', extract(cachePath, 'examples/jsm/utils/BufferGeometryUtils.js'));
await save('addons/libs/meshopt_decoder.module.js', extract(cachePath, 'examples/jsm/libs/meshopt_decoder.module.js'));
await save('LICENSE', license);
console.log(`three@0.187.0 ${tarballUrl} sha256=${tarballSha256}`);
