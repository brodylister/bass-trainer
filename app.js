/* Bass Split Trainer — sheet music trainer
   Generates one bar of 5-bass split music, engraves it with VexFlow (Bravura),
   and asks which counts/partials one drum plays. */
(function () {
  'use strict';

  var VF = Vex.Flow;
  var $ = function (id) { return document.getElementById(id); };

  // Staff positions, bass 1 (highest) to bass 5 (lowest): the four spaces plus below the staff.
  var KEYS = ['e/5', 'c/5', 'a/4', 'f/4', 'd/4'];

  var GRIDS = {
    s: { slots: 4, span: 3, labels: function (b) { return [String(b), 'e', '+', 'a']; } },
    t: { slots: 3, span: 4, labels: function (b) { return [String(b), 'pul', 'let']; } },
    x: { slots: 6, span: 2, labels: function (b) { return [String(b), 'pul', 'let', '+', 'pul', 'let']; } }
  };

  // Rhythm figures per beat, weighted toward what shows up in real bass books.
  var MASKS = {
    s: [['1111', 10], ['1011', 5], ['1101', 5], ['1110', 5], ['0111', 4], ['1010', 6], ['1001', 3],
        ['1000', 4], ['0010', 3], ['0011', 3], ['1100', 3], ['0101', 2], ['0110', 2], ['0001', 2],
        ['0100', 1], ['0000', 2]],
    t: [['111', 10], ['101', 4], ['110', 3], ['011', 3], ['001', 2], ['010', 1]],
    x: [['111111', 10], ['011111', 2], ['111110', 2], ['110110', 1], ['101101', 1], ['110111', 1], ['111011', 1]]
  };
  // Level 1 keeps to the figures a first-year player sees.
  var EASY_MASKS = {
    s: [['1111', 10], ['1010', 8], ['1000', 6], ['1011', 5], ['1110', 5], ['0010', 3], ['0000', 2]],
    t: [['111', 1]],
    x: [['111111', 1]]
  };
  var FULL_SIX = [['111111', 1]];

  // From level 3 up, these figures are written either with a longer note or with a rest inside the beat.
  var ALT = {
    s1001: ['n8', 'r16', 'n16'],
    s0101: ['r16', 'n16', 'r16', 'n16'],
    t101: ['n8', 'r8', 'n8']
  };

  /* How one beat is written, as a list of tokens: 'n16' is a note, 'r8d' a rest.
     Level 1-2: notes ring to the next note, rests take the largest value, and "1 pul" is two eighths and a rest.
     Level 3:   the ALT figures are sometimes written with an inner rest.
     Level 4:   any beat may be written with short notes and rests, and long rests may be broken down. */
  function notate(grid, slots, level) {
    var n = slots.length, mask = '', onsets = 0, first = -1, i;
    for (i = 0; i < n; i++) {
      mask += slots[i] ? '1' : '0';
      if (slots[i]) { onsets++; if (first === -1) first = i; }
    }
    if (!onsets) return ['rq'];
    var key = grid + mask;
    if (key === 't110') return ['n8', 'n8', 'r8'];
    if (level >= 3 && ALT[key] && Math.random() < 0.5) return ALT[key];

    var out = [];
    var broken = level === 4 && Math.random() < 0.35;
    if (grid === 't') {
      if (first === 2) out = broken ? ['r8', 'r8'] : ['rq'];
      else if (first === 1) out = ['r8'];
    } else {
      if (first === 3) out = broken ? ['r8', 'r16'] : ['r8d'];
      else if (first === 2) out = ['r8'];
      else if (first === 1) out = ['r16'];
    }
    var short = level === 4 && onsets >= 2 && onsets < n - first && Math.random() < 0.5;
    for (i = first; i < n; i++) {
      if (!slots[i]) continue;
      var j = i + 1;
      while (j < n && !slots[j]) j++;
      var gap = j - i;
      if (short && gap > 1) {
        out.push(grid === 't' ? 'n8' : 'n16');
        for (var p = i + 1; p < j; p++) {
          if (grid === 't') out.push('r8');
          else if (p % 2 === 0 && p + 1 < j) { out.push('r8'); p++; }
          else out.push('r16');
        }
      } else if (grid === 't') {
        out.push(gap === 1 ? 'n8' : 'nq');
      } else {
        out.push(gap === 1 ? 'n16' : gap === 2 ? 'n8' : gap === 3 ? 'n8d' : 'nq');
      }
    }
    return out;
  }

  /* ---------- settings and stats (kept in this browser only) ---------- */

  var DEFAULTS = { drum: 'random', s: true, t: true, x: false, unisons: true, highlight: false, timer: true, level: 2 };
  var settings = load('bst-settings', DEFAULTS);
  var record = load('bst-record', { bestStreak: 0, bestTime: null });
  var session = { right: 0, total: 0, streak: 0 };

  function load(key, fallback) {
    var out = {};
    Object.keys(fallback).forEach(function (k) { out[k] = fallback[k]; });
    try {
      var saved = JSON.parse(localStorage.getItem(key) || '{}');
      Object.keys(fallback).forEach(function (k) { if (k in saved) out[k] = saved[k]; });
    } catch (e) { /* storage unavailable: defaults are fine */ }
    return out;
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignore */ }
  }

  /* ---------- generator ---------- */

  function rnd(n) { return Math.floor(Math.random() * n); }
  function weighted(pairs) {
    var total = 0, i;
    for (i = 0; i < pairs.length; i++) total += pairs[i][1];
    var r = Math.random() * total;
    for (i = 0; i < pairs.length; i++) { r -= pairs[i][1]; if (r < 0) return pairs[i][0]; }
    return pairs[pairs.length - 1][0];
  }

  function generateBar() {
    var grids = [];
    if (settings.s) grids.push(['s', 6]);
    if (settings.t) grids.push(['t', 3]);
    if (settings.x) grids.push(['x', 2]);
    if (!grids.length) grids.push(['s', 1]);

    var level = Number(settings.level) || 2;
    // How the line moves through the drums for this bar.
    var per = weighted(level === 1 ? [[1, 5], [2, 4]]
      : level === 4 ? [[1, 4], [2, 3], [3, 1], [4, 1], [0, 5]]
      : [[1, 5], [2, 4], [3, 1], [4, 1], [0, 2]]);             // notes per drum; 0 = scattered
    var dir = Math.random() < 0.6 ? 1 : -1;                    // 1 = down the line (1 to 5)
    var bounce = level > 1 && Math.random() < 0.4;
    var cur = Math.random() < 0.6 ? (dir === 1 ? 0 : 4) : rnd(5);
    var count = 0;
    var unisonRate = settings.unisons ? weighted([[0, 3], [0.1, 4], [0.2, 2]]) * (level === 4 ? 1.5 : 1) : 0;
    var stackRate = !settings.unisons || level === 1 ? 0 : level === 4 ? 0.1 : 0.06;

    function nextDrum() {
      if (per === 0) {
        var d = rnd(5);
        if (d === cur) d = (d + 1 + rnd(4)) % 5;
        cur = d;
        return cur;
      }
      if (count >= per) {
        count = 0;
        var n = cur + dir;
        if (n > 4 || n < 0) {
          if (bounce) { dir = -dir; n = cur + dir; }
          else n = (n + 5) % 5;
        }
        cur = n;
      }
      count++;
      return cur;
    }

    var beats = [];
    for (var b = 0; b < 4; b++) {
      var grid = weighted(grids);
      var table = level === 1 ? EASY_MASKS[grid] : (grid === 'x' && level === 2) ? FULL_SIX : MASKS[grid];
      var mask = weighted(table);
      var slots = [];
      for (var i = 0; i < mask.length; i++) {
        if (mask[i] === '0') { slots.push(null); continue; }
        // Levels 1-2 keep sextuplets clean: unisons only on the downbeat, no stacks.
        var plain = i > 0 && (level === 1 || (level === 2 && grid === 'x'));
        if (!plain && Math.random() < unisonRate * (i === 0 ? 2 : 0.6)) slots.push([0, 1, 2, 3, 4]);
        else if (!plain && !(level === 2 && grid === 'x') && Math.random() < stackRate) {
          // A stack: two (sometimes three) drums on the same note.
          var a = nextDrum(), stack = [a];
          var extra = Math.random() < 0.2 ? 2 : 1;
          while (stack.length < 1 + extra) { var o = rnd(5); if (stack.indexOf(o) === -1) stack.push(o); }
          slots.push(stack);
        }
        else slots.push([nextDrum()]);
      }
      // A triplet beat with nothing after the downbeat reads as a plain quarter.
      if (grid === 't' && !slots[1] && !slots[2]) { grid = 's'; slots = [slots[0], null, null, null]; }
      beats.push({ grid: grid, slots: slots, tokens: notate(grid, slots, level) });
    }
    return { beats: beats };
  }

  function drumSlots(bar, drum) {
    var out = [];
    bar.beats.forEach(function (beat, b) {
      beat.slots.forEach(function (s, i) { if (s && s.indexOf(drum) !== -1) out.push(b + '-' + i); });
    });
    return out;
  }
  function onsetCount(bar) {
    var n = 0;
    bar.beats.forEach(function (beat) { beat.slots.forEach(function (s) { if (s) n++; }); });
    return n;
  }

  function newQuestion() {
    for (var tries = 0; tries < 200; tries++) {
      var bar = generateBar();
      if (onsetCount(bar) < 4) continue;
      var playing = [0, 1, 2, 3, 4].filter(function (d) { return drumSlots(bar, d).length > 0; });
      if (playing.length < 3) continue;
      var target;
      if (settings.drum === 'random') target = playing[rnd(playing.length)];
      else { target = Number(settings.drum); if (playing.indexOf(target) === -1) continue; }
      return { bar: bar, target: target, answer: drumSlots(bar, target) };
    }
    // Practically unreachable; fall back to a plain run so the page never stalls.
    var fb = { beats: [0, 1, 2, 3].map(function (b) {
      return { grid: 's', slots: [0, 1, 2, 3].map(function (i) { return [(b * 4 + i) % 5]; }), tokens: ['n16', 'n16', 'n16', 'n16'] };
    }) };
    var t = settings.drum === 'random' ? rnd(5) : Number(settings.drum);
    return { bar: fb, target: t, answer: drumSlots(fb, t) };
  }

  /* ---------- engraving ---------- */

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  // Unison slash: a thin, steep stroke a little taller than two staff spaces, as Sibelius draws it.
  var SLASH = { width: 10, reach: 12, thick: 7, stem: 8 };
  VF.SLASH_NOTEHEAD_WIDTH = SLASH.width;
  function drawSlash() {
    var ctx = this.checkContext();
    this.setRendered();
    var x = this.getAbsoluteX(), y = this.y;
    this.applyStyle(ctx);
    ctx.beginPath();
    ctx.moveTo(x, y + SLASH.reach);
    ctx.lineTo(x, y + SLASH.reach - SLASH.thick);
    ctx.lineTo(x + SLASH.width, y - SLASH.reach);
    ctx.lineTo(x + SLASH.width, y - SLASH.reach + SLASH.thick);
    ctx.closePath();
    ctx.fill();
    this.restoreStyle(ctx);
  }

  function engrave(host, bar, markDrum) {
    host.innerHTML = '';
    var mark = cssVar('--mark') || '#1f4fd8';
    var all = [], beams = [], tuplets = [], rests = [], slashes = [];

    function rest(dur) {
      var r = new VF.StaveNote({ keys: ['b/4'], duration: dur + 'r', clef: 'percussion' });
      if (dur.indexOf('d') !== -1) VF.Dot.buildAndAttach([r], { all: true });
      rests.push(r);
      return r;
    }
    function note(drums, dur) {
      var unison = drums.length === 5;   // all five drums: one slash on the middle line
      var sorted = unison ? [markDrum] : drums.slice().sort(function (a, b) { return b - a; }); // lowest pitch first
      var n = new VF.StaveNote({
        keys: unison ? ['b/4'] : sorted.map(function (d) { return KEYS[d]; }),
        duration: dur, type: unison ? 's' : 'n', clef: 'percussion', stem_direction: 1
      });
      if (dur.indexOf('d') !== -1) VF.Dot.buildAndAttach([n], { all: true });
      if (unison) { n.note_heads[0].draw = drawSlash; slashes.push(n); }
      if (markDrum !== null && markDrum !== undefined) {
        var idx = sorted.indexOf(markDrum);
        if (idx !== -1) {
          if (sorted.length === 1) n.setStyle({ fillStyle: mark, strokeStyle: mark });
          else n.setKeyStyle(idx, { fillStyle: mark, strokeStyle: mark });
        }
      }
      return n;
    }

    bar.beats.forEach(function (beat) {
      var onsets = beat.slots.filter(function (x) { return x; }), k = 0;
      var beatNotes = [], run = [], beamed = 0;
      // Beams never cross a rest; a note left on its own keeps its flag.
      function endRun() {
        if (run.length > 1) {
          var beam = new VF.Beam(run);
          beam.render_options.max_slope = 0.12;   // gentle slopes, as in engraved parts
          beam.render_options.min_slope = -0.12;
          beams.push(beam);
          beamed += run.length;
        }
        run = [];
      }
      beat.tokens.forEach(function (tok) {
        var dur = tok.slice(1);
        if (tok[0] === 'r') { endRun(); beatNotes.push(rest(dur)); return; }
        var sn = note(onsets[k++], dur);
        beatNotes.push(sn);
        if (dur === 'q') endRun(); else run.push(sn);
      });
      endRun();
      if (beat.grid !== 's') {
        tuplets.push(new VF.Tuplet(beatNotes, {
          num_notes: beat.grid === 't' ? 3 : 6,
          notes_occupied: beat.grid === 't' ? 2 : 4,
          ratioed: false,
          bracketed: beamed !== beatNotes.length,
          location: 1
        }));
      }
      all = all.concat(beatNotes);
    });

    var W = Math.max(380, 150 + all.length * 23);
    var H = 150;
    var renderer = new VF.Renderer(host, VF.Renderer.Backends.SVG);
    renderer.resize(W, H);
    var ctx = renderer.getContext();
    var stave = new VF.Stave(8, 34, W - 16);
    stave.addClef('percussion').addTimeSignature('4/4');
    stave.setContext(ctx).draw();

    var voice = new VF.Voice({ num_beats: 4, beat_value: 4 });
    voice.setMode(VF.Voice.Mode.SOFT);
    voice.addTickables(all);
    new VF.Formatter().joinVoices([voice]).formatToStave([voice], stave);
    rests.forEach(function (r) { r.setKeyLine(0, 3); });
    // The stem of a slash starts at the slash's upper corner, not at the middle line.
    slashes.forEach(function (n) { n.getStem().setOptions({ stem_up_y_base_offset: -SLASH.stem }); });   // keep rests on the middle line
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
    var sheet = host.parentNode;
    sheet.scrollLeft = 0;
    $('scroll-hint').hidden = sheet.scrollWidth <= sheet.clientWidth + 1;
    svg.style.height = 'auto';
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'One bar of bass drum music in 4/4');
  }

  /* ---------- interface ---------- */

  var q = null, selected = {}, phase = 'answer', startedAt = 0, ticker = null;

  function buildPad() {
    var pad = $('pad');
    pad.innerHTML = '';
    q.bar.beats.forEach(function (beat, b) {
      var g = GRIDS[beat.grid];
      var row = document.createElement('div');
      row.className = 'pad-row';
      row.setAttribute('role', 'group');
      row.setAttribute('aria-label', 'Beat ' + (b + 1));
      g.labels(b + 1).forEach(function (label, i) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'slot' + (i === 0 ? ' slot-beat' : '');
        btn.style.gridColumn = 'span ' + g.span;
        btn.textContent = label;
        btn.dataset.key = b + '-' + i;
        btn.setAttribute('aria-pressed', 'false');
        btn.setAttribute('aria-label', i === 0 ? 'Beat ' + label : 'Beat ' + (b + 1) + ', ' + label);
        row.appendChild(btn);
      });
      pad.appendChild(row);
    });
  }

  function fmt(ms) { return (ms / 1000).toFixed(1) + ' s'; }

  function renderStats() {
    $('stat-streak').textContent = session.streak;
    $('stat-score').textContent = session.total ? session.right + '/' + session.total : '0/0';
    $('stat-best').textContent = record.bestTime === null ? 'none yet' : fmt(record.bestTime);
    $('stat-beststreak').textContent = record.bestStreak;
    $('timer-wrap').hidden = !settings.timer;
    $('best-wrap').hidden = !settings.timer;
  }

  function startTimer() {
    startedAt = performance.now();
    clearInterval(ticker);
    $('stat-timer').textContent = '0.0 s';
    ticker = setInterval(function () {
      if (phase === 'answer') $('stat-timer').textContent = fmt(performance.now() - startedAt);
    }, 100);
  }

  function next() {
    q = newQuestion();
    selected = {};
    phase = 'answer';
    $('target').textContent = 'Bass ' + (q.target + 1);
    $('feedback').hidden = true;
    $('feedback').className = 'feedback';
    $('action').textContent = 'Check';
    $('action').disabled = true;
    engrave($('staff'), q.bar, settings.highlight ? q.target : null);
    buildPad();
    renderStats();
    startTimer();
  }

  function check() {
    var elapsed = performance.now() - startedAt;
    phase = 'result';
    clearInterval(ticker);
    var answer = {};
    q.answer.forEach(function (k) { answer[k] = true; });
    var correct = q.answer.length === Object.keys(selected).length &&
      q.answer.every(function (k) { return selected[k]; });

    Array.prototype.forEach.call(document.querySelectorAll('.slot'), function (btn) {
      var k = btn.dataset.key;
      btn.disabled = true;
      if (answer[k] && selected[k]) btn.classList.add('is-right');
      else if (answer[k]) btn.classList.add('is-missed');
      else if (selected[k]) btn.classList.add('is-wrong');
    });

    session.total++;
    var fb = $('feedback');
    if (correct) {
      session.right++;
      session.streak++;
      if (session.streak > record.bestStreak) record.bestStreak = session.streak;
      var isBest = settings.timer && (record.bestTime === null || elapsed < record.bestTime);
      if (isBest) record.bestTime = elapsed;
      save('bst-record', record);
      fb.textContent = 'Correct' + (settings.timer ? ' in ' + fmt(elapsed) + (isBest ? ', your fastest yet' : '') : '') + '.';
      fb.classList.add('good');
    } else {
      session.streak = 0;
      var n = q.answer.length;
      fb.textContent = 'Not quite. Bass ' + (q.target + 1) + ' plays ' + n + (n === 1 ? ' note' : ' notes') +
        ', shown in blue on the sheet. Dashed buttons are counts you missed; crossed-out ones belong to another drum.';
      fb.classList.add('bad');
    }
    fb.hidden = false;
    $('stat-timer').textContent = fmt(elapsed);
    engrave($('staff'), q.bar, q.target);
    $('action').textContent = 'Next bar';
    $('action').disabled = false;
    renderStats();
  }

  $('pad').addEventListener('click', function (e) {
    var btn = e.target.closest('.slot');
    if (!btn || phase !== 'answer') return;
    var k = btn.dataset.key;
    if (selected[k]) delete selected[k]; else selected[k] = true;
    btn.classList.toggle('is-on', !!selected[k]);
    btn.setAttribute('aria-pressed', selected[k] ? 'true' : 'false');
    $('action').disabled = Object.keys(selected).length === 0;
  });

  $('action').addEventListener('click', function () { if (phase === 'answer') check(); else next(); });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || $('action').disabled) return;
    if (e.target.closest && e.target.closest('.slot, #options')) return;
    e.preventDefault();
    $('action').click();
  });

  /* ---------- options ---------- */

  var LEVEL_NOTES = {
    1: 'Simple figures. Runs move one way through the drums. Unisons only on the beat.',
    2: 'All figures, no rests inside a beat. Sextuplets are always full.',
    3: 'Some figures are written with a rest inside the beat. Sextuplets can have gaps.',
    4: 'Short notes with rests, broken-up rests, more unisons, stacks and scattered splits.'
  };
  function syncOptions() {
    Array.prototype.forEach.call(document.querySelectorAll('input[name="drum"]'), function (r) {
      r.checked = r.value === String(settings.drum);
    });
    Array.prototype.forEach.call(document.querySelectorAll('input[name="level"]'), function (r) {
      r.checked = Number(r.value) === Number(settings.level);
    });
    $('level-note').textContent = LEVEL_NOTES[settings.level] || '';
    ['s', 't', 'x', 'unisons', 'highlight', 'timer'].forEach(function (k) { $('opt-' + k).checked = !!settings[k]; });
  }

  $('options').addEventListener('change', function (e) {
    var el = e.target;
    if (el.name === 'drum') settings.drum = el.value === 'random' ? 'random' : Number(el.value);
    else if (el.name === 'level') { settings.level = Number(el.value); syncOptions(); }
    else {
      var key = el.id.replace('opt-', '');
      settings[key] = el.checked;
      if (!settings.s && !settings.t && !settings.x) { settings.s = true; syncOptions(); }
    }
    save('bst-settings', settings);
    next();
  });

  window.addEventListener('resize', function () {
    var sheet = $('staff').parentNode;
    $('scroll-hint').hidden = sheet.scrollWidth <= sheet.clientWidth + 1;
  });

  syncOptions();
  next();
})();
