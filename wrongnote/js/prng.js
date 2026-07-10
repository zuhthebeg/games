// 틀린 음 찾기 — 시드 기반 결정론 RNG
// 날짜 문자열(YYYY-MM-DD) -> 32비트 해시 시드 -> mulberry32 PRNG.
// 같은 문자열이면 항상 같은 난수열이 나온다 (데일리 문제 결정론의 근간).
(function (global) {
  'use strict';

  function hashStringToSeed(str) {
    var h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  }

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function createRng(seedStr) {
    var seed = hashStringToSeed(String(seedStr));
    var rand = mulberry32(seed);
    return {
      seed: seed,
      next: rand,
      // [minInclusive, maxExclusive) 정수
      int: function (minInclusive, maxExclusive) {
        return Math.floor(rand() * (maxExclusive - minInclusive)) + minInclusive;
      },
      pick: function (arr) {
        return arr[Math.floor(rand() * arr.length)];
      },
      shuffle: function (arr) {
        var a = arr.slice();
        for (var i = a.length - 1; i > 0; i--) {
          var j = Math.floor(rand() * (i + 1));
          var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
        }
        return a;
      }
    };
  }

  global.WN = global.WN || {};
  global.WN.rng = { hashStringToSeed: hashStringToSeed, mulberry32: mulberry32, createRng: createRng };
})(window);
