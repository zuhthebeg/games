import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const dir = new URL('../assets/world-map/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', dir), 'utf8'));
const expected = ['outskirts', 'forest', 'pass', 'mine', 'swamp', 'throne', 'graveyard', 'necropolis', 'castle', 'cinder', 'frost', 'mire', 'dunes', 'spore', 'abyss'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

// Parse the encoded bitstream dimensions, not just the provenance's claims.
function webpSize(bytes) {
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
  const kind = bytes.toString('ascii', 12, 16);
  if (kind === 'VP8 ') {
    assert.equal(bytes.subarray(23, 26).toString('hex'), '9d012a');
    return [bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff];
  }
  if (kind === 'VP8X') return [1 + bytes.readUIntLE(24, 3), 1 + bytes.readUIntLE(27, 3)];
  assert.fail('Unexpected WebP encoding: ' + kind);
}

test('all registered region landscapes, encoded dimensions, hashes and payload budget', () => {
  assert.deepEqual(manifest.assets.map(asset => asset.id), expected);
  assert.deepEqual(readdirSync(dir).filter(name => name.endsWith('.webp')).sort(), expected.map(id => id + '.webp').sort());
  assert.equal(manifest.reviewStatus, 'passed visual asset inspection');
  const hashes = new Set();
  let total = 0;
  for (const asset of manifest.assets) {
    const bytes = readFileSync(new URL(asset.outputFile, dir));
    assert.deepEqual(webpSize(bytes), [768, 384], asset.id);
    assert.equal(bytes.length, asset.outputBytes, asset.id);
    assert.equal(sha(bytes), asset.outputSha256, asset.id);
    assert.ok(bytes.length < 150000, asset.id);
    assert.match(asset.sourceSha256, /^[0-9a-f]{64}$/);
    assert.ok(asset.prompt && asset.negative && Number.isInteger(asset.seed));
    hashes.add(asset.outputSha256);
    total += bytes.length;
  }
  assert.equal(hashes.size, expected.length);
  assert.equal(total, manifest.outputTotalBytes);
  assert.ok(total < 1500000);
  assert.match(manifest.modelSha256, /^[0-9a-f]{64}$/);
});
