import test from 'node:test';
import assert from 'node:assert/strict';
import { pairs } from '../rap-challenge.js';
for (const [name, text, expected] of [
 ['three matching vowels', '저기 밤바다\n\n다시 잠마다!', [[1,3,3]]],
 ['two matching vowels', '마지막 바다\n돌아 가자', [[1,2,2]]],
 ['ignore repeated end word', '저기 밤바다\n다시 밤바다', []],
 ['leave Latin endings unscored', '밤바다 flow\n잠마다 glow', []],
 ['one shared vowel is not enough', '오늘 바다\n이리 오자', []],
 ['normalize decomposed Hangul', '밤바다'.normalize('NFD')+'\n잠마다', [[1,2,3]]],
 ['do not cross word boundaries', '밤 바다\n잠마다', [[1,2,2]]],
 ['do not inspect a fifth line', '밤바다\n고요\n빛\n밤\n잠마다', []],
 ['bound work on oversized input', '밤바다\n잠마다'+'!'.repeat(809), []],
]) test(name, () => assert.deepEqual(pairs(text), expected));

const prompts = (await import('../rap-challenge.js')).dailyPrompts;
test('prompts rotate at Korean midnight, not at UTC midnight', () => {
  const at = iso => prompts(Date.parse(iso));
  assert.deepEqual(at('2026-11-28T00:00:00Z'), at('2026-11-28T14:59:59.999Z'));
  assert.notDeepEqual(at('2026-11-28T14:59:59.999Z'), at('2026-11-28T15:00:00.000Z'));
  assert.deepEqual(at('2026-11-28T15:00:00Z'), at('2026-11-29T14:59:59.999Z'));
  assert.notDeepEqual(at('2026-12-31T14:59:59.999Z'), at('2026-12-31T15:00:00.000Z'));
});
test('two distinct original prompt words per day with no adjacent repeats', () => {
  for (let i=0; i<400; i++) {
    const at = Date.UTC(2026, 0, i+1, 15), today = prompts(at), yesterday = prompts(at-86_400_000);
    assert.equal(new Set(today).size, 2);
    for (const word of today) { assert.match(word, /^[가-힣]+$/u); assert.ok(!yesterday.includes(word)); }
  }
});
