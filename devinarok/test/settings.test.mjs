import assert from 'node:assert/strict';
import test from 'node:test';
import { AutoQualityController } from '../js/render/quality.js';
import { DEFAULT_SETTINGS, MemoryBackend, SaveRepository } from '../js/save/repository.js';

test('settings survive repository reloads through the settings change set', async () => {
  const backend = new MemoryBackend();
  const repository = new SaveRepository(backend);
  await repository.initialize();
  const saved = await repository.commitSettings({
    bgmVolume: 35,
    sfxVolume: 82,
    muted: true,
    quality: 'automatic',
    reducedMotion: true,
    largeText: true,
    haptics: false,
    telegraphEmphasis: false,
  });
  assert.deepEqual(saved, {
    ...DEFAULT_SETTINGS,
    bgmVolume: 35,
    sfxVolume: 82,
    muted: true,
    quality: 'automatic',
    reducedMotion: true,
    largeText: true,
    haptics: false,
    telegraphEmphasis: false,
  });
  const reopened = new SaveRepository(backend);
  await reopened.initialize();
  assert.deepEqual(await reopened.loadSettings(), saved);
});

test('automatic quality steps down after three seconds above the median frame threshold and never recovers upward', () => {
  const quality = new AutoQualityController('automatic');
  for (let frame = 0; frame < 74; frame += 1) quality.recordFrame(40);
  assert.equal(quality.quality, 'medium');
  quality.recordFrame(40);
  assert.equal(quality.quality, 'low');
  for (let frame = 0; frame < 300; frame += 1) quality.recordFrame(10);
  assert.equal(quality.quality, 'low');
});
