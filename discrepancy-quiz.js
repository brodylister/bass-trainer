/* Discrepancy Quiz
   Shows a bass rudiment as sheet music and plays it with something wrong: one drum early or late,
   too loud or too quiet, rushing or dragging, and from level 3 ringing too long, choked short or
   sounding dead. The student picks what they heard.
   Level 1: one obvious error in one slow rudiment. Level 4: a longer, quicker passage that may
   change rudiment, with two or three subtler errors. */
(function () {
  'use strict';

  var S = SplitCore;
  var rnd = S.rnd, pick = S.pick;
  var CHOICES = { 1: 4, 2: 4, 3: 6, 4: 8 };
  var TEMPO = { 1: [66, 76], 2: [80, 96], 3: [96, 112], 4: [112, 128] };

  /* How big each error is, level 1 to level 4. Timing is a share of the gap between the passage's
     closest notes; volume is in dB; sustain multiplies how long the drum rings; overtone and attack
     scale the drum's upper tones and beater noise (0 = gone). */
  var SIZE = {
    shift: [0.34, 0.28, 0.22, 0.17],
    drift: [0.60, 0.50, 0.42, 0.34],            // how far off the last note is; earlier notes are less
    volume: [8, 6, 4.5, 3.5],
    ring: [0, 0, 2.4, 1.7], choke: [0, 0, 0.4, 0.58],
    dead: [null, null, { overtone: 0, attack: 0.2 }, { overtone: 0.4, attack: 0.5 }]
  };
  var TYPES = {
    early: { group: 'time', text: 'is early', opposite: 'late', cousin: 'rush' },
    late: { group: 'time', text: 'is late', opposite: 'early', cousin: 'drag' },
    loud: { group: 'vol', text: 'is too loud', opposite: 'quiet', cousin: 'ring' },
    quiet: { group: 'vol', text: 'is too quiet', opposite: 'loud', cousin: 'choke' },
    rush: { group: 'drift', text: 'rushes (earlier and earlier)', opposite: 'drag', cousin: 'early' },
    drag: { group: 'drift', text: 'drags (later and later)', opposite: 'rush', cousin: 'late' },
    ring: { group: 'sound', text: 'rings too long', opposite: 'choke', cousin: 'loud' },
    choke: { group: 'sound', text: 'is choked short', opposite: 'ring', cousin: 'dead' },
    dead: { group: 'sound', text: 'sounds dead (no overtones)', opposite: 'ring', cousin: 'choke' }
  };

  function allowedTypes(settings, level) {
    var out = Object.keys(TYPES).filter(function (t) {
      var g = TYPES[t].group;
      if (g === 'sound' && level < 3) return false;
      return settings['e_' + g];
    });
    return out.length ? out : ['early', 'late'];
  }

  function rudiments(settings) {
    if (settings.rudiment !== 'mix' && S.rudiment(settings.rudiment)) return [S.rudiment(settings.rudiment)];
    return S.RUDIMENTS.slice();
  }
  function seg(ruds, nBeats, level) {
    for (var tries = 0; tries < 40; tries++) {
      var rud = pick(ruds);
      var grids = level >= 3 && rud.alt.length && Math.random() < 0.3 ? rud.alt : rud.home;
      // Level 1 stays slow: prefer triplets to sextuplets.
      var grid = level === 1 && grids.indexOf('t') !== -1 ? 't' : level === 1 && grids.indexOf('s') !== -1 ? 's' : pick(grids);
      var beats = S.segment(rud, grid, nBeats);
      if (beats) return beats;
    }
    return S.segment(S.rudiment('single'), 's', nBeats);
  }
  function passageBeats(level, ruds) {
    if (level < 4) return seg(ruds, 4, level);
    // Level 4: eight beats, in two or three stretches that may change rudiment, direction or subdivision.
    return Math.random() < 0.5 ? seg(ruds, 4, 4).concat(seg(ruds, 4, 4))
      : seg(ruds, 2, 4).concat(seg(ruds, 2, 4), seg(ruds, 4, 4));
  }

  function key(errors) {
    return errors.map(function (e) { return e.drum + e.type; }).sort().join(' ');
  }
  function lines(errors) {
    return errors.slice().sort(function (a, b) { return a.drum - b.drum; })
      .map(function (e) { return 'Bass ' + e.drum + ' ' + TYPES[e.type].text; });
  }

  // Change the passage in place so it carries the errors.
  function apply(seq, errors, level, bpm, audio) {
    var L = level - 1, beat = 60 / bpm, gap = Infinity, i;
    for (i = 1; i < seq.hits.length; i++) gap = Math.min(gap, seq.hits[i].beat - seq.hits[i - 1].beat);
    var unit = (isFinite(gap) ? gap : 0.25) * beat;
    errors.forEach(function (e) {
      var mine = [];
      seq.hits.forEach(function (h) { h.voices.forEach(function (v) { if (v.d === e.drum && !v.grace) mine.push(v); }); });
      var buf = null;
      if (e.type === 'ring' || e.type === 'choke') buf = audio.voice.variant(e.drum, { sustain: SIZE[e.type][L] });
      if (e.type === 'dead') buf = audio.voice.variant(e.drum, SIZE.dead[L]);
      mine.forEach(function (v, n) {
        if (e.type === 'early' || e.type === 'late') {
          if (e.some && e.some.indexOf(n) === -1) return;
          v.dt += (e.type === 'early' ? -1 : 1) * SIZE.shift[L] * unit;
        } else if (e.type === 'rush' || e.type === 'drag') {
          v.dt += (e.type === 'rush' ? -1 : 1) * SIZE.drift[L] * unit * (mine.length > 1 ? n / (mine.length - 1) : 1);
        } else if (e.type === 'loud' || e.type === 'quiet') {
          v.gain *= Math.pow(10, (e.type === 'loud' ? 1 : -1) * SIZE.volume[L] / 20);
        } else v.buf = buf;
      });
    });
  }

  function generate(settings) {
    var level = Number(settings.level) || 1, ruds = rudiments(settings), types = allowedTypes(settings, level);
    var beats = passageBeats(level, ruds), bars = S.toBars(beats), want = CHOICES[level];

    // How many notes each drum plays; a drum needs a few notes for an error to be heard.
    var plays = {};
    bars.forEach(function (bar) { bar.boxes.forEach(function (b) { if (!b.r) b.drums.forEach(function (d) { plays[d] = (plays[d] || 0) + 1; }); }); });
    var drums = Object.keys(plays).map(Number).filter(function (d) { return plays[d] >= 2; });
    if (!drums.length) drums = Object.keys(plays).map(Number);

    var count = level <= 2 ? 1 : level === 3 ? pick([1, 2]) : pick([2, 2, 3]);
    count = Math.min(count, drums.length);

    function randomError(avoid) {
      var free = drums.filter(function (d) { return avoid.indexOf(d) === -1; });
      var e = { type: pick(types), drum: pick(free.length ? free : drums) };
      if ((e.type === 'rush' || e.type === 'drag') && plays[e.drum] < 3) e.type = e.type === 'rush' ? 'early' : 'late';
      if (!TYPES[e.type] || types.indexOf(e.type) === -1) e.type = pick(types);
      return e;
    }
    var answer = [];
    while (answer.length < count) answer.push(randomError(answer.map(function (e) { return e.drum; })));
    // From level 2 a timing error may touch only some of the drum's notes.
    answer.forEach(function (e) {
      if (level >= 2 && (e.type === 'early' || e.type === 'late') && plays[e.drum] >= 4 && Math.random() < 0.4) {
        var idx = S.shuffle(Array.apply(null, { length: plays[e.drum] }).map(function (_, n) { return n; }));
        e.some = idx.slice(0, Math.ceil(plays[e.drum] / 2));
      }
    });

    var options = [{ errors: answer, correct: true }], seen = {};
    seen[key(answer)] = true;
    function add(errors) {
      var ds = errors.map(function (e) { return e.drum; });
      if (ds.some(function (d, i) { return ds.indexOf(d) !== i; })) return false;
      if (errors.some(function (e) { return types.indexOf(e.type) === -1 || drums.indexOf(e.drum) === -1; })) return false;
      if (seen[key(errors)]) return false;
      seen[key(errors)] = true;
      options.push({ errors: errors });
      return true;
    }
    // A close wrong answer changes one error a little: the drum next door, the opposite, or a look-alike.
    function near() {
      var base = pick(options).errors.map(function (e) { return { type: e.type, drum: e.drum }; });
      var e = pick(base), how = pick(['drum', 'drum', 'opposite', 'cousin']);
      if (how === 'drum') e.drum += Math.random() < 0.5 ? 1 : -1;
      else e.type = TYPES[e.type][how];
      return base;
    }
    // A far wrong answer shares neither the drum nor the kind of error.
    function far() {
      return answer.map(function (a) {
        var others = drums.filter(function (d) { return d !== a.drum; });
        var kinds = types.filter(function (t) { return TYPES[t].group !== TYPES[a.type].group; });
        return { type: pick(kinds.length ? kinds : types), drum: pick(others.length ? others : drums) };
      });
    }
    var nearShare = { 1: 0, 2: 0.5, 3: 0.8, 4: 1 }[level];
    for (var tries = 0; tries < 400 && options.length < want; tries++) {
      add(Math.random() < nearShare || tries > 200 ? near() : far());
    }
    for (tries = 0; tries < 200 && options.length < want; tries++) {
      add(answer.map(function () { return randomError([]); }));
    }

    options.forEach(function (o) { o.lines = lines(o.errors); });
    S.shuffle(options);
    var range = TEMPO[level], bpm = range[0] + 2 * rnd((range[1] - range[0]) / 2 + 1);
    var said = lines(answer).join('; ');
    return {
      bpm: bpm, bars: bars, sheet: bars, options: options, errors: answer,
      markDrums: answer.map(function (e) { return e.drum; }),
      alter: function (seq, audio) { apply(seq, answer, level, bpm, audio); },
      right: said + '. ' + (answer.length === 1 ? 'Its notes are' : 'Their notes are') + ' shown in blue on the sheet.'
    };
  }

  var LEVEL_NOTES = {
    1: 'One slow rudiment with one clear error. Four choices that are easy to tell apart.',
    2: 'One error, a little smaller, sometimes on only some of the drum’s notes. Four choices.',
    3: 'One or two errors, which can now be about a drum’s sound: ringing, choked or dead. Six choices.',
    4: 'A longer, quicker passage that may change rudiment, with two or three subtle errors. Eight close choices.'
  };
  var defaults = { level: 1, rudiment: 'mix', e_time: true, e_vol: true, e_drift: true, e_sound: true, met: true, countIn: true, clean: true, timer: false };

  window.DiscrepancyQuiz = ListenQuiz.start({
    key: 'dq', defaults: defaults, generate: generate,
    fix: function (s) { if (!s.e_time && !s.e_vol && !s.e_drift && !s.e_sound) s.e_time = true; },
    onSettings: function (s) {
      document.getElementById('level-note').textContent = LEVEL_NOTES[s.level] || '';
      document.getElementById('sound-note').textContent = s.level < 3 ? 'Used from level 3.' : 'Rings too long, choked short, or dead.';
    }
  });
  window.DiscrepancyQuiz.generate = generate;
  window.DiscrepancyQuiz.apply = apply;
})();
