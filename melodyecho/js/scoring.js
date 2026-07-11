// 멜로디 에코 — 채점 (순수 함수만: 헤드리스 유닛테스트 대상)
(function (global) {
  'use strict';

  var PERFECT_SEC = 0.100; // 리듬 퍼펙트 판정창
  var GOOD_SEC = 0.180;    // 리듬 굿 판정창

  // 멜로디 채점: 입력 midi 배열 vs 정답. 첫 음은 선입력이라 항상 정답.
  // 반환 { correct:[bool...], allCorrect, numCorrect }
  function gradeMelody(answerNotes, inputNotes) {
    var correct = answerNotes.map(function (m, i) {
      return inputNotes[i] === m;
    });
    var numCorrect = correct.filter(Boolean).length;
    return {
      correct: correct,
      numCorrect: numCorrect,
      allCorrect: numCorrect === answerNotes.length
    };
  }

  // 리듬 채점: 온셋(초) vs 탭(초, 캘리브레이션 차감 후). 그리디 최근접 매칭.
  // 반환 { hits:[{onsetIdx, err, grade}], misses, extras, allHit, allPerfect }
  function gradeRhythm(onsetTimesSec, tapTimesSec) {
    var taps = tapTimesSec.slice().sort(function (a, b) { return a - b; });
    var usedTap = taps.map(function () { return false; });
    var hits = [];
    var misses = 0;

    onsetTimesSec.forEach(function (onset, oi) {
      var bestIdx = -1, bestErr = Infinity;
      for (var ti = 0; ti < taps.length; ti++) {
        if (usedTap[ti]) continue;
        var err = taps[ti] - onset;
        if (Math.abs(err) < Math.abs(bestErr)) { bestErr = err; bestIdx = ti; }
      }
      if (bestIdx >= 0 && Math.abs(bestErr) <= GOOD_SEC) {
        usedTap[bestIdx] = true;
        hits.push({
          onsetIdx: oi,
          err: bestErr,
          grade: Math.abs(bestErr) <= PERFECT_SEC ? 'perfect' : 'good'
        });
      } else {
        misses++;
      }
    });

    var extras = usedTap.filter(function (u) { return !u; }).length;
    return {
      hits: hits,
      misses: misses,
      extras: extras,
      allHit: misses === 0 && extras === 0,
      allPerfect: misses === 0 && extras === 0 && hits.every(function (h) { return h.grade === 'perfect'; })
    };
  }

  // 스테어케이스: 성공 +1, 실패 -1 (1~20 클램프)
  function nextLevel(level, success) {
    return Math.max(1, Math.min(20, level + (success ? 1 : -1)));
  }

  // 라운드 점수
  function melodyRoundScore(level, allCorrect, numCorrect, total, usedReplay) {
    if (!allCorrect) return Math.round(level * 10 * (numCorrect / total) * 0.3);
    return level * 10 + (usedReplay ? 0 : 5);
  }

  function rhythmRoundScore(level, result) {
    if (!result.allHit) {
      var ratio = result.hits.length / (result.hits.length + result.misses || 1);
      return Math.round(level * 10 * ratio * 0.3);
    }
    return level * 10 + (result.allPerfect ? 5 : 0);
  }

  // 백분위 (재미용 추정): 점수 0~? → 상위 N%. wrongnote 교훈 반영 — 잘할수록 N이 작아야 한다.
  function fakePercentile(totalScore) {
    var maxRef = 700; // 두 페이즈 고레벨 관통 시 근사 상한
    var ratio = Math.max(0, Math.min(1, totalScore / maxRef));
    return Math.max(1, Math.round(99 - ratio * 98));
  }

  // 종합 칭호 키 (i18n에서 문자열화)
  function profileTitleKey(melodyLv, rhythmLv) {
    var avg = (melodyLv + rhythmLv) / 2;
    if (avg >= 11) return 'titleMaestro';
    if (avg >= 8) return 'titleGolden';
    if (avg >= 6) return 'titleTuned';
    if (avg >= 4) return 'titleGrowing';
    return 'titleSprout';
  }

  // 이모지 결과 그리드 (공유용): 멜로디 🎹 라운드 ✅/❌, 리듬 🥁 ✅/❌
  function emojiGrid(melodyRounds, rhythmRounds) {
    var m = melodyRounds.map(function (r) { return r.success ? '🟩' : '🟥'; }).join('');
    var r = rhythmRounds.map(function (r2) { return r2.success ? '🟩' : '🟥'; }).join('');
    return '🎹' + m + '\n🥁' + r;
  }

  global.ME = global.ME || {};
  global.ME.scoring = {
    PERFECT_SEC: PERFECT_SEC,
    GOOD_SEC: GOOD_SEC,
    gradeMelody: gradeMelody,
    gradeRhythm: gradeRhythm,
    nextLevel: nextLevel,
    melodyRoundScore: melodyRoundScore,
    rhythmRoundScore: rhythmRoundScore,
    fakePercentile: fakePercentile,
    profileTitleKey: profileTitleKey,
    emojiGrid: emojiGrid
  };
})(window);
