// 틀린 음 찾기 — 최소 음악 이론 유틸: 노트명 <-> MIDI 변환, 반음 이동
(function (global) {
  'use strict';

  var CHROMATIC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  var ENHARMONIC = { Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#' };

  // "C#4" -> { letter:'C#', octave:4 }
  function parseNote(name) {
    var m = /^([A-Ga-g])(#|b)?(\d)$/.exec(name);
    if (!m) throw new Error('Invalid note name: ' + name);
    var letter = m[1].toUpperCase() + (m[2] || '');
    if (ENHARMONIC[letter]) letter = ENHARMONIC[letter];
    var octave = parseInt(m[3], 10);
    return { letter: letter, octave: octave };
  }

  // 노트명 -> MIDI 번호 (C4 = 60)
  function noteToMidi(name) {
    var p = parseNote(name);
    var idx = CHROMATIC.indexOf(p.letter);
    return (p.octave + 1) * 12 + idx;
  }

  // MIDI 번호 -> 노트명 (항상 샵 표기)
  function midiToNote(midi) {
    var idx = ((midi % 12) + 12) % 12;
    var octave = Math.floor(midi / 12) - 1;
    return CHROMATIC[idx] + octave;
  }

  // 노트를 반음 단위로 이동
  function transpose(name, semitones) {
    return midiToNote(noteToMidi(name) + semitones);
  }

  global.WN = global.WN || {};
  global.WN.theory = { parseNote: parseNote, noteToMidi: noteToMidi, midiToNote: midiToNote, transpose: transpose };
})(window);
