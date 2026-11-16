/* Bass Trainer: what the five-drum listening modules share.
     SplitCore.engraveBar   draws one bar of split music (VexFlow, Bravura)
     SplitCore.player       plays a passage on the bassline sound with a metronome
     SplitCore.RUDIMENTS    the named bass rudiments, and helpers that build and recognise them
   Used by the Split Sandbox, the Auditory Rudiment Quiz and the Discrepancy Quiz.
   Bars are lists of boxes from rhythm-model.js; drums are numbered 1 (top) to 5 (bottom). */
(function () {
  'use strict';

  var VF = Vex.Flow, M = RhythmModel;
  var BEAT = M.BEAT;

  // Staff positions, bass 1 (highest) to bass 5 (lowest): the four spaces plus below the staff.
  var KEYS = ['e/5', 'c/5', 'a/4', 'f/4', 'd/4'];

  function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  function rnd(n) { return Math.floor(Math.random() * n); }
  function pick(list) { return list[rnd(list.length)]; }
  function shuffle(list) {
    for (var i = list.length - 1; i > 0; i--) { var j = rnd(i + 1), t = list[i]; list[i] = list[j]; list[j] = t; }
    return list;
  }

  /* ---------- engraving ---------- */

  // Unison slash: a thin, steep stroke a little taller than two staff spaces, as in the Written Split Quiz.
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

  /* Draw one bar into host. opts:
       len       ticks in the bar (48 = 4/4)
       clef      show the clef and time signature (false for a bar that continues a line)
       open      no bar line at the left (the bar before supplies it)
       markDrum  colour this drum's notes (1-5, or a list of drums)
       zones     add a tap zone behind each note or rest
     Returns { W, H, centers } in the drawing's own units. */
  function engraveBar(host, boxes, opts) {
    opts = opts || {};
    host.innerHTML = '';
    var len = opts.len || M.BAR, mark = cssVar('--mark') || '#1f4fd8', marks = [].concat(opts.markDrum || []);
    var items = [], beams = [], tuplets = [], run = [], runBeat = -1, groups = {}, order = [], slashes = [];

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
      var dur = (b.t ? M.TUPLET : M.STRAIGHT)[b.d], vf;
      if (b.r) {
        vf = new VF.StaveNote({ keys: ['b/4'], duration: dur + 'r', clef: 'percussion' });
      } else {
        var drums = b.drums && b.drums.length ? b.drums : [3];
        var unison = drums.length === 5;
        var sorted = drums.slice().sort(function (x, y) { return y - x; });   // lowest pitch first
        var keys = unison ? ['b/4'] : sorted.map(function (d) { return KEYS[d - 1]; });
        vf = new VF.StaveNote({ keys: keys, duration: dur, type: unison ? 's' : 'n', clef: 'percussion', stem_direction: 1 });
        if (unison) { vf.note_heads[0].draw = drawSlash; slashes.push(vf); }
        var marked = marks.filter(function (d) { return drums.indexOf(d) !== -1; });
        if (marked.length) {
          if (unison || sorted.length === 1) vf.setStyle({ fillStyle: mark, strokeStyle: mark });
          else marked.forEach(function (d) { vf.setKeyStyle(sorted.indexOf(d), { fillStyle: mark, strokeStyle: mark }); });
        }
        if (b.flam) {
          var grace = new VF.GraceNote({ keys: keys, duration: '8', slash: true, clef: 'percussion', stem_direction: 1 });
          vf.addModifier(new VF.GraceNoteGroup([grace], false), 0);
        }
      }
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
      var group = groups[key], six = M.isSix(boxes, group[0].box.t);
      tuplets.push(new VF.Tuplet(group.map(function (it) { return it.vf; }), {
        num_notes: six ? 6 : 3, notes_occupied: six ? 4 : 2, ratioed: false,
        bracketed: !group.every(function (it) { return it.beamed; }), location: 1
      }));
    });

    var flams = boxes.filter(function (b) { return b.flam; }).length;
    var clef = opts.clef !== false;
    var W = Math.max(clef ? 150 + 60 * len / BEAT : 55 * len / BEAT, (clef ? 150 : 60) + items.length * 23 + flams * 12), H = 158;
    var renderer = new VF.Renderer(host, VF.Renderer.Backends.SVG);
    renderer.resize(W, H);
    var ctx = renderer.getContext();
    var left = opts.open ? 0 : 8;
    var stave = new VF.Stave(left, 34, W - left - (opts.joined ? 0 : 8));
    if (clef) stave.addClef('percussion').addTimeSignature((len / BEAT) + '/4');
    if (opts.open) stave.setBegBarType(VF.Barline.type.NONE);
    if (opts.last) stave.setEndBarType(VF.Barline.type.END);
    stave.setContext(ctx).draw();

    var voice = new VF.Voice({ num_beats: len / BEAT, beat_value: 4 });
    voice.setMode(VF.Voice.Mode.SOFT);
    voice.addTickables(items.map(function (it) { return it.vf; }));
    new VF.Formatter().joinVoices([voice]).formatToStave([voice], stave);
    items.forEach(function (it) { if (it.box.r) it.vf.setKeyLine(0, it.box.d === 48 ? 4 : 3); });   // rests on the middle line
    // The stem of a slash starts at the slash's upper corner, not at the middle line.
    slashes.forEach(function (n) { n.getStem().setOptions({ stem_up_y_base_offset: -SLASH.stem }); });
    voice.draw(ctx, stave);
    beams.forEach(function (bm) { bm.setContext(ctx).draw(); });
    tuplets.forEach(function (tp) { tp.setContext(ctx).draw(); });
    // Accents sit above the stem or beam, clear of a tuplet number, as in drum parts.
    items.forEach(function (it) {
      if (!it.box.accent || it.box.r) return;
      var top = it.vf.getStem().getExtents().topY;
      VF.Glyph.renderGlyph(ctx, it.vf.getAbsoluteX() + 1, Math.max(9, top - (it.box.t ? 19 : 7)), 34, 'articAccentAbove');
    });

    var svg = host.querySelector('svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.style.width = '100%';
    svg.style.height = 'auto';
    svg.style.maxWidth = Math.round(W * 1.5) + 'px';
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', opts.label || describeBar(boxes));

    var centers = items.map(function (it) { return it.vf.getAbsoluteX() + 6; });
    if (opts.zones) {
      var NS = 'http://www.w3.org/2000/svg', first = svg.firstChild;
      centers.forEach(function (c, i) {
        var l = i === 0 ? Math.max(0, c - 26) : (centers[i - 1] + c) / 2;
        var r = i === centers.length - 1 ? W : (c + centers[i + 1]) / 2;
        var rect = document.createElementNS(NS, 'rect');
        rect.setAttribute('class', 'zone');
        rect.setAttribute('data-i', i);
        rect.setAttribute('x', l); rect.setAttribute('y', 10);
        rect.setAttribute('width', r - l); rect.setAttribute('height', H - 20);
        rect.setAttribute('rx', 4);
        svg.insertBefore(rect, first);
      });
    }
    return { W: W, H: H, centers: centers };
  }

  function drumName(drums) {
    if (!drums || !drums.length) return 'bass 3';
    if (drums.length === 5) return 'unison';
    return 'bass ' + drums.slice().sort().join(' and ');
  }
  function describeBox(list, b) {
    var value = (b.t ? M.TUPLET_NAME : M.STRAIGHT_NAME)[b.d];
    var beat = Math.floor(b.s / BEAT) + 1, name = M.countName(list, b.s);
    var where = b.s % BEAT === 0 ? 'beat ' + beat : 'the ' + (name === '+' ? 'and' : name) + ' of ' + beat;
    if (b.r) return value + ' rest on ' + where;
    return (b.accent ? 'accented ' : '') + (b.flam ? 'flammed ' : '') + value + ' note, ' + drumName(b.drums) + ', on ' + where;
  }
  function describeBar(boxes) {
    return 'Bass drum music: ' + boxes.map(function (b) { return describeBox(boxes, b); }).join('; ');
  }

  /* ---------- from bars to sound ---------- */

  var ACCENT = Math.pow(10, 4 / 20);          // an accent is 4 dB louder
  var FLAM_AHEAD = 0.030, FLAM_GAIN = Math.pow(10, -8 / 20);   // the grace note: 30 ms early, 8 dB quieter

  /* A passage for the player: { beats, barBeats, hits }. Each hit is one stroke at `beat`
     (counted from the start, fractions allowed); its voices are the drums that sound, each with
     dt (seconds early or late), gain (1 = normal) and buf (a changed drum sound, or null). */
  function passage(bars) {
    var hits = [], at = 0;
    bars.forEach(function (bar) {
      bar.boxes.forEach(function (b) {
        if (b.r) return;
        var drums = b.drums && b.drums.length ? b.drums : [3], voices = [];
        drums.forEach(function (d) {
          if (b.flam) voices.push({ d: d, dt: -FLAM_AHEAD, gain: FLAM_GAIN, buf: null, grace: true });
          voices.push({ d: d, dt: 0, gain: b.accent ? ACCENT : 1, buf: null });
        });
        hits.push({ beat: (at + b.s) / BEAT, voices: voices, of: drums.length });
      });
      at += bar.len || M.BAR;
    });
    return { beats: at / BEAT, barBeats: (bars[0] && (bars[0].len || M.BAR) / BEAT) || 4, hits: hits };
  }

  var audio = { ctx: null, voice: null };
  function getAudio() {
    if (!audio.ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audio.ctx = new AC();
      audio.voice = BassVoice.create(audio.ctx);
    }
    if (audio.ctx.state === 'suspended') audio.ctx.resume();
    return audio;
  }

  // Sound one stroke now (used when a note is written), unless a player is busy.
  var busy = 0;
  function preview(b) {
    if (busy || !b || b.r) return;
    var a = getAudio();
    if (!a) return;
    var seq = passage([{ boxes: [{ s: 0, d: 12, r: false, t: null, drums: b.drums, flam: b.flam, accent: b.accent }], len: 12 }]);
    var now = a.ctx.currentTime + 0.05;
    try { a.voice.output.disconnect(); } catch (e) { /* nothing connected yet */ }
    a.voice.output.connect(a.ctx.destination);
    seq.hits[0].voices.forEach(function (v) { a.voice.play([v.d], now + v.dt, { of: seq.hits[0].of, gain: v.gain }); });
  }

  /* One player per page. cfg: onFrame(beat or null, counting) each animation frame while playing,
     onState(playing), onCue(message).
     play({ seq, bpm, met, loop, countIn, onEnd }): seq, bpm, met and loop are functions, read again
     at the start of every pass, so edits and option changes are heard from the next pass. */
  function player(cfg) {
    var p = { on: false, next: 0, stage: 'music', endAt: null, timer: null, raf: 0, passes: [], live: [], master: null, job: null, told: false };

    function metClick(at, downbeat) {
      var ctx = audio.ctx, osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(downbeat ? 1760 : 1175, at);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.2, at + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.045);
      osc.connect(g); g.connect(p.master);
      osc.start(at); osc.stop(at + 0.06);
      p.live.push(osc);
    }
    function schedule() {
      var ctx = audio.ctx, job = p.job;
      while (p.on && p.endAt === null && p.next < ctx.currentTime + 0.25) {
        var beat = 60 / job.bpm(), start = p.next, k;
        if (p.stage === 'count') {
          for (k = 0; k < 4; k++) metClick(start + k * beat, k === 0);
          p.passes.push({ start: start, len: 4 * beat, beats: 4, count: true });
          p.stage = 'music';
          p.next = start + 4 * beat;
          continue;
        }
        var seq = job.seq();
        if (job.met()) for (k = 0; k < seq.beats; k++) metClick(start + k * beat, k % seq.barBeats === 0);
        seq.hits.forEach(function (hit) {
          hit.voices.forEach(function (v) {
            var opts = { of: hit.of, gain: v.gain };
            if (v.buf) { opts.buffers = {}; opts.buffers[v.d] = v.buf; }
            p.live = p.live.concat(audio.voice.play([v.d], start + hit.beat * beat + v.dt, opts));
          });
        });
        p.passes.push({ start: start, len: seq.beats * beat, beats: seq.beats, count: false });
        if (!job.loop()) p.endAt = start + seq.beats * beat + 0.7;       // let the last stroke ring
        p.next = start + seq.beats * beat;
        if (p.live.length > 600) p.live = p.live.slice(-300);
      }
    }
    function frame() {
      if (!p.on) return;
      var ctx = audio.ctx, now = ctx.currentTime - (ctx.outputLatency || 0);
      if (p.endAt !== null && ctx.currentTime >= p.endAt) { stop(true); return; }
      while (p.passes.length > 1 && p.passes[1].start <= now) p.passes.shift();
      var pass = p.passes[0];
      if (pass && now >= pass.start && now < pass.start + pass.len) {
        var pos = (now - pass.start) / pass.len * pass.beats;
        if (cfg.onFrame) cfg.onFrame(pass.count ? null : pos, pass.count ? Math.floor(pos) + 1 : 0);
      } else if (cfg.onFrame) cfg.onFrame(null, 0);
      p.raf = requestAnimationFrame(frame);
    }
    function play(job) {
      if (p.on) stop(false);
      var a = getAudio();
      if (!a) { if (cfg.onCue) cfg.onCue('This browser cannot play audio.'); return false; }
      p.job = job;
      p.master = a.ctx.createGain();
      p.master.connect(a.ctx.destination);
      try { a.voice.output.disconnect(); } catch (e) { /* nothing connected yet */ }
      a.voice.output.connect(p.master);
      p.on = true; busy++;
      p.passes = []; p.live = [];
      p.endAt = null;
      p.stage = job.countIn ? 'count' : 'music';
      p.next = a.ctx.currentTime + 0.14;
      schedule();
      p.timer = setInterval(schedule, 25);
      p.raf = requestAnimationFrame(frame);
      if (cfg.onState) cfg.onState(true);
      if (/iPhone|iPad|iPod/.test(navigator.userAgent) && !p.told && cfg.onCue) { p.told = true; cfg.onCue('No sound? Check that the silent switch is off and the volume is up.'); }
      return true;
    }
    function stop(finished) {
      if (!p.on) return;
      p.on = false; busy--;
      clearInterval(p.timer);
      cancelAnimationFrame(p.raf);
      try {
        p.master.gain.setValueAtTime(0, audio.ctx.currentTime);
        audio.voice.output.disconnect(p.master);
        p.master.disconnect();
      } catch (e) { /* already gone */ }
      p.live.forEach(function (src) { try { src.stop(); } catch (e) { /* already ended */ } });
      p.live = [];
      if (cfg.onFrame) cfg.onFrame(null, 0);
      if (cfg.onState) cfg.onState(false);
      var job = p.job;
      if (finished === true && job && job.onEnd) job.onEnd();
    }
    // Turning Loop back on while the last pass is playing keeps it going.
    function keepGoing() {
      if (p.on && p.endAt !== null) { p.endAt = null; p.next = Math.max(p.next, audio.ctx.currentTime + 0.05); }
    }
    document.addEventListener('visibilitychange', function () { if (document.hidden) stop(false); });
    return { play: play, stop: function () { stop(false); }, keepGoing: keepGoing, get playing() { return p.on; } };
  }

  /* ---------- rudiments ----------
     A pattern is written as steps from its first drum: [0, 1, 2] is 123, 234 or 345, and played
     the other way it is 321, 432 or 543. Twos and Threes repeat each drum; which drums does not matter.
     home: the subdivisions a rudiment is usually written in (s sixteenths, t triplets, x sextuplets);
     alt: other subdivisions the harder levels may use. Fours wait for 32nd notes. */
  var RUDIMENTS = [
    { id: 'buguduh', name: 'Buguduh', cell: [0, 1, 2], home: ['t', 'x'], alt: ['s'] },
    { id: 'laser', name: 'Laser Beam', cell: [0, 1, 2, 3], home: ['s'], alt: ['t'] },
    { id: 'bunny', name: 'Bunny Hop', cell: [0, 1, 2, 1], home: ['s'], alt: ['t'] },
    { id: 'single', name: 'Single Split', cell: [0, 1], home: ['s'], alt: ['t', 'x'] },
    { id: 'waterfall', name: 'Waterfall', forms: { x: [0, 1, 2, 1, 2, 3], t: [0, 1, 2, 1, 2, 3], s: [0, 1, 2, 3, 1, 2, 3, 4] }, home: ['x', 's'], alt: ['t'] },
    { id: 'twos', name: 'Twos', group: 2, home: ['s'], alt: ['x'] },
    { id: 'threes', name: 'Threes', group: 3, home: ['t', 'x'], alt: [] }
  ];
  var PER_BEAT = { s: 4, t: 3, x: 6 };
  function rudiment(id) { return RUDIMENTS.filter(function (r) { return r.id === id; })[0]; }

  // n notes of a rudiment as drum numbers, or null when it does not fit that many notes.
  function drumSeq(rud, n, grid) {
    var out = [], i;
    if (rud.group) {
      if (n % rud.group !== 0 || n / rud.group < 2) return null;
      var cur = 1 + rnd(5), dir = Math.random() < 0.5 ? 1 : -1, scatter = Math.random() < 0.2;
      if (cur === 1) dir = 1; if (cur === 5) dir = -1;
      for (i = 0; i < n / rud.group; i++) {
        for (var k = 0; k < rud.group; k++) out.push(cur);
        if (scatter) { var nx = 1 + rnd(5); cur = nx === cur ? (cur % 5) + 1 : nx; }
        else { if (cur + dir > 5 || cur + dir < 1) dir = -dir; cur += dir; }
      }
      return out;
    }
    var pat = rud.cell || rud.forms[grid];
    if (!pat || (rud.forms && n % pat.length !== 0) || n < pat.length) return null;
    var span = Math.max.apply(null, pat), down = Math.random() < 0.5;
    var base = down ? 1 + span + rnd(5 - span) : 1 + rnd(5 - span);
    for (i = 0; i < n; i++) out.push(down ? base - pat[i % pat.length] : base + pat[i % pat.length]);
    return out;
  }

  // Beats are { grid, slots }: one entry per subdivision, each null (nothing) or a list of drums.
  function segment(rud, grid, nBeats) {
    var per = PER_BEAT[grid], seq = drumSeq(rud, per * nBeats, grid);
    if (!seq) return null;
    var beats = [];
    for (var b = 0; b < nBeats; b++) {
      beats.push({ grid: grid, slots: seq.slice(b * per, (b + 1) * per).map(function (d) { return [d]; }) });
    }
    return beats;
  }
  function restBeat() { return { grid: 's', slots: [null, null, null, null] }; }
  function noteBeat(drums) { return { grid: 's', slots: [drums, null, null, null] }; }

  // Beats to bars of boxes, written the level-2 way: notes ring to the next note.
  function toBars(beats, perBar) {
    perBar = perBar || 4;
    var bars = [];
    for (var b = 0; b < beats.length; b += perBar) {
      var boxes = [];
      beats.slice(b, b + perBar).forEach(function (beat, k) {
        var grid = beat.grid, slots = beat.slots;
        // A triplet beat with nothing after the downbeat reads as a plain quarter.
        var mask = slots.map(function (s) { return s ? '1' : '0'; }).join('');
        var made = M.beatBoxes(grid, mask, k * BEAT), on = slots.filter(function (s) { return s; }), i = 0;
        made.forEach(function (bx) { if (!bx.r) bx.drums = on[i++].slice().sort(); });
        boxes = boxes.concat(made);
      });
      bars.push({ boxes: boxes, len: Math.min(perBar, beats.length - b) * BEAT });
    }
    return bars;
  }
  function barsValid(bars) { return bars.every(function (bar) { return M.valid(bar.boxes, bar.len); }); }
  function barsKey(bars) {
    return bars.map(function (bar) {
      return bar.boxes.map(function (b) { return b.s + (b.r ? 'r' : 'n' + (b.drums || []).join('')) + (b.flam ? 'f' : '') + (b.accent ? 'a' : ''); }).join(',');
    }).join('|');
  }

  // The name of the rudiment a passage is, if it is only a rudiment or a rudiment plus one note.
  function matches(rud, seq) {
    var i, n = seq.length;
    if (rud.group) {
      var g = rud.group;
      if (n % g !== 0 || n / g < 2) return false;
      for (i = 0; i < n; i++) {
        if (seq[i] !== seq[i - i % g]) return false;
        if (i % g === 0 && i > 0 && seq[i] === seq[i - 1]) return false;
      }
      return true;
    }
    var pats = rud.cell ? [rud.cell] : [rud.forms.x, rud.forms.s];
    return pats.some(function (pat) {
      if (n < pat.length || (pat.length <= 2 && n < 4) || (rud.forms && n % pat.length !== 0)) return false;
      return [1, -1].some(function (sign) {
        for (i = 0; i < n; i++) if (seq[i] - seq[0] !== sign * pat[i % pat.length]) return false;
        return true;
      });
    });
  }
  var MATCH_ORDER = ['waterfall', 'laser', 'bunny', 'buguduh', 'single', 'twos', 'threes'];
  function identify(bars) {
    var notes = [], at = 0, rests = 0;
    bars.forEach(function (bar) {
      bar.boxes.forEach(function (b) { if (b.r) rests++; else notes.push({ s: at + b.s, drums: b.drums || [3] }); });
      at += bar.len || M.BAR;
    });
    function tryList(list) {
      if (list.length < 3 || list[0].s !== 0) return null;
      var step = list[1].s - list[0].s, seq = [], i;
      for (i = 0; i < list.length; i++) {
        if (list[i].drums.length !== 1) return null;
        if (i > 0 && list[i].s - list[i - 1].s !== step) return null;
        seq.push(list[i].drums[0]);
      }
      for (i = 0; i < MATCH_ORDER.length; i++) if (matches(rudiment(MATCH_ORDER[i]), seq)) return rudiment(MATCH_ORDER[i]).name;
      return null;
    }
    return tryList(notes) || tryList(notes.slice(0, -1));
  }

  window.SplitCore = {
    KEYS: KEYS, engraveBar: engraveBar, describeBox: describeBox, drumName: drumName,
    passage: passage, audio: getAudio, player: player, preview: preview,
    RUDIMENTS: RUDIMENTS, PER_BEAT: PER_BEAT, rudiment: rudiment, drumSeq: drumSeq, segment: segment,
    restBeat: restBeat, noteBeat: noteBeat, toBars: toBars, barsValid: barsValid, barsKey: barsKey, identify: identify,
    rnd: rnd, pick: pick, shuffle: shuffle
  };
})();
