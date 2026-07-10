// 틀린 음 찾기 — 로컬 저장소 (localStorage, 키 프리픽스 wrongnote_)
// M1 스코프: 서버 없이 로컬만. M2에서 relay 랭킹 연동 시 교체 지점 주석 참고.
(function (global) {
  'use strict';

  var PREFIX = 'wrongnote_';
  var KEY_LAST_PLAYED_DATE = PREFIX + 'last_played_date';
  var KEY_STREAK = PREFIX + 'streak';
  var KEY_BEST_SCORE = PREFIX + 'best_score';
  var KEY_TODAY_RESULT = PREFIX + 'today_result'; // { date, totalScore, earAge, percentile, puzzleResults }
  var KEY_HISTORY = PREFIX + 'history'; // 최근 30일 { date, totalScore } 배열 (백분위 M2 교체용 로컬 참고자료)

  function safeGet(key) {
    try {
      var raw = global.localStorage.getItem(key);
      return raw == null ? null : JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function safeSet(key, value) {
    try {
      global.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  function todayString() {
    var d = new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function getStreak() {
    return safeGet(KEY_STREAK) || { count: 0, lastDate: null };
  }

  // 오늘 플레이 완료 시 호출. 어제 플레이했으면 streak+1, 아니면 1로 리셋.
  function bumpStreakForToday() {
    var today = todayString();
    var streak = getStreak();
    if (streak.lastDate === today) return streak; // 이미 오늘 기록됨
    var yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    var yStr = yesterday.getFullYear() + '-' + String(yesterday.getMonth() + 1).padStart(2, '0') + '-' + String(yesterday.getDate()).padStart(2, '0');
    var newCount = (streak.lastDate === yStr) ? (streak.count + 1) : 1;
    var updated = { count: newCount, lastDate: today };
    safeSet(KEY_STREAK, updated);
    return updated;
  }

  function hasPlayedToday() {
    var result = safeGet(KEY_TODAY_RESULT);
    return !!(result && result.date === todayString());
  }

  function getTodayResult() {
    var result = safeGet(KEY_TODAY_RESULT);
    if (result && result.date === todayString()) return result;
    return null;
  }

  function saveTodayResult(result) {
    result.date = todayString();
    safeSet(KEY_TODAY_RESULT, result);

    var best = safeGet(KEY_BEST_SCORE) || 0;
    if (result.totalScore > best) safeSet(KEY_BEST_SCORE, result.totalScore);

    var history = safeGet(KEY_HISTORY) || [];
    history = history.filter(function (h) { return h.date !== result.date; });
    history.push({ date: result.date, totalScore: result.totalScore });
    if (history.length > 30) history = history.slice(history.length - 30);
    safeSet(KEY_HISTORY, history);

    return bumpStreakForToday();
  }

  function getBestScore() {
    return safeGet(KEY_BEST_SCORE) || 0;
  }

  function getHistory() {
    return safeGet(KEY_HISTORY) || [];
  }

  global.WN = global.WN || {};
  global.WN.storage = {
    PREFIX: PREFIX,
    todayString: todayString,
    hasPlayedToday: hasPlayedToday,
    getTodayResult: getTodayResult,
    saveTodayResult: saveTodayResult,
    getStreak: getStreak,
    getBestScore: getBestScore,
    getHistory: getHistory
  };
})(window);
