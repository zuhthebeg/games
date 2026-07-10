// 틀린 음 찾기 — Tone.js 기반 피아노 합성 재생 엔진
// 재생/일시정지/스크럽/구간반복 + 최대 3회 재생 카운트.
// 노트 데이터만으로 클라 결정론 합성 (오디오 파일 전송 없음).
(function (global) {
  'use strict';

  var MAX_PLAYS = 3;

  function WNAudioEngine() {
    this._synth = null;
    this._puzzle = null;
    this._totalDurationSec = 0;
    this._playsRemaining = MAX_PLAYS;
    this._hasStartedThisPlay = false; // 이번 재생 사이클에서 0초부터 시작했는지
    this._endedCallback = null;
    this._ready = false;
  }

  WNAudioEngine.prototype._ensureSynth = function () {
    if (this._synth) return;
    // 피아노 느낌의 톤: 삼각파 + 짧은 릴리즈. 샘플 로딩 없이 즉시 재생 가능(네트워크 의존 최소화).
    this._synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.005, decay: 0.25, sustain: 0.15, release: 0.4 }
    }).toDestination();
    this._synth.volume.value = -6;
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

    var synth = this._synth;
    puzzle.performedNotes.forEach(function (note) {
      var noteDurSec = Math.max(0.08, note.dur * secPerBeat * 0.92);
      Tone.Transport.schedule(function (time) {
        synth.triggerAttackRelease(note.pitch, noteDurSec, time);
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
  };

  global.WN = global.WN || {};
  global.WN.AudioEngine = WNAudioEngine;
})(window);
