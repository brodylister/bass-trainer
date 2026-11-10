/* Box-Cooldown Sandbox
   One bar of 4/4 shown two ways that always match: engraved music (VexFlow, Bravura) and a row of boxes.
   Each box is as wide as its note lasts. A note box has a green line where it is struck and a red
   "cooldown" for the wait until the next thing on the page. A rest box has no green line.

   Time is counted in ticks: 12 to a beat, 48 to the bar. That makes a sixteenth 3 ticks, a triplet
   eighth 4 and a triplet sixteenth 2, so every length the sandbox allows is a whole number. */
(function () {
  'use strict';

  var VF = Vex.Flow;
  var $ = function (id) { return document.getElementById(id); };

  var BEAT = 12, BAR = 48;
  // Written value for each box length. Lengths inside a tuplet use their own table.
  var STRAIGHT = { 48: 'w', 36: 'hd', 24: 'h', 18: 'qd', 12: 'q', 9: '8d', 6: '8', 3: '16' };
  var TUPLET = { 8: 'q', 4: '8', 2: '16' };
  var STRAIGHT_NAME = { 48: 'whole', 36: 'dotted half', 24: 'half', 18: 'dotted quarter', 12: 'quarter', 9: 'dotted eighth', 6: 'eighth', 3: 'sixteenth' };
  var TUPLET_NAME = { 8: 'triplet quarter', 4: 'triplet eighth', 2: 'triplet sixteenth' };

  /* ---------- the model ----------
     A bar is a list of boxes in time order: { s: start tick, d: length, r: is a rest,
     t: null or [start, span] of the tuplet bracket the box sits under (span 12 = a whole beat,
     span 6 = half a beat) }. */

  function copy(list) {
    return list.map(function (b) { return { s: b.s, d: b.d, r: b.r, t: b.t ? [b.t[0], b.t[1]] : null }; });
  }
  function sameGroup(a, b) { return a.t && b.t && a.t[0] === b.t[0] && a.t[1] === b.t[1]; }

  // Cut box i into n equal parts. Returns { boxes } or { msg } when that cut is not possible.
  function cut(list, i, n) {
    var b = list[i], part = 0, t = b.t;
    if (b.t) {
      if (n === 3) return { soon: true, msg: 'Nested tuplets are not ready yet. For now, a piece of a tuplet can only be cut in half.' };
      if (b.d === 2) return { msg: 'That is the smallest piece for now.' };
      part = b.d / 2;
    } else if (n === 2) {
      if (b.d === 3) return { msg: 'Sixteenth notes are the smallest cut for now.' };
      if (b.d === 9 || b.d === 18 || b.d === 36) return { msg: 'A dotted note does not cut into 2 equal parts. It does cut evenly into 3: try the 3 scissors.' };
      part = b.d / 2;
    } else {
      if (b.d === 3) return { msg: 'Sixteenth notes are the smallest cut for now.' };
      if (b.d === 9 || b.d === 18 || b.d === 36) part = b.d / 3;           // three plain notes, no tuplet
      else if (b.d === 12) { part = 4; t = [b.s, 12]; }                    // eighth-note triplet
      else if (b.d === 6) {
        if (b.s % 6 !== 0) return { msg: 'This eighth note starts off the beat, so it cannot become a triplet yet.' };
        part = 2; t = [b.s, 6];                                            // sixteenth-note triplet
      }
      else return { msg: 'Cut this down to quarter notes first, then cut a quarter note into 3.' };
    }
    var out = copy(list), parts = [];
    for (var k = 0; k < n; k++) parts.push({ s: b.s + k * part, d: part, r: b.r, t: t ? [t[0], t[1]] : null });
    Array.prototype.splice.apply(out, [i, 1].concat(parts));
    return { boxes: out, made: parts.length, at: i };
  }

  // Remove the cut between box i and box i + 1, fusing them into one box.
  function fuse(list, i) {
    var a = list[i], b = list[i + 1];
    if (!a || !b) return { msg: 'Hold on the line between two boxes to fuse them.' };
    var d = a.d + b.d, t = null;
    if (a.t || b.t) {
      if (!sameGroup(a, b)) return { msg: 'These two cannot fuse yet: one is inside a tuplet. Fuse the tuplet back into one box first.' };
      if (d === a.t[1]) t = null;                                          // the whole tuplet is back to one plain note
      else if (TUPLET[d]) t = [a.t[0], a.t[1]];
      else return { msg: 'That would make a dotted note inside a tuplet, which is not supported yet.' };
    } else {
      if (!STRAIGHT[d]) return { msg: 'Those two add up to a length that needs a tie, and ties are not supported yet.' };
      var crosses = Math.floor(a.s / BEAT) !== Math.floor((a.s + d - 1) / BEAT);
      if (crosses && a.s % BEAT !== 0) return { msg: 'That note would hang over the beat and need a tie, and ties are not supported yet.' };
    }
    var out = copy(list);
    out.splice(i, 2, { s: a.s, d: d, r: a.r, t: t });
    return { boxes: out, made: 1, at: i };
  }

  // A beat-wide tuplet is written as a 6 once any piece of it is cut finer than a triplet eighth.
  function isSix(list, t) {
    return t[1] === 12 && list.some(function (b) {
      return b.t && b.t[0] === t[0] && b.t[1] === 12 && (b.d % 4 !== 0 || (b.s - t[0]) % 4 !== 0);
    });
  }

  function toggleRest(list, i) {
    var out = copy(list);
    out[i].r = !out[i].r;
    return { boxes: out, made: 1, at: i };
  }

  // True when the list is a legal bar. Used as a guard on anything loaded or generated.
  function valid(list) {
    var pos = 0, i, groups = {};
    for (i = 0; i < list.length; i++) {
      var b = list[i];
      if (b.s !== pos) return false;
      if (b.t) {
        if (!TUPLET[b.d] || (b.t[1] !== 12 && b.t[1] !== 6) || b.t[0] % b.t[1] !== 0) return false;
        if (b.s < b.t[0] || b.s + b.d > b.t[0] + b.t[1]) return false;
        var key = b.t.join(':');
        groups[key] = (groups[key] || 0) + b.d;
      } else {
        if (!STRAIGHT[b.d]) return false;
        if (Math.floor(b.s / BEAT) !== Math.floor((b.s + b.d - 1) / BEAT) && b.s % BEAT !== 0) return false;
      }
      pos += b.d;
    }
    if (pos !== BAR) return false;
    return Object.keys(groups).every(function (k) { return groups[k] === Number(k.split(':')[1]); });
  }

  /* Counts, with the names the Split Trainer uses: sixteenths "1 e + a", triplets "1 pul let",
     sextuplets "1 pul let + pul let". A beat cut finer than triplets is counted on the sextuplet grid. */
  function countName(list, tick) {
    var beat = Math.floor(tick / BEAT), rel = tick - beat * BEAT;
    if (rel === 0) return String(beat + 1);
    var tripletBeat = list.every(function (b) {
      return b.s < beat * BEAT || b.s >= (beat + 1) * BEAT || (b.s - beat * BEAT) % 4 === 0;
    });
    if (tripletBeat) return rel === 4 ? 'pul' : 'let';
    return { 3: 'e', 6: '+', 9: 'a', 2: 'pul', 4: 'let', 8: 'pul', 10: 'let' }[rel];
  }
  function counts(list) {
    var out = [];
    for (var beat = 0; beat < 4; beat++) {
      var names = [], held = false;
      list.forEach(function (b) {
        if (b.s >= beat * BEAT && b.s < (beat + 1) * BEAT) { if (!b.r) names.push(countName(list, b.s)); }
        else if (b.s < beat * BEAT && b.s + b.d > beat * BEAT && !b.r) held = true;
      });
      out.push({ names: names, state: names.length ? 'play' : held ? 'hold' : 'rest' });
    }
    return out;
  }

  /* ---------- examples and random bars ---------- */

  // "q 8 r16" are plain values (r = rest); square brackets wrap a tuplet.
  function parse(text) {
    var out = [], pos = 0, group = null;
    var plain = { w: 48, hd: 36, h: 24, qd: 18, q: 12, '8d': 9, '8': 6, '16': 3 };
    var inTuplet = { q: 8, '8': 4, '16': 2 };
    (text.match(/\[|\]|r?(?:w|hd|h|qd|q|8d|8|16)/g) || []).forEach(function (tok) {
      if (tok === '[') { group = { start: pos, from: out.length }; return; }
      if (tok === ']') {
        for (var i = group.from; i < out.length; i++) out[i].t = [group.start, pos - group.start];
        group = null;
        return;
      }
      var rest = tok[0] === 'r', v = rest ? tok.slice(1) : tok;
      var d = group ? inTuplet[v] : plain[v];
      out.push({ s: pos, d: d, r: rest, t: null });
      pos += d;
    });
    return out;
  }

  var EXAMPLES = [
    { name: 'Quarter notes', bar: 'q q q q',
      note: 'Four hits, one on each beat. The green line is the hit. The red is the wait before the next one.' },
    { name: 'A longer wait', bar: 'h q q',
      note: 'A half note is one hit with a cooldown two beats wide. Longer note, longer wait.' },
    { name: 'Eighth notes', bar: '8 8 q 8 8 q',
      note: 'Cut a beat in half and you get two eighth notes: "1 +". Each one waits half as long.' },
    { name: 'Rests', bar: 'q rq 8 8 rq',
      note: 'A rest takes up time just like a note, but there is no green line because nothing is played.' },
    { name: 'Off the beat', bar: 'qd 8 r8 8 q',
      note: 'A dotted quarter waits a beat and a half, so the next hit lands on the "+" of 2.' },
    { name: 'Sixteenth notes', bar: '16 16 16 16 q 16 16 16 16 q',
      note: 'Cut an eighth note in half again: four sixteenths to a beat, "1 e + a".' },
    { name: 'Sixteenth figures', bar: '8 16 16 16 16 8 8 16 16 q',
      note: '"1 +a" and "1e+" use the same pieces in a different order. Watch which hit gets the long wait.' },
    { name: 'Dotted and syncopated', bar: '8d 16 16 8 16 r8d 16 q',
      note: '"1 a", "2e a" and a lone "a". The dotted eighth is three sixteenths wide.' },
    { name: 'Triplets', bar: '[8 8 8] q [q 8] [8 8 8]',
      note: 'A beat cut in 3: "1 pul let". On beat 3 the first two pieces are fused, leaving "3 let".' },
    { name: 'Everything together', bar: '[16 16 16 16 16 16] [8 r8 8] 16 16 r8 [16 16 16] 8',
      note: 'Sextuplets, a triplet with a rest inside, sixteenths and a sixteenth-note triplet in one bar.' }
  ];

  // Figures per beat, weighted like the Split Trainer's level 2.
  var MASKS = {
    s: [['1111', 10], ['1011', 5], ['1101', 5], ['1110', 5], ['0111', 4], ['1010', 6], ['1001', 3],
        ['1000', 4], ['0010', 3], ['0011', 3], ['1100', 3], ['0101', 2], ['0110', 2], ['0001', 2],
        ['0100', 1], ['0000', 2]],
    t: [['111', 10], ['101', 4], ['110', 3], ['011', 3], ['001', 2], ['010', 1]],
    x: [['111111', 10], ['011111', 2], ['111110', 2], ['110110', 1], ['101101', 1], ['110111', 1], ['111011', 1]]
  };
  function weighted(pairs) {
    var total = 0, i;
    for (i = 0; i < pairs.length; i++) total += pairs[i][1];
    var r = Math.random() * total;
    for (i = 0; i < pairs.length; i++) { r -= pairs[i][1]; if (r < 0) return pairs[i][0]; }
    return pairs[pairs.length - 1][0];
  }
  // One beat from a figure: a rest up to the first hit, then every note rings until the next one.
  function beatBoxes(grid, mask, start) {
    var unit = grid === 's' ? 3 : grid === 't' ? 4 : 2, n = mask.length, out = [], first = mask.indexOf('1');
    if (first === -1) return [{ s: start, d: BEAT, r: true, t: null }];
    if (grid === 't' && mask === '110') {                                  // "1 pul" is two eighths and a rest
      return [0, 1, 2].map(function (k) { return { s: start + k * 4, d: 4, r: k === 2, t: [start, 12] }; });
    }
    var t = grid === 's' ? null : [start, 12];
    if (first > 0) out.push({ s: start, d: first * unit, r: true, t: t });
    for (var i = first; i < n; i++) {
      if (mask[i] !== '1') continue;
      var j = i + 1;
      while (j < n && mask[j] !== '1') j++;
      out.push({ s: start + i * unit, d: (j - i) * unit, r: false, t: t });
    }
    if (out.length === 1) out[0].t = null;                                 // nothing cut: a plain quarter
    return out;
  }
  function randomBar() {
    for (var tries = 0; tries < 50; tries++) {
      var out = [], hits = 0;
      for (var beat = 0; beat < 4; beat++) {
        var grid = weighted([['s', 6], ['t', 3], ['x', 1]]);
        out = out.concat(beatBoxes(grid, weighted(MASKS[grid]), beat * BEAT));
      }
      out.forEach(function (b) { if (!b.r) hits++; });
      if (hits >= 4 && valid(out)) return out;
    }
    return parse('q q q q');
  }

  /* ---------- state, history, storage ---------- */

  var boxes = parse(EXAMPLES[0].bar);
  var tool = 'cut2', example = 0, past = [], future = [];
  var prefs = { bpm: 80, met: true, loop: true, countIn: true };

  try {
    var saved = JSON.parse(localStorage.getItem('bcs-state') || 'null');
    if (saved) {
      if (Array.isArray(saved.boxes) && valid(saved.boxes)) { boxes = copy(saved.boxes); example = saved.example; }
      Object.keys(prefs).forEach(function (k) { if (k in (saved.prefs || {})) prefs[k] = saved.prefs[k]; });
    }
  } catch (e) { /* storage unavailable: start from the first example */ }
  function store() {
    try { localStorage.setItem('bcs-state', JSON.stringify({ boxes: boxes, example: example, prefs: prefs })); } catch (e) { /* ignore */ }
  }

  var popAt = null;
  function commit(result, keepExample) {
    if (result.msg) { cue(result.msg, result.soon); return false; }
    past.push({ boxes: boxes, example: example });
    if (past.length > 200) past.shift();
    future = [];
    boxes = result.boxes;
    if (!keepExample) example = null;
    popAt = result.made ? { from: result.at, to: result.at + result.made - 1 } : null;
    cue('');
    render();
    return true;
  }
  function undo() {
    if (!past.length) return;
    future.push({ boxes: boxes, example: example });
    var p = past.pop(); boxes = p.boxes; example = p.example;
    cue(''); render();
  }
  function redo() {
    if (!future.length) return;
    past.push({ boxes: boxes, example: example });
    var f = future.pop(); boxes = f.boxes; example = f.example;
    cue(''); render();
  }

  var cueTimer = null;
  function cue(msg, soon) {
    var el = $('cue');
    clearTimeout(cueTimer);
    el.hidden = !msg;
    el.textContent = msg || '';
    el.className = 'cue' + (soon ? ' soon' : '');
    if (msg) cueTimer = setTimeout(function () { el.hidden = true; }, 5000);
  }

  /* ---------- engraving: snare style, every note on one space ---------- */

  var geom = { W: 380, centers: [] };

  function engrave() {
    var host = $('staff');
    host.innerHTML = '';
    var items = [], beams = [], tuplets = [], run = [], runBeat = -1, groups = {}, order = [];

    function endRun() {
      if (run.length > 1) {
        var beam = new VF.Beam(run.map(function (it) { return it.vf; }));
        beam.render_options.max_slope = 0.12;
        beam.render_options.min_slope = -0.12;
        beams.push(beam);
        run.forEach(function (it) { it.beamed = true; });
      }
      run = [];
    }

    boxes.forEach(function (b) {
      var dur = (b.t ? TUPLET : STRAIGHT)[b.d];
      var vf = new VF.StaveNote({ keys: [b.r ? 'b/4' : 'c/5'], duration: dur + (b.r ? 'r' : ''), clef: 'percussion', stem_direction: 1 });
      if (dur.indexOf('d') !== -1) VF.Dot.buildAndAttach([vf], { all: true });
      var it = { vf: vf, box: b, beamed: false };
      // Beams stay inside one beat and never cross a rest; a note on its own keeps its flag.
      var beat = Math.floor(b.s / BEAT);
      var beamable = !b.r && b.d < (b.t ? 8 : 12);
      if (!beamable || beat !== runBeat) endRun();
      if (beamable) { run.push(it); runBeat = beat; }
      if (b.t) {
        var key = b.t.join(':');
        if (!groups[key]) { groups[key] = []; order.push(key); }
        groups[key].push(it);
      }
      items.push(it);
    });
    endRun();

    order.forEach(function (key) {
      var group = groups[key], span = Number(key.split(':')[1]);
      var six = isSix(boxes, group[0].box.t);
      tuplets.push(new VF.Tuplet(group.map(function (it) { return it.vf; }), {
        num_notes: six ? 6 : 3, notes_occupied: six ? 4 : 2, ratioed: false,
        bracketed: !group.every(function (it) { return it.beamed; }), location: 1
      }));
    });

    var W = Math.max(380, 150 + items.length * 23), H = 150;
    var renderer = new VF.Renderer(host, VF.Renderer.Backends.SVG);
    renderer.resize(W, H);
    var ctx = renderer.getContext();
    var stave = new VF.Stave(8, 34, W - 16);
    stave.addClef('percussion').addTimeSignature('4/4');
    stave.setContext(ctx).draw();

    var voice = new VF.Voice({ num_beats: 4, beat_value: 4 });
    voice.setMode(VF.Voice.Mode.SOFT);
    voice.addTickables(items.map(function (it) { return it.vf; }));
    new VF.Formatter().joinVoices([voice]).formatToStave([voice], stave);
    items.forEach(function (it) { if (it.box.r) it.vf.setKeyLine(0, it.box.d === 48 ? 4 : 3); });
    voice.draw(ctx, stave);
    beams.forEach(function (bm) { bm.setContext(ctx).draw(); });
    tuplets.forEach(function (tp) { tp.setContext(ctx).draw(); });

    var svg = host.querySelector('svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.style.width = '100%';
    svg.style.minWidth = Math.round(W * 0.92) + 'px';   // dense bars keep their size and scroll sideways
    svg.style.maxWidth = Math.round(W * 1.5) + 'px';
    svg.style.height = 'auto';
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'One bar of music in 4/4: ' + describeBar());

    // A tap zone behind each note, reaching halfway to its neighbours.
    geom.W = W;
    geom.centers = items.map(function (it) { return it.vf.getAbsoluteX() + 6; });
    var NS = 'http://www.w3.org/2000/svg', first = svg.firstChild;
    geom.centers.forEach(function (c, i) {
      var left = i === 0 ? Math.max(0, c - 26) : (geom.centers[i - 1] + c) / 2;
      var right = i === geom.centers.length - 1 ? W : (c + geom.centers[i + 1]) / 2;
      var rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('class', 'zone');
      rect.setAttribute('data-i', i);
      rect.setAttribute('x', left); rect.setAttribute('y', 14);
      rect.setAttribute('width', right - left); rect.setAttribute('height', H - 28);
      rect.setAttribute('rx', 4);
      svg.insertBefore(rect, first);
    });

    var sheet = $('sheet');
    $('scroll-hint').hidden = sheet.scrollWidth <= sheet.clientWidth + 1;
  }

  function describe(b) {
    return (b.t ? TUPLET_NAME : STRAIGHT_NAME)[b.d] + (b.r ? ' rest' : ' note') + ' on ' + spoken(countName(boxes, b.s), b.s);
  }
  function spoken(name, tick) {
    var beat = Math.floor(tick / BEAT) + 1;
    return tick % BEAT === 0 ? 'beat ' + beat : 'the ' + (name === '+' ? 'and' : name) + ' of ' + beat;
  }
  function describeBar() { return boxes.map(describe).join(', '); }

  /* ---------- the boxes ---------- */

  var rows = [[0, BAR]];

  function el(cls, parent) {
    var d = document.createElement('div');
    d.className = cls;
    if (parent) parent.appendChild(d);
    return d;
  }

  function renderBoxes() {
    var host = $('boxes'), focus = document.activeElement && document.activeElement.classList.contains('box')
      ? Number(document.activeElement.dataset.i) : null;
    rows = host.clientWidth < 560 ? [[0, 24], [24, BAR]] : [[0, BAR]];   // narrow screens: two beats per row
    host.innerHTML = '';
    rows.forEach(function (r) {
      var row = el('row', host), span = r[1] - r[0];
      var pct = function (tick) { return ((tick - r[0]) / span * 100) + '%'; };
      row.dataset.s = r[0]; row.dataset.e = r[1];

      for (var beat = r[0] / BEAT; beat < r[1] / BEAT; beat++) {
        var bg = el('beat', row);
        bg.style.left = pct(beat * BEAT); bg.style.width = (BEAT / span * 100) + '%';
        bg.appendChild(document.createElement('b')).textContent = beat + 1;
      }
      var seen = {};
      boxes.forEach(function (b) {
        if (!b.t || seen[b.t.join(':')] || b.t[0] < r[0] || b.t[0] >= r[1]) return;
        seen[b.t.join(':')] = true;
        var shade = el('tup', row);
        shade.style.left = pct(b.t[0]); shade.style.width = (b.t[1] / span * 100) + '%';
        shade.appendChild(document.createElement('b')).textContent = isSix(boxes, b.t) ? '6' : '3';
      });
      boxes.forEach(function (b, i) {
        var s = Math.max(b.s, r[0]), e = Math.min(b.s + b.d, r[1]);
        if (s >= e) return;
        var box = el('box' + (b.r ? ' rest' : '') + (s > b.s ? ' cont-l' : '') + (e < b.s + b.d ? ' cont-r' : ''), row);
        box.style.left = pct(s); box.style.width = 'calc(' + ((e - s) / span * 100) + '% - ' + (s > b.s || e < b.s + b.d ? 1.5 : 3) + 'px)';
        box.dataset.i = i;
        if (s === b.s) {
          box.tabIndex = 0;
          box.setAttribute('role', 'button');
          box.setAttribute('aria-label', describe(b));
        }
        if (popAt && i >= popAt.from && i <= popAt.to) box.classList.add('pop');
      });
      for (var i = 0; i < boxes.length - 1; i++) {
        var at = boxes[i + 1].s;
        if (at <= r[0] || at > r[1]) continue;
        var line = el('cut', row);
        line.style.left = pct(at);
        line.dataset.cut = i;
      }
      el('playhead', row).hidden = true;
    });
    popAt = null;
    if (focus !== null) {
      var again = host.querySelector('.box[role="button"][data-i="' + Math.min(focus, boxes.length - 1) + '"]');
      if (again) again.focus();
    }
  }

  function renderCounts() {
    var host = $('count-chips'), said = [];
    host.innerHTML = '';
    counts(boxes).forEach(function (c, beat) {
      var chip = el('chip' + (c.state === 'play' ? '' : ' is-empty'), host);
      chip.appendChild(document.createElement('small')).textContent = 'Beat ' + (beat + 1);
      chip.appendChild(document.createElement('span')).textContent =
        c.state === 'play' ? c.names.join(' ') : c.state === 'hold' ? 'hold' : 'rest';
      if (c.state === 'play') said.push(c.names.join(' '));
    });
    $('count-text').textContent = said.length ? 'Play on ' + said.join(', ') + '.' : 'Nothing is played in this bar.';
  }

  var TOOL_HINTS = {
    cut2: 'Tap a box or a note to cut it in half.',
    cut3: 'Tap a box or a note to cut it in 3.',
    toggle: 'Tap a box or a note to switch it between a note and a rest.'
  };
  function renderControls() {
    ['cut2', 'cut3', 'toggle'].forEach(function (t) { $('tool-' + t).setAttribute('aria-pressed', tool === t ? 'true' : 'false'); });
    $('tool-hint').textContent = TOOL_HINTS[tool] + ' Hold the line between two boxes to fuse them.';
    $('undo').disabled = !past.length;
    $('redo').disabled = !future.length;
    Array.prototype.forEach.call($('example-grid').children, function (btn, i) {
      btn.setAttribute('aria-pressed', example === i ? 'true' : 'false');
    });
    var note = $('example-note');
    note.innerHTML = '';
    if (example !== null && EXAMPLES[example]) {
      note.appendChild(document.createElement('strong')).textContent = (example + 1) + '. ' + EXAMPLES[example].name + '. ';
      note.appendChild(document.createTextNode(EXAMPLES[example].note));
    }
  }

  function render() {
    engrave();
    renderBoxes();
    renderCounts();
    renderControls();
    store();
  }

  /* ---------- touch: tap a box or note to use the tool, hold a cut to fuse ---------- */

  var HOLD_MS = 450, CUT_REACH = 18;

  // Where a pointer is: which box it is on, the nearest cut, and how far away that cut is in pixels.
  function locateBoxes(e) {
    var host = $('boxes'), best = null;
    Array.prototype.forEach.call(host.children, function (row) {
      var rc = row.getBoundingClientRect();
      var gap = e.clientY < rc.top ? rc.top - e.clientY : e.clientY > rc.bottom ? e.clientY - rc.bottom : 0;
      if (!best || gap < best.gap) best = { row: row, rc: rc, gap: gap };
    });
    if (!best || best.gap > 12) return null;
    var s = Number(best.row.dataset.s), e2 = Number(best.row.dataset.e);
    var perTick = best.rc.width / (e2 - s);
    var tick = Math.min(e2 - 0.001, Math.max(s, s + (e.clientX - best.rc.left) / perTick));
    return nearest(function (b) { return b.s; }, tick, perTick, function (b) { return tick >= b.s && tick < b.s + b.d; });
  }
  function locateStaff(e) {
    var svg = $('staff').querySelector('svg');
    if (!svg) return null;
    var rc = svg.getBoundingClientRect();
    if (e.clientY < rc.top || e.clientY > rc.bottom || e.clientX < rc.left || e.clientX > rc.right) return null;
    var scale = rc.width / geom.W, x = (e.clientX - rc.left) / scale, c = geom.centers;
    var mid = function (i) { return (c[i - 1] + c[i]) / 2; };
    var i = 0;
    while (i < c.length - 1 && x >= mid(i + 1)) i++;
    var cutAt = null, dist = Infinity;
    for (var k = 1; k < c.length; k++) {
      var dk = Math.abs(x - mid(k)) * scale;
      if (dk < dist) { dist = dk; cutAt = k - 1; }
    }
    return { i: i, cut: cutAt, dist: 0 };      // on the staff a hold always means the nearest cut
  }
  function nearest(startOf, tick, perTick, inside) {
    var i = 0, cutAt = null, dist = Infinity;
    boxes.forEach(function (b, k) {
      if (inside(b)) i = k;
      if (k === 0) return;
      var dk = Math.abs(tick - startOf(b)) * perTick;
      if (dk < dist) { dist = dk; cutAt = k - 1; }
    });
    return { i: i, cut: cutAt, dist: dist };
  }

  var press = null, lastPointer = 'mouse';

  function mark(i, cutAt) {
    Array.prototype.forEach.call(document.querySelectorAll('.is-active, .is-arming'), function (n) {
      n.classList.remove('is-active'); n.classList.remove('is-arming');
    });
    if (i === null) return;
    Array.prototype.forEach.call(document.querySelectorAll('.box[data-i="' + i + '"], .zone[data-i="' + i + '"]'), function (n) {
      n.classList.add('is-active');
    });
    if (cutAt !== null) {
      Array.prototype.forEach.call(document.querySelectorAll('.cut[data-cut="' + cutAt + '"]'), function (n) { n.classList.add('is-arming'); });
    }
  }
  function useTool(i) {
    if (tool === 'toggle') commit(toggleRest(boxes, i));
    else commit(cut(boxes, i, tool === 'cut3' ? 3 : 2));
  }
  function fuseCut(cutAt) {
    if (cutAt === null) { cue('Hold on the line between two boxes to fuse them.'); return; }
    if (commit(fuse(boxes, cutAt)) && navigator.vibrate) { try { navigator.vibrate(12); } catch (e) { /* ignore */ } }
  }
  function endPress() {
    if (!press) return;
    clearTimeout(press.timer);
    press = null;
    mark(null, null);
  }

  function surface(node, locate) {
    node.addEventListener('pointerdown', function (e) {
      lastPointer = e.pointerType || 'mouse';
      if (e.button !== 0) return;
      var at = locate(e);
      if (!at) return;
      endPress();
      var reach = at.cut !== null && at.dist <= CUT_REACH ? at.cut : null;
      press = { x: e.clientX, y: e.clientY, at: at, held: false };
      mark(at.i, reach);
      press.timer = setTimeout(function () {
        if (!press) return;
        press.held = true;
        mark(null, null);
        fuseCut(reach);
      }, HOLD_MS);
    });
    node.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      if (lastPointer !== 'mouse') return;      // on touch the hold timer has already done the work
      var at = locate(e);
      if (at) fuseCut(at.cut !== null && at.dist <= CUT_REACH ? at.cut : null);
    });
  }
  window.addEventListener('pointermove', function (e) {
    if (press && Math.abs(e.clientX - press.x) + Math.abs(e.clientY - press.y) > 12) endPress();
  });
  window.addEventListener('pointerup', function () {
    if (!press) return;
    var p = press;
    endPress();
    if (!p.held) useTool(p.at.i);
  });
  window.addEventListener('pointercancel', endPress);

  surface($('boxes'), locateBoxes);
  surface($('sheet'), locateStaff);

  // Keyboard: Enter or Space uses the tool on the focused box; Backspace and Delete fuse the cut before or after it.
  $('boxes').addEventListener('keydown', function (e) {
    var box = e.target.closest('.box');
    if (!box) return;
    var i = Number(box.dataset.i);
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); useTool(i); }
    else if (e.key === 'Backspace' && i > 0) { e.preventDefault(); fuseCut(i - 1); }
    else if (e.key === 'Delete' && i < boxes.length - 1) { e.preventDefault(); fuseCut(i); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      var to = $('boxes').querySelector('.box[role="button"][data-i="' + (i + (e.key === 'ArrowRight' ? 1 : -1)) + '"]');
      if (to) { e.preventDefault(); to.focus(); }
    }
  });
  document.addEventListener('keydown', function (e) {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
    e.preventDefault();
    if (e.shiftKey) redo(); else undo();
  });

  /* ---------- tools, examples ---------- */

  ['cut2', 'cut3', 'toggle'].forEach(function (t) {
    $('tool-' + t).addEventListener('click', function () { tool = t; cue(''); renderControls(); });
  });
  $('undo').addEventListener('click', undo);
  $('redo').addEventListener('click', redo);

  EXAMPLES.forEach(function (ex, i) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = i + 1;
    btn.setAttribute('aria-label', 'Example ' + (i + 1) + ': ' + ex.name);
    btn.addEventListener('click', function () {
      commit({ boxes: parse(ex.bar) }, true);
      example = i;
      renderControls(); store();
    });
    $('example-grid').appendChild(btn);
  });
  $('randomize').addEventListener('click', function () { commit({ boxes: randomBar() }); });

  // The note-or-rest tool shows a quarter note and a quarter rest, drawn with the same music font as the sheet.
  (function drawNoteRestIcon() {
    var host = $('noterest-icon');
    try {
      var r = new VF.Renderer(host, VF.Renderer.Backends.SVG);
      r.resize(40, 34);
      var ctx = r.getContext();
      ctx.setFillStyle('currentColor'); ctx.setStrokeStyle('currentColor');
      VF.Glyph.renderGlyph(ctx, 3, 26, 30, 'noteheadBlack');
      ctx.fillRect(12.2, 5, 1.3, 20);
      VF.Glyph.renderGlyph(ctx, 26, 17, 30, 'restQuarter');
      ctx.setLineWidth(1.3); ctx.beginPath(); ctx.moveTo(22.5, 4); ctx.lineTo(18.5, 30); ctx.stroke();
    } catch (e) { host.textContent = 'note / rest'; }
  })();

  /* ---------- playback ----------
     Everything is scheduled on the Web Audio clock, one bar at a time and a little ahead, so hits land
     exactly where the notation says no matter how busy the page is. Edits are heard from the next bar. */

  var player = { ctx: null, master: null, noise: null, on: false, next: 0, stage: 'music', endAt: null, timer: null, raf: 0, bars: [] };

  function audioContext() {
    if (!player.ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      player.ctx = new AC();
      var len = Math.floor(player.ctx.sampleRate * 0.25);
      player.noise = player.ctx.createBuffer(1, len, player.ctx.sampleRate);
      var data = player.noise.getChannelData(0);
      for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (player.ctx.state === 'suspended') player.ctx.resume();
    return player.ctx;
  }
  function envelope(at, peak, length) {
    var g = player.ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, at + length);
    g.connect(player.master);
    return g;
  }
  // The met: a short high beep, higher still on beat 1.
  function metClick(at, downbeat) {
    var osc = player.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(downbeat ? 1760 : 1175, at);
    osc.connect(envelope(at, 0.32, 0.045));
    osc.start(at); osc.stop(at + 0.06);
  }
  // The drum: a burst of filtered noise over a short low thump.
  function drumHit(at) {
    var src = player.ctx.createBufferSource(), band = player.ctx.createBiquadFilter();
    src.buffer = player.noise;
    band.type = 'bandpass'; band.frequency.value = 2400; band.Q.value = 0.6;
    src.connect(band); band.connect(envelope(at, 0.9, 0.1));
    src.start(at); src.stop(at + 0.12);
    var body = player.ctx.createOscillator();
    body.type = 'triangle';
    body.frequency.setValueAtTime(230, at);
    body.frequency.exponentialRampToValueAtTime(150, at + 0.06);
    body.connect(envelope(at, 0.55, 0.07));
    body.start(at); body.stop(at + 0.09);
  }

  // The moments, in seconds from the start of the bar, when each note of a bar is struck.
  function hitTimes(list, bpm) {
    var out = [];
    list.forEach(function (b) { if (!b.r) out.push(b.s / BEAT * 60 / bpm); });
    return out;
  }

  function schedule() {
    var ctx = player.ctx;
    while (player.on && player.endAt === null && player.next < ctx.currentTime + 0.2) {
      var beat = 60 / prefs.bpm, start = player.next, k;
      if (player.stage === 'count') {
        for (k = 0; k < 4; k++) metClick(start + k * beat, k === 0);
        player.bars.push({ start: start, len: 4 * beat, count: true });
        player.stage = 'music';
      } else {
        if (prefs.met) for (k = 0; k < 4; k++) metClick(start + k * beat, k === 0);
        hitTimes(boxes, prefs.bpm).forEach(function (t) { drumHit(start + t); });
        player.bars.push({ start: start, len: 4 * beat, count: false });
        if (!prefs.loop) player.endAt = start + 4 * beat;
      }
      player.next = start + 4 * beat;
    }
  }

  function showPlayhead(tick) {
    var live = -1;
    Array.prototype.forEach.call($('boxes').children, function (row) {
      var s = Number(row.dataset.s), e = Number(row.dataset.e), head = row.querySelector('.playhead');
      var here = tick !== null && tick >= s && tick < e;
      head.hidden = !here;
      if (here) head.style.left = ((tick - s) / (e - s) * 100) + '%';
    });
    if (tick !== null) boxes.forEach(function (b, i) { if (tick >= b.s && tick < b.s + b.d) live = i; });
    Array.prototype.forEach.call(document.querySelectorAll('.box, .zone'), function (n) {
      n.classList.toggle('is-live', Number(n.dataset.i) === live);
    });
  }

  function frame() {
    if (!player.on) return;
    var ctx = player.ctx, now = ctx.currentTime - (ctx.outputLatency || 0);
    if (player.endAt !== null && ctx.currentTime >= player.endAt + 0.05) { stop(); return; }
    while (player.bars.length > 1 && player.bars[1].start <= now) player.bars.shift();
    var bar = player.bars[0];
    if (bar && now >= bar.start && now < bar.start + bar.len) {
      var pos = (now - bar.start) / bar.len;
      if (bar.count) { showPlayhead(null); $('play-label').textContent = 'Count ' + (Math.floor(pos * 4) + 1); }
      else { showPlayhead(pos * BAR); $('play-label').textContent = 'Stop'; }
    }
    player.raf = requestAnimationFrame(frame);
  }

  function play() {
    var ctx = audioContext();
    if (!ctx) { cue('This browser cannot play audio.'); return; }
    player.master = ctx.createGain();
    player.master.connect(ctx.destination);
    player.on = true;
    player.bars = [];
    player.endAt = null;
    player.stage = prefs.countIn ? 'count' : 'music';
    player.next = ctx.currentTime + 0.12;
    schedule();
    player.timer = setInterval(schedule, 25);
    player.raf = requestAnimationFrame(frame);
    $('play').setAttribute('aria-pressed', 'true');
    $('play-label').textContent = 'Stop';
    $('play-icon').setAttribute('d', 'M6 5h12v14H6z');
    if (/iPhone|iPad|iPod/.test(navigator.userAgent) && !play.told) { play.told = true; cue('No sound? Check that the silent switch is off and the volume is up.'); }
  }
  function stop() {
    if (!player.on) return;
    player.on = false;
    clearInterval(player.timer);
    cancelAnimationFrame(player.raf);
    try {
      player.master.gain.setValueAtTime(0, player.ctx.currentTime);
      player.master.disconnect();
    } catch (e) { /* already gone */ }
    showPlayhead(null);
    $('play').setAttribute('aria-pressed', 'false');
    $('play-label').textContent = 'Play';
    $('play-icon').setAttribute('d', 'M7 4.5v15l12.5-7.5z');
  }

  $('play').addEventListener('click', function () { if (player.on) stop(); else play(); });
  $('tempo').addEventListener('input', function () {
    prefs.bpm = Number(this.value);
    $('tempo-value').textContent = prefs.bpm;
    store();
  });
  [['opt-met', 'met'], ['opt-loop', 'loop'], ['opt-countin', 'countIn']].forEach(function (pair) {
    $(pair[0]).checked = !!prefs[pair[1]];
    $(pair[0]).addEventListener('change', function () {
      prefs[pair[1]] = this.checked;
      if (pair[1] === 'loop' && this.checked && player.on && player.endAt !== null) {
        player.endAt = null;                     // keep going from the bar that was about to be the last
        player.next = Math.max(player.next, player.ctx.currentTime + 0.05);
      }
      store();
    });
  });
  $('tempo').value = prefs.bpm;
  $('tempo-value').textContent = prefs.bpm;
  document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); });

  /* ---------- start ---------- */

  if (window.ResizeObserver) {
    var lastWide = null;
    new ResizeObserver(function () {
      var wide = $('boxes').clientWidth >= 560;
      if (wide !== lastWide) { lastWide = wide; renderBoxes(); }
      $('scroll-hint').hidden = $('sheet').scrollWidth <= $('sheet').clientWidth + 1;
    }).observe($('boxes'));
  }

  // For tests and the browser console.
  window.BoxSandbox = {
    cut: cut, fuse: fuse, toggleRest: toggleRest, valid: valid, counts: counts, parse: parse,
    randomBar: randomBar, hitTimes: hitTimes, examples: EXAMPLES,
    get boxes() { return copy(boxes); }
  };

  render();
})();
