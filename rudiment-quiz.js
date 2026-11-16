/* Auditory Rudiment Quiz
   Plays a short bass split and asks which piece of sheet music it was.
   Level 1: two beats, slow, one rudiment, four choices that differ a lot.
   Level 4: four to eight beats, quicker, mixed subdivisions, some rests, eight choices that are close.
   A choice that is only a rudiment (or a rudiment plus one note) shows the rudiment's name. */
(function () {
  'use strict';

  var S = SplitCore, M = RhythmModel;
  var rnd = S.rnd, pick = S.pick;
  var CHOICES = { 1: 4, 2: 4, 3: 6, 4: 8 };
  var TEMPO = { 1: [60, 72], 2: [72, 90], 3: [90, 110], 4: [108, 130] };

  function enabled(settings) {
    var list = S.RUDIMENTS.filter(function (r) { return settings['r_' + r.id]; });
    return list.length ? list : S.RUDIMENTS.slice();
  }
  function clone(beats) {
    return beats.map(function (b) { return { grid: b.grid, slots: b.slots.map(function (s) { return s ? s.slice() : null; }) }; });
  }
  function endNote() { return S.noteBeat(Math.random() < 0.5 ? [1, 2, 3, 4, 5] : [1 + rnd(5)]); }

  // nBeats of one rudiment, in a home subdivision unless alt is allowed. Null when it does not fit.
  function seg(ruds, nBeats, alt) {
    for (var tries = 0; tries < 30; tries++) {
      var rud = pick(ruds), grids = alt && rud.alt.length && Math.random() < 0.45 ? rud.alt : rud.home;
      var beats = S.segment(rud, pick(grids), nBeats);
      if (beats) return beats;
    }
    return S.segment(S.rudiment('single'), 's', nBeats);
  }
  // A beat that strays from the rudiments: any figure, drums moving freely.
  function strayBeat() {
    var grid = pick(['s', 's', 't']), mask = M.weighted(M.MASKS[grid]);
    if (mask.indexOf('1') === -1) mask = grid === 's' ? '1010' : '101';
    return { grid: grid, slots: mask.split('').map(function (c) { return c === '1' ? [1 + rnd(5)] : null; }) };
  }

  function passageBeats(level, ruds, total) {
    var beats = [], left, n;
    if (level === 1) {
      beats = Math.random() < 0.5 ? seg(ruds, 2) : seg(ruds, 1).concat([endNote()]);
    } else if (level === 2) {
      if (total === 2) beats = Math.random() < 0.5 ? seg(ruds, 2) : seg(ruds, 1).concat([endNote()]);
      else beats = pick([
        function () { return seg(ruds, 4); },
        function () { return seg(ruds, 3).concat([endNote()]); },
        function () { return seg(ruds, 2).concat(seg(ruds, 2)); }
      ])();
    } else if (level === 3) {
      beats = pick([
        function () { return seg(ruds, 2, true).concat(seg(ruds, 2, true)); },
        function () { return seg(ruds, 3, true).concat([endNote()]); },
        function () { return seg(ruds, 1, true).concat(seg(ruds, 2, true), [endNote()]); },
        function () { return seg(ruds, 2, true).concat(seg(ruds, 1, true), [endNote()]); }
      ])();
      if (Math.random() < 0.25) addRest(beats);
    } else {
      left = total;
      while (left > 0) {
        n = Math.min(left, pick([1, 1, 2, 2]));
        if (Math.random() < 0.22) { beats.push(strayBeat()); left -= 1; }
        else if (left === 1 && Math.random() < 0.4) { beats.push(endNote()); left -= 1; }
        else { beats = beats.concat(seg(ruds, n, true)); left -= n; }
      }
      if (Math.random() < 0.45) addRest(beats);
      if (Math.random() < 0.2) addRest(beats);
    }
    return beats;
  }
  // Take one note out (never the first of the passage).
  function addRest(beats) {
    for (var tries = 0; tries < 20; tries++) {
      var b = rnd(beats.length), i = rnd(beats[b].slots.length);
      if ((b === 0 && i === 0) || !beats[b].slots[i]) continue;
      if (beats[b].slots.filter(function (s) { return s; }).length < 2) continue;
      beats[b].slots[i] = null;
      return;
    }
  }

  /* ---------- wrong choices ---------- */

  function notes(beats) {
    var out = [];
    beats.forEach(function (beat, b) {
      beat.slots.forEach(function (s, i) { if (s) out.push({ at: b + i / beat.slots.length, drums: s.join('') }); });
    });
    return out;
  }
  // 1 when the rhythms differ; otherwise the share of notes on a different drum.
  function distance(a, b) {
    var x = notes(a), y = notes(b), diff = 0;
    if (x.length !== y.length) return 1;
    for (var i = 0; i < x.length; i++) {
      if (Math.abs(x[i].at - y[i].at) > 1e-6) return 1;
      if (x[i].drums !== y[i].drums) diff++;
    }
    return diff / x.length;
  }

  // One small change to a passage. Returns a changed copy, or null when the change did not apply.
  function mutate(src) {
    var beats = clone(src), b = rnd(beats.length), beat = beats[b], slots = beat.slots;
    var on = [];
    slots.forEach(function (s, i) { if (s) on.push(i); });
    var singles = on.filter(function (i) { return slots[i].length === 1; });
    var kind = pick(['step', 'step', 'swap', 'flip', 'shift', 'grid', 'drop', 'fill', 'unison']);
    var i, d;
    if (kind === 'step') {                       // one note moves to the drum next door
      if (!singles.length) return null;
      i = pick(singles); d = slots[i][0] + (Math.random() < 0.5 ? 1 : -1);
      if (d < 1 || d > 5) return null;
      slots[i] = [d];
    } else if (kind === 'swap') {                // two neighbouring notes trade drums
      if (on.length < 2) return null;
      i = rnd(on.length - 1);
      var a = slots[on[i]], c = slots[on[i + 1]];
      if (a.join() === c.join()) return null;
      slots[on[i]] = c; slots[on[i + 1]] = a;
    } else if (kind === 'flip') {                // the beat runs the other way
      var rev = on.map(function (k) { return slots[k]; }).reverse();
      on.forEach(function (k, n) { slots[k] = rev[n]; });
    } else if (kind === 'shift') {               // the whole beat moves one drum up or down
      d = Math.random() < 0.5 ? 1 : -1;
      if (!singles.length || singles.length !== on.length) return null;
      if (on.some(function (k) { return slots[k][0] + d < 1 || slots[k][0] + d > 5; })) return null;
      on.forEach(function (k) { slots[k] = [slots[k][0] + d]; });
    } else if (kind === 'grid') {                // sixteenths become a triplet, or a triplet sixteenths
      if (on.length !== slots.length || singles.length !== on.length) return null;
      if (beat.grid === 's') { beat.grid = 't'; beat.slots = slots.slice(0, 3); }
      else if (beat.grid === 't') {
        d = slots[2][0] + (slots[2][0] - slots[1][0]);
        if (d < 1 || d > 5) d = slots[1][0];
        beat.grid = 's'; beat.slots = slots.concat([[d]]);
      } else return null;
    } else if (kind === 'drop') {                // one note becomes silence
      if (on.length < 2) return null;
      i = pick(on);
      if (b === 0 && i === 0) return null;
      slots[i] = null;
    } else if (kind === 'fill') {                // a silence gets a note
      var off = [];
      slots.forEach(function (s, k) { if (!s) off.push(k); });
      if (!off.length) return null;
      slots[pick(off)] = [1 + rnd(5)];
    } else {                                     // a downbeat becomes a unison, or a unison one drum
      if (!slots[0]) return null;
      slots[0] = slots[0].length === 5 ? [1 + rnd(5)] : [1, 2, 3, 4, 5];
    }
    return beats;
  }

  function generate(settings) {
    var level = Number(settings.level) || 1, ruds = enabled(settings);
    var total = level === 1 ? 2 : level === 2 ? pick([2, 4, 4]) : level === 3 ? 4 : pick([4, 8, 8]);
    var want = CHOICES[level], answer, bars, tries;

    for (tries = 0; tries < 100; tries++) {
      answer = passageBeats(level, ruds, total);
      bars = S.toBars(answer);
      if (answer.length === total && S.barsValid(bars)) break;
    }
    var options = [{ beats: answer, bars: bars, correct: true }], seen = {};
    seen[S.barsKey(bars)] = true;

    function add(beats, test) {
      if (!beats || beats.length !== total) return false;
      var b = S.toBars(beats), key = S.barsKey(b);
      if (seen[key] || !S.barsValid(b) || (test && !test(beats))) return false;
      seen[key] = true;
      options.push({ beats: beats, bars: b });
      return true;
    }
    // "Far" choices are fresh passages that differ a lot; "near" ones are small changes to a choice already there.
    function far(min) {
      for (var t = 0; t < 200 && options.length < want; t++) {
        if (add(passageBeats(Math.min(level, 2), ruds, total), function (bt) { return distance(bt, answer) >= min; })) return;
      }
    }
    function near(changes, fromAnswer) {
      for (var t = 0; t < 300 && options.length < want; t++) {
        var base = fromAnswer ? answer : pick(options).beats, out = base;
        for (var c = 0; c < changes && out; c++) out = mutate(out);
        if (add(out)) return;
      }
    }
    var plan = level === 1 ? ['far', 'far', 'far']
      : level === 2 ? ['far', 'far', 'near3']
      : level === 3 ? ['far', 'near2', 'near2', 'near2', 'near1']
      : ['near1', 'near1', 'near1', 'near1', 'near2', 'near2', 'near1'];
    plan.forEach(function (step, n) {
      if (step === 'far') far(level === 1 ? 0.6 : 0.4);
      else near(Number(step.slice(4)), n < 2);
    });
    for (tries = 0; tries < 50 && options.length < want; tries++) { near(2, false); far(0.2); }

    options.forEach(function (o) { o.name = settings.names ? S.identify(o.bars) : null; });
    var name = S.identify(bars);
    S.shuffle(options);
    var range = TEMPO[level];
    return {
      bpm: range[0] + 2 * rnd((range[1] - range[0]) / 2 + 1),
      bars: bars, options: options,
      right: name ? 'That was ' + (/^[AEIOU]/.test(name) ? 'an ' : 'a ') + name + '.' : ''
    };
  }

  var LEVEL_NOTES = {
    1: 'Two beats, slow, one rudiment. Four choices that are easy to tell apart.',
    2: 'Two to four beats, sometimes two rudiments. Four choices.',
    3: 'Four beats, quicker, rudiments in unusual subdivisions, the odd rest. Six closer choices.',
    4: 'Four to eight beats, quick, mixed subdivisions, rests and notes that stray from the rudiments. Eight close choices.'
  };
  var defaults = { level: 1, met: true, countIn: true, names: true, timer: false };
  S.RUDIMENTS.forEach(function (r) { defaults['r_' + r.id] = true; });

  window.RudimentQuiz = ListenQuiz.start({
    key: 'arq', defaults: defaults, generate: generate,
    fix: function (s) {
      if (!S.RUDIMENTS.some(function (r) { return s['r_' + r.id]; })) S.RUDIMENTS.forEach(function (r) { s['r_' + r.id] = true; });
    },
    onSettings: function (s) { document.getElementById('level-note').textContent = LEVEL_NOTES[s.level] || ''; }
  });
  window.RudimentQuiz.generate = generate;
})();
