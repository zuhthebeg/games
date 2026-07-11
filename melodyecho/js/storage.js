// 멜로디 에코 — 로컬 저장소 (localStorage, 키 프리픽스 melodyecho_)
(function (global) {
  'use strict';

  var PREFIX = 'melodyecho_';
  var KEY_STREAK = PREFIX + 'streak';
  var KEY_BEST_SCORE = PREFIX + 'best_score';
  var KEY_BEST_LV = PREFIX + 'best_lv'; // { melody, rhythm }
  var KEY_TODAY_RESULT = PREFIX + 'today_result';
  var KEY_CALIB = PREFIX + 'calib_offset_sec'; // 기기 오디오+터치 지연 오프셋(초)

  function safeGet(key) {
    try {
      var raw = global.localStorage.getItem(key);
      return raw == null ? null : JSON.parse(raw);
    } catch (e) { return null; }
  }

  function safeSet(key, value) {
    try { global.localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  }

  function todayString() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function getCalibOffset() {
    var v = safeGet(KEY_CALIB);
    return typeof v === 'number' ? v : null;
  }

  function setCalibOffset(sec) { safeSet(KEY_CALIB, sec); }

  function getStreak() { return safeGet(KEY_STREAK) || { count: 0, lastDate: null }; }

  function bumpStreakForToday() {
    var today = todayString();
    var streak = getStreak();
    if (streak.lastDate === today) return streak;
    var y = new Date();
    y.setDate(y.getDate() - 1);
    var yStr = y.getFullYear() + '-' + String(y.getMonth() + 1).padStart(2, '0') + '-' + String(y.getDate()).padStart(2, '0');
    var updated = { count: streak.lastDate === yStr ? streak.count + 1 : 1, lastDate: today };
    safeSet(KEY_STREAK, updated);
    return updated;
  }

  function hasPlayedToday() {
    var r = safeGet(KEY_TODAY_RESULT);
    return !!(r && r.date === todayString());
  }

  function getTodayResult() {
    var r = safeGet(KEY_TODAY_RESULT);
    return (r && r.date === todayString()) ? r : null;
  }

  function saveTodayResult(result) {
    result.date = todayString();
    safeSet(KEY_TODAY_RESULT, result);
    var best = safeGet(KEY_BEST_SCORE) || 0;
    if (result.totalScore > best) safeSet(KEY_BEST_SCORE, result.totalScore);
    var bestLv = safeGet(KEY_BEST_LV) || { melody: 0, rhythm: 0 };
    bestLv.melody = Math.max(bestLv.melody, result.melodyLv);
    bestLv.rhythm = Math.max(bestLv.rhythm, result.rhythmLv);
    safeSet(KEY_BEST_LV, bestLv);
    return bumpStreakForToday();
  }

  function getBestScore() { return safeGet(KEY_BEST_SCORE) || 0; }
  function getBestLv() { return safeGet(KEY_BEST_LV) || { melody: 0, rhythm: 0 }; }

  global.ME = global.ME || {};
  global.ME.storage = {
    PREFIX: PREFIX,
    todayString: todayString,
    getCalibOffset: getCalibOffset,
    setCalibOffset: setCalibOffset,
    getStreak: getStreak,
    hasPlayedToday: hasPlayedToday,
    getTodayResult: getTodayResult,
    saveTodayResult: saveTodayResult,
    getBestScore: getBestScore,
    getBestLv: getBestLv
  };
})(window);
