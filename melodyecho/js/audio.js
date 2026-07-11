// 멜로디 에코 — Tone.js 오디오 엔진
// 피아노: Salamander 샘플(assets/piano, 자체 서빙) + 로딩 전 신스 폴백.
// 리듬: 합성 클릭/우드블록. 모든 타이밍은 Tone.now() 오디오 클럭 단일 기준
// (performance.now 혼용 금지 — 탭 판정과 재생 스케줄의 클럭이 갈리면 판정이 밀린다).
(function (global) {
  'use strict';

  var synth = null;      // 피아노 폴백
  var sampler = null;    // 피아노 샘플
  var clickHi = null;    // 카운트인/강박 클릭
  var clickSoft = null;  // 입력 중 약한 메트로놈
  var wood = null;       // 리듬 패턴 타격음
  var fxSynth = null;    // 성공/실패 징글
  var timers = [];       // setTimeout UI 콜백 핸들

  function init() {
    if (synth) return;
    synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.005, decay: 0.25, sustain: 0.15, release: 0.4 }
    }).toDestination();
    synth.volume.value = -6;

    var s = new Tone.Sampler({
      urls: {
        'F#3': 'Fs3.mp3', 'A3': 'A3.mp3', 'C4': 'C4.mp3', 'D#4': 'Ds4.mp3',
        'F#4': 'Fs4.mp3', 'A4': 'A4.mp3', 'C5': 'C5.mp3', 'D#5': 'Ds5.mp3', 'F#5': 'Fs5.mp3'
      },
      baseUrl: 'assets/piano/',
      release: 1.2,
      onload: function () { sampler = s; },
      onerror: function (e) { console.warn('피아노 샘플 로딩 실패, 신스 폴백', e); }
    }).toDestination();
    s.volume.value = -2;

    clickHi = new Tone.Synth({
      oscillator: { type: 'square' },
      envelope: { attack: 0.001, decay: 0.06, sustain: 0, release: 0.02 }
    }).toDestination();
    clickHi.volume.value = -8;

    clickSoft = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.02 }
    }).toDestination();
    clickSoft.volume.value = -18;

    wood = new Tone.MembraneSynth({
      pitchDecay: 0.008, octaves: 3,
      envelope: { attack: 0.001, decay: 0.18, sustain: 0, release: 0.05 }
    }).toDestination();
    wood.volume.value = -4;

    fxSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.005, decay: 0.2, sustain: 0.1, release: 0.3 }
    }).toDestination();
    fxSynth.volume.value = -10;
  }

  function ensureStarted() {
    init();
    return Tone.start();
  }

  function piano() { return sampler || synth; }

  function midiToName(m) { return ME.gen.midiToName(m); }

  function clearTimers() {
    timers.forEach(function (t) { clearTimeout(t); });
    timers = [];
  }

  function uiAt(delaySec, fn) {
    timers.push(setTimeout(fn, Math.max(0, delaySec * 1000)));
  }

  // 즉시 발음 (건반 탭)
  function playNote(midi, durSec) {
    try { piano().triggerAttackRelease(midiToName(midi), durSec || 0.45); } catch (e) {}
  }

  // 멜로디 재생. onNote(i)는 각 음 발음 시점에 UI 콜백, onDone은 종료 후.
  function playMelody(melody, cbs) {
    cbs = cbs || {};
    clearTimers();
    var t0 = Tone.now() + 0.2;
    var gap = melody.gapMs / 1000;
    melody.notes.forEach(function (midi, i) {
      var at = t0 + i * gap;
      try { piano().triggerAttackRelease(midiToName(midi), Math.min(0.5, gap * 0.92), at); } catch (e) {}
      if (cbs.onNote) uiAt(at - Tone.now(), (function (idx) { return function () { cbs.onNote(idx); }; })(i));
    });
    var endAt = t0 + melody.notes.length * gap + 0.2;
    if (cbs.onDone) uiAt(endAt - Tone.now(), cbs.onDone);
    return endAt - Tone.now();
  }

  function clickAt(time, strong) {
    try {
      if (strong) clickHi.triggerAttackRelease(1400, 0.03, time);
      else clickSoft.triggerAttackRelease(1000, 0.03, time);
    } catch (e) {}
  }

  function woodAt(time) {
    try { wood.triggerAttackRelease('C3', 0.08, time); } catch (e) {}
  }

  // 리듬 패턴 들려주기: 카운트인 4클릭 → 패턴(우드블록). onDone 콜백.
  function playRhythm(rhythm, cbs) {
    cbs = cbs || {};
    clearTimers();
    var spb = 60 / rhythm.bpm;
    var t0 = Tone.now() + 0.2;
    for (var c = 0; c < 4; c++) {
      clickAt(t0 + c * spb, c === 0);
      if (cbs.onCount) uiAt(t0 + c * spb - Tone.now(), (function (n) { return function () { cbs.onCount(n); }; })(c));
    }
    var patStart = t0 + 4 * spb;
    rhythm.onsets.forEach(function (beat, i) {
      var at = patStart + beat * spb;
      woodAt(at);
      if (cbs.onOnset) uiAt(at - Tone.now(), (function (idx) { return function () { cbs.onOnset(idx); }; })(i));
    });
    var endAt = patStart + rhythm.beats * spb + 0.1;
    if (cbs.onDone) uiAt(endAt - Tone.now(), cbs.onDone);
  }

  // 입력 페이즈: 카운트인 4클릭 + 8박 동안 약한 메트로놈.
  // 반환 patStart(오디오 클럭 초) — 탭 시각은 Tone.now()-patStart 로 박 환산.
  function startInputPhase(rhythm, cbs) {
    cbs = cbs || {};
    clearTimers();
    var spb = 60 / rhythm.bpm;
    var t0 = Tone.now() + 0.2;
    for (var c = 0; c < 4; c++) {
      clickAt(t0 + c * spb, c === 0);
      if (cbs.onCount) uiAt(t0 + c * spb - Tone.now(), (function (n) { return function () { cbs.onCount(n); }; })(c));
    }
    var patStart = t0 + 4 * spb;
    for (var b = 0; b < rhythm.beats; b++) {
      clickAt(patStart + b * spb, false);
      if (cbs.onBeat) uiAt(patStart + b * spb - Tone.now(), (function (n) { return function () { cbs.onBeat(n); }; })(b));
    }
    var endAt = patStart + rhythm.beats * spb + 0.35; // 마지막 온셋 늦은 탭 여유
    if (cbs.onDone) uiAt(endAt - Tone.now(), cbs.onDone);
    return patStart;
  }

  // 캘리브레이션: 강클릭 8개, 클릭 시각 배열 반환.
  function startCalibration(cbs) {
    cbs = cbs || {};
    clearTimers();
    var spb = 60 / 90;
    var t0 = Tone.now() + 0.3;
    var clickTimes = [];
    for (var c = 0; c < 8; c++) {
      var at = t0 + c * spb;
      clickAt(at, true);
      clickTimes.push(at);
      if (cbs.onClick) uiAt(at - Tone.now(), (function (n) { return function () { cbs.onClick(n); }; })(c));
    }
    if (cbs.onDone) uiAt(t0 + 8 * spb + 0.4 - Tone.now(), cbs.onDone);
    return clickTimes;
  }

  function now() { return Tone.now(); }

  function jingleSuccess() {
    var t = Tone.now() + 0.05;
    try {
      fxSynth.triggerAttackRelease('C5', 0.12, t);
      fxSynth.triggerAttackRelease('E5', 0.12, t + 0.09);
      fxSynth.triggerAttackRelease('G5', 0.2, t + 0.18);
    } catch (e) {}
  }

  function jingleFail() {
    var t = Tone.now() + 0.05;
    try {
      fxSynth.triggerAttackRelease('E3', 0.18, t);
      fxSynth.triggerAttackRelease('Eb3', 0.3, t + 0.16);
    } catch (e) {}
  }

  function stopAll() {
    clearTimers();
  }

  global.ME = global.ME || {};
  global.ME.audio = {
    init: init,
    ensureStarted: ensureStarted,
    playNote: playNote,
    playMelody: playMelody,
    playRhythm: playRhythm,
    startInputPhase: startInputPhase,
    startCalibration: startCalibration,
    now: now,
    jingleSuccess: jingleSuccess,
    jingleFail: jingleFail,
    stopAll: stopAll
  };
})(window);
