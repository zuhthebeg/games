// 틀린 음 찾기 — Tone.js 기반 피아노 재생 엔진
// 재생/일시정지/스크럽/구간반복 + 최대 3회 재생 카운트.
// 음원: Salamander Grand Piano 샘플(assets/piano/, 자체 서빙 — 외부 CDN 핫링크 금지).
// 샘플 로딩 전/실패 시에는 신스 폴백으로 즉시 재생 가능.
(function (global) {
  'use strict';

  var MAX_PLAYS = 3;

  function WNAudioEngine() {
    this._synth = null;
    this._sampler = null;
    this._puzzle = null;
    this._totalDurationSec = 0;
    this._playsRemaining = MAX_PLAYS;
    this._hasStartedThisPlay = false; // 이번 재생 사이클에서 0초부터 시작했는지
    this._endedCallback = null;
    this._ready = false;
  }

  WNAudioEngine.prototype._ensureSynth = function () {
    if (this._synth) return;
    this._synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.005, decay: 0.25, sustain: 0.15, release: 0.4 }
    }).toDestination();
    this._synth.volume.value = -6;

    var self = this;
    var sampler = new Tone.Sampler({
      urls: {
        'F#3': 'Fs3.mp3', 'A3': 'A3.mp3', 'C4': 'C4.mp3', 'D#4': 'Ds4.mp3',
        'F#4': 'Fs4.mp3', 'A4': 'A4.mp3', 'C5': 'C5.mp3', 'D#5': 'Ds5.mp3', 'F#5': 'Fs5.mp3'
      },
      baseUrl: 'assets/piano/',
      release: 1.2,
      onload: function () { self._sampler = sampler; },
      onerror: function (e) { console.warn('피아노 샘플 로딩 실패, 신스 폴백 사용', e); }
    }).toDestination();
    sampler.volume.value = -2;
  };

  // 스케줄 시점이 아니라 발음 시점에 고른다 — 재생 중 샘플 로딩이 끝나면 다음 음부터 피아노로 전환
  WNAudioEngine.prototype._instrument = function () {
    return this._sampler || this._synth;
  };

  // puzzle.performedNotes: [{pitch,dur,startSec,offsetMs,...}]
  WNAudioEngine.prototype.loadPuzzle = function (puzzle) {
    this._ensureSynth();
    Tone.Transport.stop();
    Tone.Transport.cancel();
    Tone.Transport.loop = false;
    Tone.Transport.seconds = 0;

    this._puzzle = puzzle;
    var secPerBeat = 60 / puzzle.song.bpm;
    var last = puzzle.performedNotes[puzzle.performedNotes.length - 1];
    this._totalDurationSec = last.startSec + last.dur * secPerBeat;
    this._playsRemaining = MAX_PLAYS;
    this._hasStartedThisPlay = false;

    var self = this;
    puzzle.performedNotes.forEach(function (note) {
      var noteDurSec = Math.max(0.08, note.dur * secPerBeat * 0.92);
      Tone.Transport.schedule(function (time) {
        self._instrument().triggerAttackRelease(note.pitch, noteDurSec, time);
      }, Math.max(0, note.startSec));
    });

    var self = this;
    Tone.Transport.schedule(function () {
      Tone.Draw.schedule(function () {
        Tone.Transport.pause();
        Tone.Transport.seconds = 0;
        if (self._endedCallback) self._endedCallback();
      }, Tone.Transport.seconds);
    }, this._totalDurationSec + 0.15);

    this._ready = true;
  };

  WNAudioEngine.prototype.playsRemaining = function () { return this._playsRemaining; };
  WNAudioEngine.prototype.totalDuration = function () { return this._totalDurationSec; };
  WNAudioEngine.prototype.currentTime = function () { return Tone.Transport.seconds; };
  WNAudioEngine.prototype.isPlaying = function () { return Tone.Transport.state === 'started'; };

  WNAudioEngine.prototype.onEnded = function (cb) { this._endedCallback = cb; };

  // 처음(0초)부터 재생 시작할 때만 카운트 소모. 일시정지 후 재개는 무료.
  WNAudioEngine.prototype.play = function () {
    var self = this;
    return Tone.start().then(function () {
      if (Tone.Transport.seconds <= 0.001 && !self._hasStartedThisPlay) {
        if (self._playsRemaining <= 0) return false;
        self._playsRemaining -= 1;
        self._hasStartedThisPlay = true;
      }
      Tone.Transport.start();
      return true;
    });
  };

  WNAudioEngine.prototype.pause = function () {
    Tone.Transport.pause();
  };

  WNAudioEngine.prototype.stop = function () {
    Tone.Transport.stop();
    Tone.Transport.seconds = 0;
    this._hasStartedThisPlay = false;
  };

  // 스크럽: 임의 위치로 이동 (재생 카운트 소모 없음)
  WNAudioEngine.prototype.seek = function (sec) {
    var clamped = Math.max(0, Math.min(this._totalDurationSec, sec));
    Tone.Transport.seconds = clamped;
    this._hasStartedThisPlay = clamped > 0.001;
  };

  // 구간반복: 드래그로 고른 [startSec,endSec] 구간을 반복. 재생 카운트와 별개(이미 들은 구간 미세청취용).
  WNAudioEngine.prototype.setLoopRegion = function (startSec, endSec) {
    Tone.Transport.loopStart = Math.max(0, startSec);
    Tone.Transport.loopEnd = Math.min(this._totalDurationSec, Math.max(endSec, startSec + 0.1));
    Tone.Transport.loop = true;
  };

  WNAudioEngine.prototype.clearLoopRegion = function () {
    Tone.Transport.loop = false;
  };

  WNAudioEngine.prototype.dispose = function () {
    Tone.Transport.stop();
    Tone.Transport.cancel();
    if (this._synth) { this._synth.dispose(); this._synth = null; }
    if (this._sampler) { this._sampler.dispose(); this._sampler = null; }
  };

  global.WN = global.WN || {};
  global.WN.AudioEngine = WNAudioEngine;
})(window);
