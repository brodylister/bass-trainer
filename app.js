/* Written Split Quiz (was the Bass Split Trainer) — sheet music trainer
   Generates one bar of 5-bass split music and asks which counts/partials one drum plays.
   The bar is built as boxes from rhythm-model.js and drawn by SplitCore.engraveBar, the same
   engraver every module uses. Drums are numbered 0 (bass 1) to 4 (bass 5) in this file. */
(function () {
  'use strict';

  var M = RhythmModel, S = SplitCore;
  var $ = function (id) { return document.getElementById(id); };

  /* The answer buttons of a beat, by grid. Sixteenths "1 e + a", triplets "1 pul let"; sextuplets,
     fivelets and sevenlets are numbered, and a sextuplet's 3, 4 and 5 carry the small hints p, + and l
     (the triplet's pul, the +, the triplet's let). 'e' is a beat in two eighths, used under nested groups. */
  var GRIDS = {
    e: { n: 2, labels: function (b) { return [b, '+']; } },
    s: { n: 4, labels: function (b) { return [b, 'e', '+', 'a']; } },
    t: { n: 3, labels: function (b) { return [b, 'pul', 'let']; } },
    x: { n: 6, labels: function (b) { return [b, '2', '3', '4', '5', '6']; }, hints: ['', '', 'p', '+', 'l', ''] },
    5: { n: 5, labels: function (b) { return [b, '2', '3', '4', '5']; } },
    7: { n: 7, labels: function (b) { return [b, '2', '3', '4', '5', '6', '7']; } }
  };

  // Rhythm figures per beat, weighted toward what shows up in real bass books.
  var MASKS = {
    s: [['1111', 10], ['1011', 5], ['1101', 5], ['1110', 5], ['0111', 4], ['1010', 6], ['1001', 3],
        ['1000', 4], ['0010', 3], ['0011', 3], ['1100', 3], ['0101', 2], ['0110', 2], ['0001', 2],
        ['0100', 1], ['0000', 2]],
    t: [['111', 10], ['101', 4], ['110', 3], ['011', 3], ['001', 2], ['010', 1]],
    x: [['111111', 10], ['011111', 2], ['111110', 2], ['110110', 1], ['101101', 1], ['110111', 1], ['111011', 1]],
    5: M.MASKS[5], 7: M.MASKS[7]
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

  var DEFAULTS = { drum: 'random', s: true, t: true, x: false, five: true, seven: true, complex: false, unisons: true, highlight: false, timer: false, level: 2, v: 2 };
  var settings = load('bst-settings', DEFAULTS);
  // The timer used to be on by default. Turn it off once for browsers that saved the old default.
  try {
    if (!('v' in JSON.parse(localStorage.getItem('bst-settings') || '{"v":2}'))) { settings.timer = false; save('bst-settings', settings); }
  } catch (e) { /* storage unavailable */ }
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

  /* One beat's written form as boxes. Sixteenths, triplets and sextuplets keep the level rules
     of notate(); fivelets, sevenlets and nested groups are written the plain way (notes ring to the
     next note), or at level 4 sometimes with short notes and rests. Drums become 1 to 5. */
  function beatBoxes(beat, start, level) {
    var onsets = beat.slots.filter(function (x) { return x; }), k = 0, boxes;
    if (!beat.tree && (beat.grid === 's' || beat.grid === 't' || beat.grid === 'x')) {
      var text = notate(beat.grid, beat.slots, level).map(function (tok) { return (tok[0] === 'r' ? 'r' : '') + tok.slice(1); }).join(' ');
      boxes = M.parse(beat.grid === 's' ? text : '[' + text + ']');
      boxes.forEach(function (b) {
        b.s += start;
        b.g.forEach(function (t) { t[0] += start; });
        if (!b.r) b.drums = (onsets[k++] || [0]).map(function (d) { return d + 1; });
      });
      return boxes;
    }
    var fill = function (node) {
      return { n: node.n, kids: node.kids.map(function (kid) {
        if (kid && kid.kids) return fill(kid);
        var drums = beat.slots[k++];
        return drums ? drums.map(function (d) { return d + 1; }) : null;
      }) };
    };
    var tree = fill(beat.tree || { n: GRIDS[beat.grid].n, kids: beat.slots.map(function () { return 0; }) });
    return M.treeBoxes(tree, start, M.BEAT, level === 4 && Math.random() < 0.3 ? 'short' : 'ring');
  }

  /* A beat with a group of 2, 3 or 4 nested in one of its counts, and sometimes a second group
     nested in the first: two layers at most, never a 5 or a 7. Only with "More complicated
     rhythms" at level 4. Returns { grid, tree } where every leaf is 0 (to be filled with a note). */
  function nestedShape(grids) {
    var base = weighted(grids), leaf = function (n) { var out = []; while (out.length < n) out.push(0); return out; };
    if (base === 's' && Math.random() < 0.5) base = 'e';            // nest in an eighth as often as in a sixteenth
    var tree = { n: GRIDS[base].n, kids: leaf(GRIDS[base].n) };
    var inner = { n: weighted([[2, 3], [3, 4], [4, 2]]), kids: null };
    inner.kids = leaf(inner.n);
    tree.kids[rnd(tree.n)] = inner;
    if (Math.random() < 0.3) inner.kids[rnd(inner.n)] = { n: weighted([[2, 3], [3, 2]]), kids: null };
    inner.kids.forEach(function (kid) { if (kid && kid.kids === null) kid.kids = leaf(kid.n); });
    return { grid: base, tree: tree };
  }
  function leaves(node) {
    var n = 0;
    node.kids.forEach(function (kid) { n += kid && kid.kids ? leaves(kid) : 1; });
    return n;
  }

  function generateBar() {
    var level = Number(settings.level) || 2;
    var grids = [];
    if (settings.s) grids.push(['s', 6]);
    if (settings.t) grids.push(['t', 3]);
    if (settings.x) grids.push(['x', 2]);
    if (!grids.length) grids.push(['s', 1]);
    var nestable = grids.filter(function (g) { return g[0] !== 'x'; });
    if (!nestable.length) nestable = [['s', 1]];
    // Fivelets join in from level 3 and sevenlets at level 4, unless switched off.
    if (settings.five && level >= 3) grids.push(['5', 1.5]);
    if (settings.seven && level >= 4) grids.push(['7', 1]);
    var nesting = settings.complex && level === 4, nested = 0;

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

    var beats = [], boxes = [];
    for (var b = 0; b < 4; b++) {
      var shape = nesting && nested < 2 && Math.random() < (nested ? 0.25 : 0.6) ? nestedShape(nestable) : null;
      var grid = shape ? shape.grid : weighted(grids), mask;
      if (shape) {
        nested++;
        mask = '';
        while (mask.length < leaves(shape.tree)) mask += '1';
      } else {
        var table = level === 1 ? EASY_MASKS[grid] : (grid === 'x' && level === 2) ? FULL_SIX : MASKS[grid];
        mask = weighted(table);
      }
      var busy = grid === 'x' || grid === '5' || grid === '7' || shape;   // crowded beats stay cleaner
      var slots = [];
      for (var i = 0; i < mask.length; i++) {
        if (mask[i] === '0') { slots.push(null); continue; }
        // Levels 1-2 keep sextuplets clean: unisons only on the downbeat, no stacks.
        var plain = i > 0 && (level === 1 || (level === 2 && grid === 'x'));
        if (!plain && Math.random() < unisonRate * (i === 0 ? 2 : busy ? 0.3 : 0.6)) slots.push([0, 1, 2, 3, 4]);
        else if (!plain && !(level === 2 && grid === 'x') && Math.random() < stackRate * (busy && grid !== 'x' ? 0.5 : 1)) {
          // A stack: two (sometimes three) drums on the same note.
          var a = nextDrum(), stack = [a];
          var extra = Math.random() < 0.2 ? 2 : 1;
          while (stack.length < 1 + extra) { var o = rnd(5); if (stack.indexOf(o) === -1) stack.push(o); }
          slots.push(stack);
        }
        else slots.push([nextDrum()]);
      }
      // A triplet beat with nothing after the downbeat reads as a plain quarter.
      if (!shape && grid === 't' && !slots[1] && !slots[2]) { grid = 's'; slots = [slots[0], null, null, null]; }
      var beat = { grid: grid, slots: slots, tree: shape ? shape.tree : null };
      boxes = boxes.concat(beatBoxes(beat, b * M.BEAT, level));
      beats.push(beat);
    }
    return { beats: beats, boxes: boxes };
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
      if (onsetCount(bar) < 4 || !M.valid(bar.boxes)) continue;
      var playing = [0, 1, 2, 3, 4].filter(function (d) { return drumSlots(bar, d).length > 0; });
      if (playing.length < 3) continue;
      var target;
      if (settings.drum === 'random') target = playing[rnd(playing.length)];
      else { target = Number(settings.drum); if (playing.indexOf(target) === -1) continue; }
      return { bar: bar, target: target, answer: drumSlots(bar, target) };
    }
    // Practically unreachable; fall back to a plain run so the page never stalls.
    var fb = { beats: [0, 1, 2, 3].map(function (b) {
      return { grid: 's', slots: [0, 1, 2, 3].map(function (i) { return [(b * 4 + i) % 5]; }), tree: null };
    }), boxes: [] };
    fb.beats.forEach(function (beat, b) { fb.boxes = fb.boxes.concat(beatBoxes(beat, b * M.BEAT, 2)); });
    var t = settings.drum === 'random' ? rnd(5) : Number(settings.drum);
    return { bar: fb, target: t, answer: drumSlots(fb, t) };
  }

  /* ---------- engraving ---------- */

  function engrave(host, bar, markDrum) {
    var g = S.engraveBar(host, bar.boxes, {
      markDrum: markDrum === null || markDrum === undefined ? [] : markDrum + 1,
      label: 'One bar of bass drum music in 4/4'
    });
    var svg = host.querySelector('svg');
    svg.style.minWidth = Math.round(g.W * 0.92) + 'px';   // dense bars keep their size and scroll sideways
    var sheet = host.parentNode;
    sheet.scrollLeft = 0;
    $('scroll-hint').hidden = sheet.scrollWidth <= sheet.clientWidth + 1;
  }

  /* ---------- interface ---------- */

  var q = null, selected = {}, phase = 'answer', startedAt = 0, ticker = null;

  /* The answer pad: one row per beat, one button per count, each as wide as its share of the beat.
     A nested group sits inside a thin frame with its number; its first button keeps the name of the
     count it starts on and the rest are numbered 2, 3, 4 inside the group. */
  function buildPad() {
    var pad = $('pad');
    pad.innerHTML = '';
    q.bar.beats.forEach(function (beat, b) {
      var g = GRIDS[beat.grid], names = g.labels(String(b + 1)), leaf = 0;
      var row = document.createElement('div');
      row.className = 'pad-row' + (beat.tree ? ' pad-nested' : '');
      row.setAttribute('role', 'group');
      row.setAttribute('aria-label', 'Beat ' + (b + 1));
      function button(host, label, hint, share, first, inner) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'slot' + (first ? ' slot-beat' : '') + (inner ? ' slot-in' : '');
        btn.style.flexGrow = Math.max(1, Math.round(share * 420));
        btn.textContent = label;
        if (hint) btn.appendChild(document.createElement('sup')).textContent = hint;
        btn.dataset.key = b + '-' + (leaf++);
        btn.setAttribute('aria-pressed', 'false');
        btn.setAttribute('aria-label', first ? 'Beat ' + label : 'Beat ' + (b + 1) + ', ' + label + (inner ? ' of the nested group' : ''));
        host.appendChild(btn);
      }
      (function walk(node, host, labels, hints, share, depth) {
        node.kids.forEach(function (kid, i) {
          if (kid && kid.kids) {
            var frame = document.createElement('span');
            frame.className = 'pad-group';
            frame.style.flexGrow = Math.max(1, Math.round(share * 420));
            frame.dataset.n = kid.n;
            host.appendChild(frame);
            var inner = [labels[i]];
            while (inner.length < kid.n) inner.push(String(inner.length + 1));
            walk(kid, frame, inner, [], share / kid.n, depth + 1);
          } else button(host, labels[i], hints[i], share, depth === 0 && i === 0, depth > 0 && i > 0);
        });
      })(beat.tree || { n: g.n, kids: beat.slots }, row, names, g.hints || [], 1 / (beat.tree ? beat.tree.n : g.n), 0);
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
    3: 'Some figures are written with a rest inside the beat. Sextuplets can have gaps. Fivelets join in.',
    4: 'Short notes with rests, broken-up rests, more unisons, stacks and scattered splits. Fivelets and sevenlets.'
  };
  function syncOptions() {
    Array.prototype.forEach.call(document.querySelectorAll('input[name="drum"]'), function (r) {
      r.checked = r.value === String(settings.drum);
    });
    Array.prototype.forEach.call(document.querySelectorAll('input[name="level"]'), function (r) {
      r.checked = Number(r.value) === Number(settings.level);
    });
    $('level-note').textContent = (LEVEL_NOTES[settings.level] || '') +
      (settings.complex && Number(settings.level) === 4 ? ' Nested groups are on.' : '');
    ['s', 't', 'x', 'five', 'seven', 'complex', 'unisons', 'highlight', 'timer'].forEach(function (k) { $('opt-' + k).checked = !!settings[k]; });
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

  // For tests and the browser console.
  window.SplitQuiz = { settings: settings, generate: newQuestion, next: next, get question() { return q; } };

  syncOptions();
  next();
})();
