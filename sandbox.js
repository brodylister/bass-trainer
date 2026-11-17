/* Rhythm Sandbox (the box-cooldown view)
   One bar of 4/4 shown two ways that always match: engraved music (VexFlow, Bravura) and a row of boxes.
   Each box is as wide as its note lasts. A note box has a green line where it is struck and a red
   "cooldown" for the wait until the next thing on the page. A rest box has no green line.

   The bar itself (cutting, fusing, counting) lives in rhythm-model.js and the engraving in
   split-core.js, both shared with the other modules. */
(function () {
  'use strict';

  var VF = Vex.Flow;
  var $ = function (id) { return document.getElementById(id); };

  // The model (cutting, fusing, counting) lives in rhythm-model.js, shared with the Split Sandbox.
  var M = RhythmModel, S = SplitCore;
  var BEAT = M.BEAT, BAR = M.BAR;
  var copy = M.copy, cut = M.cut, fuse = M.fuse, toggleRest = M.toggleRest, valid = M.valid;
  var countName = M.countName, counts = M.counts, parse = M.parse;
  var MASKS = M.MASKS, weighted = M.weighted, beatBoxes = M.beatBoxes;

  /* ---------- examples and random bars ---------- */

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

  function randomBar() {
    for (var tries = 0; tries < 50; tries++) {
      var out = [], hits = 0;
      for (var beat = 0; beat < 4; beat++) {
        // Fivelets and sevenlets join in once "More complicated rhythms" is on.
        var grid = weighted([['s', 6], ['t', 3], ['x', 1]].concat(menu.opts.complex ? [['5', 1], ['7', 1]] : []));
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
      var kept = M.upgrade(saved.boxes);          // bars saved before nested tuplets used a coarser grid
      if (valid(kept)) { boxes = copy(kept); example = saved.example; }
      Object.keys(prefs).forEach(function (k) { if (k in (saved.prefs || {})) prefs[k] = saved.prefs[k]; });
    }
  } catch (e) { /* storage unavailable: start from the first example */ }
  function store() {
    try { localStorage.setItem('bcs-state', JSON.stringify({ boxes: boxes, example: example, prefs: prefs })); } catch (e) { /* ignore */ }
  }

  var popAt = null;
  function commit(result, keepExample) {
    if (result.msg) { cue(result.msg, result.need); return false; }
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

  // A message under the boxes. One that an option would lift comes with a button to that option.
  var cueTimer = null;
  function cue(msg, need) { cueTimer = S.cue($('cue'), 'cue', msg, need && menu.prompt, cueTimer); }

  /* ---------- engraving: snare style, every note on one space ---------- */

  var geom = { W: 380, centers: [] };

  function engrave() {
    var g = S.engraveBar($('staff'), boxes, { snare: true, zones: true, label: 'One bar of music in 4/4: ' + describeBar() });
    var svg = $('staff').querySelector('svg');
    svg.style.minWidth = Math.round(g.W * 0.92) + 'px';   // dense bars keep their size and scroll sideways
    geom = g;
    var sheet = $('sheet');
    $('scroll-hint').hidden = sheet.scrollWidth <= sheet.clientWidth + 1;
  }

  function describe(b) {
    return M.valueName(b) + (b.r ? ' rest' : ' note') + ' on ' + spoken(countName(boxes, b.s), b.s);
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

  var MIN_BOX = 22;       // the narrowest a box may get, in pixels, so it can still be tapped

  function renderBoxes() {
    var host = $('boxes'), focus = document.activeElement && document.activeElement.classList.contains('box')
      ? Number(document.activeElement.dataset.i) : null;
    var wide = host.clientWidth, scrolled = false;
    rows = wide < 560 ? [[0, BAR / 2], [BAR / 2, BAR]] : [[0, BAR]];   // narrow screens: two beats per row
    host.innerHTML = '';
    rows.forEach(function (r) {
      var row = el('row', host), span = r[1] - r[0];
      var pct = function (tick) { return ((tick - r[0]) / span * 100) + '%'; };
      var clip = function (s, d) { return [Math.max(s, r[0]), Math.min(s + d, r[1])]; };
      row.dataset.s = r[0]; row.dataset.e = r[1];
      // A row with very short notes grows wider than the screen and scrolls, so every box stays big enough to tap.
      var smallest = span;
      boxes.forEach(function (b) { var c = clip(b.s, b.d); if (c[1] > c[0]) smallest = Math.min(smallest, b.d); });
      var need = Math.ceil(MIN_BOX * span / smallest);
      if (need > wide) { row.style.width = need + 'px'; scrolled = true; }

      for (var beat = r[0] / BEAT; beat < r[1] / BEAT; beat++) {
        var bg = el('beat', row);
        bg.style.left = pct(beat * BEAT); bg.style.width = (BEAT / span * 100) + '%';
        bg.appendChild(document.createElement('b')).textContent = beat + 1;
      }
      // One shade per tuplet; a nested tuplet lies over its parent's shade and so reads darker.
      var seen = {};
      boxes.forEach(function (b) {
        b.g.forEach(function (t, depth) {
          var chain = b.g.slice(0, depth + 1), key = chain.map(function (x) { return x.join(':'); }).join('/');
          var c = clip(t[0], t[1]);
          if (seen[key] || c[1] <= c[0]) return;
          seen[key] = true;
          var shade = el('tup' + (depth ? ' tup-in' : ''), row);
          shade.style.left = pct(c[0]); shade.style.width = ((c[1] - c[0]) / span * 100) + '%';
          if (depth) shade.style.top = (18 + Math.min(depth, 3) * 3) + 'px';
          if (c[0] === t[0]) {
            var tag = shade.appendChild(document.createElement('b'));
            tag.textContent = M.shown(boxes, chain);
            if (!depth && t[1] > BEAT) tag.style.left = (BEAT / 2 / (c[1] - c[0]) * 100) + '%';   // clear of the next beat's number
          }
        });
      });
      boxes.forEach(function (b, i) {
        var c = clip(b.s, b.d), s = c[0], e = c[1];
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
    host.classList.toggle('is-wide', scrolled);
    $('boxes-hint').hidden = !scrolled;
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
      var line = chip.appendChild(document.createElement('span'));
      if (c.state === 'play') S.countLabels(line, c.parts);
      else line.textContent = c.state === 'hold' ? 'hold' : 'rest';
      if (c.state === 'play') said.push(c.names.join(' '));
    });
    $('count-text').textContent = said.length ? 'Play on ' + said.join(', ') + '.' : 'Nothing is played in this bar.';
  }

  var TOOL_HINTS = {
    cut2: 'Tap a box or a note to cut it in half.',
    cut3: 'Tap a box or a note to cut it in 3.',
    toggle: 'Tap a box or a note to switch it between a note and a rest.'
  };
  function cutBy() { return tool === 'cut3' ? 3 : tool === 'cutn' ? menu.n : 2; }
  function renderControls() {
    ['cut2', 'cut3', 'cutn', 'toggle'].forEach(function (t) { $('tool-' + t).setAttribute('aria-pressed', tool === t ? 'true' : 'false'); });
    $('tool-hint').textContent = (TOOL_HINTS[tool] || 'Tap a box or a note to cut it in ' + menu.n + '.') + ' Hold the line between two boxes to fuse them.';
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
    best.rc = best.row.getBoundingClientRect();
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
    else commit(cut(boxes, i, cutBy(), menu.opts));
  }
  function fuseCut(cutAt) {
    if (cutAt === null) { cue('Hold on the line between two boxes to fuse them.'); return; }
    if (commit(fuse(boxes, cutAt, menu.opts)) && navigator.vibrate) { try { navigator.vibrate(12); } catch (e) { /* ignore */ } }
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
  // The third scissors and the two rhythm options, shared with the Split Sandbox.
  var menu = S.cutMenu({
    tool: function () { return tool; },
    select: function (t) { tool = t; cue(''); renderControls(); },
    changed: function () { cue(''); renderControls(); }
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
      var wide = $('boxes').clientWidth;
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
