/* Split Sandbox
   Write a bass split straight onto the staff and hear it on five bass drums.
   The bottom tools (cut in 2, cut in 3, the extra cuts the options switch on, note or rest) are the
   Rhythm Sandbox's, through the same rhythm-model.js, plus flam and accent. The top tools choose which drum a tapped note is written on.
   The music sits on a board that can be dragged in any direction; the tools float over it. */
(function () {
  'use strict';

  var M = RhythmModel, S = SplitCore;
  var $ = function (id) { return document.getElementById(id); };
  var BEAT = M.BEAT, BAR = M.BAR, MAX_BARS = 4, ZOOMS = [0.8, 1, 1.25, 1.6, 2];

  // "q8" style text for the starting bar: value, then the drums (u = unison).
  function starter() {
    var bar = M.parse('16 16 16 16 8 8 [8 8 8] q');
    [[1], [2], [3], [4], [5], [4], [3], [2], [1], [1, 2, 3, 4, 5]].forEach(function (d, i) { bar[i].drums = d; });
    return [bar];
  }
  function emptyBar() {
    return M.parse('q q q q').map(function (b) { b.drums = [3]; return b; });
  }

  /* ---------- state, history, storage ---------- */

  var bars = starter();
  var tool = 'cut2', past = [], future = [];
  var prefs = { bpm: 96, met: true, loop: true, countIn: false, zoom: 2 };

  function copyBars(list) { return list.map(function (b) { return M.copy(b); }); }
  function okBox(b) {
    return b.r || !b.drums || (Array.isArray(b.drums) && b.drums.length >= 1 && b.drums.every(function (d) { return d >= 1 && d <= 5 && d === Math.floor(d); }));
  }
  try {
    var saved = JSON.parse(localStorage.getItem('ssb-state') || 'null');
    if (saved) {
      var kept = Array.isArray(saved.bars) ? saved.bars.map(M.upgrade) : [];   // bars saved before nested tuplets used a coarser grid
      if (kept.length >= 1 && kept.length <= MAX_BARS &&
          kept.every(function (b) { return Array.isArray(b) && M.valid(b) && b.every(okBox); })) bars = copyBars(kept);
      Object.keys(prefs).forEach(function (k) { if (k in (saved.prefs || {})) prefs[k] = saved.prefs[k]; });
      if (!ZOOMS[prefs.zoom]) prefs.zoom = 2;
    }
  } catch (e) { /* storage unavailable: start from the example */ }
  function store() {
    try { localStorage.setItem('ssb-state', JSON.stringify({ bars: bars, prefs: prefs })); } catch (e) { /* ignore */ }
  }

  function commit(next) {
    past.push(bars);
    if (past.length > 200) past.shift();
    future = [];
    bars = next;
    cue('');
    render();
  }
  // Apply a model result ({ boxes } or { msg }) to bar n.
  function commitBar(n, result) {
    if (result.msg) { cue(result.msg, result.need); return false; }
    var next = bars.slice();
    next[n] = result.boxes;
    commit(next);
    return true;
  }
  function undo() { if (!past.length) return; future.push(bars); bars = past.pop(); cue(''); render(); }
  function redo() { if (!future.length) return; past.push(bars); bars = future.pop(); cue(''); render(); }

  var cueTimer = null;
  function cue(msg, need) { cueTimer = S.cue($('cue'), 'cue board-cue', msg, need && menu.prompt, cueTimer); }

  /* ---------- drawing ---------- */

  var geom = [];
  function render() {
    var sys = $('system'), z = ZOOMS[prefs.zoom];
    sys.innerHTML = '';
    geom = bars.map(function (boxes, n) {
      var host = document.createElement('div');
      host.className = 'bar';
      host.dataset.bar = n;
      sys.appendChild(host);
      var g = S.engraveBar(host, boxes, {
        clef: n === 0, open: n > 0, joined: n < bars.length - 1, last: n === bars.length - 1, zones: true,
        label: 'Bar ' + (n + 1) + '. ' + boxes.map(function (b) { return S.describeBox(boxes, b); }).join('; ')
      });
      host.style.width = Math.round(g.W * z) + 'px';
      host.querySelector('svg').style.maxWidth = 'none';
      Array.prototype.forEach.call(host.querySelectorAll('.zone'), function (zone, i) {
        zone.setAttribute('tabindex', '0');
        zone.setAttribute('role', 'button');
        zone.setAttribute('aria-label', 'Bar ' + (n + 1) + ', ' + S.describeBox(boxes, boxes[i]));
      });
      return g;
    });
    renderControls();
    store();
  }

  var TOOL_HINTS = {
    cut2: 'Tap a note to cut it in half.',
    cut3: 'Tap a note to cut it in 3.',
    toggle: 'Tap to switch between a note and a rest.',
    flam: 'Tap a note to add or remove a flam.',
    accent: 'Tap a note to add or remove an accent.',
    d1: 'Tap a note to write it on bass 1.', d2: 'Tap a note to write it on bass 2.', d3: 'Tap a note to write it on bass 3.',
    d4: 'Tap a note to write it on bass 4.', d5: 'Tap a note to write it on bass 5.', du: 'Tap a note to make it a unison.'
  };
  function renderControls() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-tool]'), function (btn) {
      btn.setAttribute('aria-pressed', btn.dataset.tool === tool ? 'true' : 'false');
    });
    $('tool-hint').textContent = (TOOL_HINTS[tool] || 'Tap a note to cut it in ' + menu.n + '.') + ' Hold between two notes to fuse them.';
    $('undo').disabled = !past.length;
    $('redo').disabled = !future.length;
    $('bars-value').textContent = bars.length;
    $('bars-less').disabled = bars.length <= 1;
    $('bars-more').disabled = bars.length >= MAX_BARS;
    $('zoom-out').disabled = prefs.zoom <= 0;
    $('zoom-in').disabled = prefs.zoom >= ZOOMS.length - 1;
  }

  /* ---------- touch: tap a note to use the tool, hold between two notes to fuse ---------- */

  var HOLD_MS = 450;

  function locate(e) {
    var host = e.target.closest ? e.target.closest('.bar') : null;
    if (!host) return null;
    var n = Number(host.dataset.bar), g = geom[n], svg = host.querySelector('svg');
    if (!g || !svg) return null;
    var rc = svg.getBoundingClientRect(), x = (e.clientX - rc.left) / (rc.width / g.W), c = g.centers;
    var mid = function (i) { return (c[i - 1] + c[i]) / 2; };
    var i = 0;
    while (i < c.length - 1 && x >= mid(i + 1)) i++;
    var cutAt = null, dist = Infinity;
    for (var k = 1; k < c.length; k++) {
      var dk = Math.abs(x - mid(k));
      if (dk < dist) { dist = dk; cutAt = k - 1; }
    }
    return { bar: n, i: i, cut: cutAt };
  }

  var press = null, lastPointer = 'mouse';

  function mark(at) {
    Array.prototype.forEach.call(document.querySelectorAll('.zone.is-active'), function (z) { z.classList.remove('is-active'); });
    if (!at) return;
    var z = document.querySelector('.bar[data-bar="' + at.bar + '"] .zone[data-i="' + at.i + '"]');
    if (z) z.classList.add('is-active');
  }

  // Hear one stroke straight away, so writing a note sounds like playing it.
  function audition(b) { S.preview(b); }

  function useTool(at) {
    var list = bars[at.bar], b = list[at.i], out;
    if (tool.slice(0, 3) === 'cut') { commitBar(at.bar, M.cut(list, at.i, tool === 'cut3' ? 3 : tool === 'cutn' ? menu.n : 2, menu.opts)); return; }
    if (tool === 'toggle') {
      out = M.toggleRest(list, at.i);
      if (!out.boxes[at.i].r && !out.boxes[at.i].drums) out.boxes[at.i].drums = [3];
      commitBar(at.bar, out);
      audition(out.boxes[at.i]);
      return;
    }
    if (tool === 'flam' || tool === 'accent') {
      if (b.r) { cue('A rest cannot take ' + (tool === 'flam' ? 'a flam' : 'an accent') + '. Switch it to a note first.'); return; }
      out = M.copy(list);
      if (out[at.i][tool]) delete out[at.i][tool]; else out[at.i][tool] = true;
      commitBar(at.bar, { boxes: out });
      audition(out[at.i]);
      return;
    }
    // A drum tool: write this note on that drum. A rest becomes a note.
    var drums = tool === 'du' ? [1, 2, 3, 4, 5] : [Number(tool.slice(1))];
    if (!b.r && (b.drums || [3]).join() === drums.join()) { audition(b); return; }
    out = M.copy(list);
    out[at.i].r = false;
    out[at.i].drums = drums;
    commitBar(at.bar, { boxes: out });
    audition(out[at.i]);
  }
  function fuseCut(at) {
    if (!at || at.cut === null) { cue('Hold between two notes in the same bar to fuse them.'); return; }
    if (commitBar(at.bar, M.fuse(bars[at.bar], at.cut, menu.opts)) && navigator.vibrate) { try { navigator.vibrate(12); } catch (e) { /* ignore */ } }
  }
  function endPress() {
    if (!press) return;
    clearTimeout(press.timer);
    press = null;
    mark(null);
  }

  var board = $('board');
  board.addEventListener('pointerdown', function (e) {
    lastPointer = e.pointerType || 'mouse';
    if (e.button !== 0) return;
    var at = locate(e);
    if (!at) return;
    endPress();
    press = { x: e.clientX, y: e.clientY, at: at, held: false };
    mark(at);
    press.timer = setTimeout(function () {
      if (!press) return;
      press.held = true;
      mark(null);
      fuseCut(at);
    }, HOLD_MS);
  });
  board.addEventListener('contextmenu', function (e) {
    var at = locate(e);
    if (!at) return;
    e.preventDefault();
    if (lastPointer === 'mouse') fuseCut(at);      // on touch the hold timer has already done the work
  });
  window.addEventListener('pointermove', function (e) {
    if (press && Math.abs(e.clientX - press.x) + Math.abs(e.clientY - press.y) > 10) endPress();
  });
  window.addEventListener('pointerup', function () {
    if (!press) return;
    var p = press;
    endPress();
    if (!p.held) useTool(p.at);
  });
  window.addEventListener('pointercancel', endPress);
  board.addEventListener('scroll', endPress, { passive: true });

  // Keyboard: Enter or Space uses the tool on the focused note; Backspace and Delete fuse; arrows move.
  board.addEventListener('keydown', function (e) {
    var zone = e.target.closest ? e.target.closest('.zone') : null;
    if (!zone) return;
    var n = Number(zone.closest('.bar').dataset.bar), i = Number(zone.dataset.i);
    function refocus(bar, idx) {
      var z = document.querySelector('.bar[data-bar="' + bar + '"] .zone[data-i="' + Math.max(0, Math.min(idx, bars[bar].length - 1)) + '"]');
      if (z) z.focus();
    }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); useTool({ bar: n, i: i }); refocus(n, i); }
    else if (e.key === 'Backspace' && i > 0) { e.preventDefault(); fuseCut({ bar: n, cut: i - 1 }); refocus(n, i - 1); }
    else if (e.key === 'Delete' && i < bars[n].length - 1) { e.preventDefault(); fuseCut({ bar: n, cut: i }); refocus(n, i); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      var to = i + (e.key === 'ArrowRight' ? 1 : -1);
      if (to < 0 && n > 0) refocus(n - 1, bars[n - 1].length - 1);
      else if (to >= bars[n].length && n < bars.length - 1) refocus(n + 1, 0);
      else refocus(n, to);
    }
  });
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey || (e.target.tagName === 'INPUT')) return;
    var k = e.key.toLowerCase();
    if (k >= '1' && k <= '5') { tool = 'd' + k; renderControls(); }
    else if (k === 'u') { tool = 'du'; renderControls(); }
  });

  /* ---------- tools and board controls ---------- */

  Array.prototype.forEach.call(document.querySelectorAll('[data-tool]'), function (btn) {
    if (btn.dataset.tool === 'cutn') return;       // the third scissors is wired up by the shared cut menu
    btn.addEventListener('click', function () { tool = btn.dataset.tool; cue(''); renderControls(); });
  });
  var menu = S.cutMenu({
    tool: function () { return tool; },
    select: function (t) { tool = t; cue(''); renderControls(); },
    changed: function () { cue(''); renderControls(); }
  });
  $('undo').addEventListener('click', undo);
  $('redo').addEventListener('click', redo);
  $('bars-more').addEventListener('click', function () {
    if (bars.length < MAX_BARS) commit(bars.concat([emptyBar()]));
  });
  $('bars-less').addEventListener('click', function () {
    if (bars.length > 1) commit(bars.slice(0, -1));
  });
  $('zoom-in').addEventListener('click', function () { prefs.zoom = Math.min(ZOOMS.length - 1, prefs.zoom + 1); render(); });
  $('zoom-out').addEventListener('click', function () { prefs.zoom = Math.max(0, prefs.zoom - 1); render(); });
  $('clear').addEventListener('click', function () { commit(bars.map(emptyBar)); });

  // The note-or-rest tool shows a quarter note and a quarter rest, drawn with the same music font as the sheet.
  (function drawIcons() {
    var VF = Vex.Flow, host = $('noterest-icon');
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

  /* ---------- playback ---------- */

  function showLive(pos) {
    var bar = -1, idx = -1;
    if (pos !== null) {
      bar = Math.min(bars.length - 1, Math.floor(pos / 4));
      var tick = (pos - bar * 4) * BEAT;
      bars[bar].forEach(function (b, i) { if (tick >= b.s && tick < b.s + b.d) idx = i; });
    }
    Array.prototype.forEach.call(document.querySelectorAll('.zone'), function (z) {
      z.classList.toggle('is-live', Number(z.closest('.bar').dataset.bar) === bar && Number(z.dataset.i) === idx);
    });
  }
  var player = S.player({
    onFrame: function (pos, counting) {
      showLive(pos);
      $('play-label').textContent = counting ? 'Count ' + counting : 'Stop';
    },
    onState: function (on) {
      $('play').setAttribute('aria-pressed', on ? 'true' : 'false');
      $('play-label').textContent = on ? 'Stop' : 'Play';
      $('play-icon').setAttribute('d', on ? 'M6 5h12v14H6z' : 'M7 4.5v15l12.5-7.5z');
    },
    onCue: cue
  });
  $('play').addEventListener('click', function () {
    if (player.playing) { player.stop(); return; }
    player.play({
      seq: function () { return S.passage(bars.map(function (b) { return { boxes: b, len: BAR }; })); },
      bpm: function () { return prefs.bpm; },
      met: function () { return prefs.met; },
      loop: function () { return prefs.loop; },
      countIn: prefs.countIn
    });
  });
  $('tempo').addEventListener('input', function () {
    prefs.bpm = Number(this.value);
    $('tempo-value').textContent = prefs.bpm;
    store();
  });
  [['opt-met', 'met'], ['opt-loop', 'loop'], ['opt-countin', 'countIn']].forEach(function (pair) {
    $(pair[0]).checked = !!prefs[pair[1]];
    $(pair[0]).addEventListener('change', function () {
      prefs[pair[1]] = this.checked;
      if (pair[1] === 'loop' && this.checked) player.keepGoing();
      store();
    });
  });
  $('tempo').value = prefs.bpm;
  $('tempo-value').textContent = prefs.bpm;

  // For tests and the browser console.
  window.SplitSandbox = {
    get bars() { return copyBars(bars); },
    set tool(t) { tool = t; renderControls(); },
    use: function (bar, i) { useTool({ bar: bar, i: i }); },
    fuse: function (bar, cutAt) { fuseCut({ bar: bar, cut: cutAt }); }
  };

  render();
  // Start with the music a little in from the corner, so it is clear the board goes on in every direction.
  board.scrollLeft = 0;
  board.scrollTop = Math.max(0, ($('canvas').offsetHeight - board.clientHeight) / 2 - 20);
})();
