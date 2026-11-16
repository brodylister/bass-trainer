/* Bass Trainer: the engine behind the two listening quizzes.
   A page calls ListenQuiz.start({ key, defaults, generate, onSettings }).
   generate(settings) returns one question:
     { bpm, bars            what is played, as bars of boxes (see rhythm-model.js)
       alter(seq, audio)    optional: change the passage before it is played (the Discrepancy Quiz's errors)
       sheet                optional: bars shown above the choices
       markDrums            optional: drums coloured on the sheet once answered
       options: [{ bars, name } or { lines: [text, ...] }, with correct: true on one]
       right                a sentence shown after answering }
   Settings are read from the inputs inside #options: a checkbox with id "opt-x" is settings.x,
   radio buttons named "y" are settings.y. Settings and records stay in this browser only. */
(function () {
  'use strict';

  var S = SplitCore;
  var $ = function (id) { return document.getElementById(id); };

  function load(key, fallback) {
    var out = {};
    Object.keys(fallback).forEach(function (k) { out[k] = fallback[k]; });
    try {
      var saved = JSON.parse(localStorage.getItem(key) || '{}');
      Object.keys(fallback).forEach(function (k) { if (k in saved && typeof saved[k] === typeof fallback[k]) out[k] = saved[k]; });
    } catch (e) { /* storage unavailable: defaults are fine */ }
    return out;
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignore */ }
  }
  function fmt(ms) { return (ms / 1000).toFixed(1) + ' s'; }

  function start(cfg) {
    var settings = load(cfg.key + '-settings', cfg.defaults);
    var record = load(cfg.key + '-record', { bestStreak: 0, bestTime: -1 });
    var session = { right: 0, total: 0, streak: 0 };
    var q = null, chosen = null, phase = 'answer', startedAt = 0, ticker = null, heard = false, mode = '';

    /* ---------- drawing ---------- */

    // Choices shrink to fit their card; the main sheet keeps its size and scrolls sideways, as on the other pages.
    function drawBars(host, bars, markDrums, keepSize) {
      host.innerHTML = '';
      bars.forEach(function (bar, n) {
        var line = document.createElement('div');
        line.className = 'staff-line';
        host.appendChild(line);
        var g = S.engraveBar(line, bar.boxes, { len: bar.len, last: n === bars.length - 1, markDrum: markDrums });
        var svg = line.querySelector('svg');
        svg.style.maxWidth = Math.round(g.W * (keepSize ? 1.5 : 1.15)) + 'px';
        svg.style.minWidth = Math.round(g.W * (keepSize ? 0.92 : 0.6)) + 'px';   // dense bars scroll sideways instead of shrinking away
      });
    }

    function renderChoices() {
      var host = $('choices');
      host.innerHTML = '';
      host.className = 'choices' + (q.options[0].bars ? ' choices-music' : ' choices-text') + (q.options.length > 4 ? ' many' : '');
      q.options.forEach(function (opt, i) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'choice';
        btn.dataset.i = i;
        btn.setAttribute('aria-pressed', 'false');
        var tag = document.createElement('b');
        tag.className = 'choice-tag';
        tag.textContent = String.fromCharCode(65 + i);
        btn.appendChild(tag);
        if (opt.bars) {
          var music = document.createElement('div');
          music.className = 'choice-music';
          btn.appendChild(music);
          drawBars(music, opt.bars);
          if (opt.name) {
            var name = document.createElement('span');
            name.className = 'choice-name';
            name.textContent = opt.name;
            btn.appendChild(name);
          }
          btn.setAttribute('aria-label', 'Choice ' + tag.textContent + (opt.name ? ', ' + opt.name : '') + '. ' +
            Array.prototype.map.call(music.querySelectorAll('svg'), function (svg) { return svg.getAttribute('aria-label'); }).join(' Then: '));
        } else {
          var text = document.createElement('span');
          text.className = 'choice-text';
          opt.lines.forEach(function (line) { text.appendChild(document.createElement('span')).textContent = line; });
          btn.appendChild(text);
        }
        host.appendChild(btn);
      });
    }

    function renderStats() {
      $('stat-streak').textContent = session.streak;
      $('stat-score').textContent = session.total ? session.right + '/' + session.total : '0/0';
      $('stat-best').textContent = record.bestTime < 0 ? 'none yet' : fmt(record.bestTime);
      $('stat-beststreak').textContent = record.bestStreak;
      $('timer-wrap').hidden = !settings.timer;
      $('best-wrap').hidden = !settings.timer;
    }

    /* ---------- playback ---------- */

    var player = S.player({
      onFrame: function (pos, counting) {
        if (counting) $(mode === 'clean' ? 'clean-label' : 'play-label').textContent = 'Count ' + counting;
      },
      onState: function (on) {
        var which = mode === 'clean' ? 'clean' : 'play';
        ['play', 'clean'].forEach(function (id) {
          if (!$(id)) return;
          var live = on && id === which;
          $(id).setAttribute('aria-pressed', live ? 'true' : 'false');
          $(id + '-label').textContent = live ? 'Stop' : id === 'play' ? (heard ? 'Play again' : 'Play') : 'Clean version';
        });
        $('play-icon').setAttribute('d', on && which === 'play' ? 'M6 5h12v14H6z' : 'M7 4.5v15l12.5-7.5z');
      },
      onCue: function (msg) { var c = $('cue'); c.textContent = msg; c.hidden = !msg; }
    });

    function sequence(clean) {
      var seq = S.passage(q.bars);
      if (!clean && q.alter) q.alter(seq, S.audio());
      return seq;
    }
    function play(clean) {
      if (!q) return;
      mode = clean ? 'clean' : 'play';
      var seq = null;
      var ok = player.play({
        seq: function () { return seq || (seq = sequence(clean)); },
        bpm: function () { return q.bpm; },
        met: function () { return !!settings.met; },
        loop: function () { return false; },
        countIn: !!settings.countIn
      });
      if (ok && !clean && !heard) {
        heard = true;
        if (phase === 'answer') startTimer();
      }
    }

    function startTimer() {
      startedAt = performance.now();
      clearInterval(ticker);
      ticker = setInterval(function () {
        if (phase === 'answer') $('stat-timer').textContent = fmt(performance.now() - startedAt);
      }, 100);
    }

    /* ---------- one question ---------- */

    function next(autoplay) {
      player.stop();
      q = cfg.generate(settings);
      chosen = null; phase = 'answer'; heard = false; startedAt = 0;
      clearInterval(ticker);
      $('stat-timer').textContent = '0.0 s';
      $('feedback').hidden = true;
      $('feedback').className = 'feedback';
      $('action').textContent = 'Check';
      $('action').disabled = true;
      $('play-label').textContent = 'Play';
      if ($('sheet-bars')) drawBars($('sheet-bars'), q.sheet || q.bars, null, true);
      if ($('clean')) $('clean').hidden = !settings.clean;
      $('tempo-note').textContent = q.bpm + ' bpm';
      renderChoices();
      renderStats();
      if (autoplay) play(false);
    }

    function check() {
      var elapsed = startedAt ? performance.now() - startedAt : 0;
      phase = 'result';
      clearInterval(ticker);
      var correct = !!q.options[chosen].correct;
      Array.prototype.forEach.call(document.querySelectorAll('.choice'), function (btn) {
        var i = Number(btn.dataset.i);
        btn.disabled = true;
        if (q.options[i].correct) btn.classList.add('is-right');
        else if (i === chosen) btn.classList.add('is-wrong');
      });
      session.total++;
      var fb = $('feedback');
      if (correct) {
        session.right++;
        session.streak++;
        if (session.streak > record.bestStreak) record.bestStreak = session.streak;
        var timed = settings.timer && startedAt;
        var isBest = timed && (record.bestTime < 0 || elapsed < record.bestTime);
        if (isBest) record.bestTime = elapsed;
        save(cfg.key + '-record', record);
        fb.textContent = 'Correct' + (timed ? ' in ' + fmt(elapsed) + (isBest ? ', your fastest yet' : '') : '') + '. ' + (q.right || '');
        fb.classList.add('good');
      } else {
        session.streak = 0;
        fb.textContent = 'Not quite. ' + (q.right || '') + ' The right choice is outlined in green.';
        fb.classList.add('bad');
      }
      fb.hidden = false;
      if (settings.timer && startedAt) $('stat-timer').textContent = fmt(elapsed);
      if ($('sheet-bars') && q.markDrums) drawBars($('sheet-bars'), q.sheet || q.bars, q.markDrums, true);
      $('action').textContent = 'Next';
      $('action').disabled = false;
      renderStats();
    }

    $('choices').addEventListener('click', function (e) {
      var btn = e.target.closest('.choice');
      if (!btn || phase !== 'answer') return;
      chosen = Number(btn.dataset.i);
      Array.prototype.forEach.call(document.querySelectorAll('.choice'), function (b) {
        var on = b === btn;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      $('action').disabled = false;
    });
    $('action').addEventListener('click', function () { if (phase === 'answer') check(); else next(true); });
    $('play').addEventListener('click', function () { if (player.playing && mode === 'play') player.stop(); else play(false); });
    if ($('clean')) $('clean').addEventListener('click', function () { if (player.playing && mode === 'clean') player.stop(); else play(true); });

    /* ---------- options ---------- */

    function syncOptions() {
      Array.prototype.forEach.call($('options').querySelectorAll('input'), function (el) {
        if (el.type === 'radio') el.checked = el.value === String(settings[el.name]);
        else if (el.type === 'checkbox') el.checked = !!settings[el.id.replace('opt-', '')];
      });
      if (cfg.onSettings) cfg.onSettings(settings);
    }
    $('options').addEventListener('change', function (e) {
      var el = e.target, fresh = true;
      if (el.type === 'radio') settings[el.name] = typeof cfg.defaults[el.name] === 'number' ? Number(el.value) : el.value;
      else {
        var key = el.id.replace('opt-', '');
        settings[key] = el.checked;
        // Sound and timing choices do not need a new question.
        if (['met', 'countIn', 'timer', 'clean'].indexOf(key) !== -1) fresh = false;
      }
      if (cfg.fix) cfg.fix(settings);
      save(cfg.key + '-settings', settings);
      syncOptions();
      if (fresh) next(false);
      else { renderStats(); if ($('clean')) $('clean').hidden = !settings.clean; }
    });

    if (cfg.fix) cfg.fix(settings);
    syncOptions();
    next(false);
    return { get question() { return q; }, next: next, settings: settings };
  }

  window.ListenQuiz = { start: start };
})();
