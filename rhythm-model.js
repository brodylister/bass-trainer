/* Bass Trainer: the rhythm model shared by every module.
   Both sandboxes cut, fuse and toggle through this one file, so their tools always match:
   a new kind of cut added here appears in both. The quizzes build their bars with it too, and
   SplitCore.engraveBar draws whatever it describes.

   Time is counted in ticks. A bar of 4/4 is 64 x 729 x 125 x 343 ticks, which divides evenly by
   every cut the tools can make (down to a 64th note, with 3s, 5s, 7s and 9s nested inside each
   other), so every length is a whole number and nothing is ever rounded.

   A bar is a list of boxes in time order:
     { s: start tick, d: length, r: is a rest, g: the tuplets the box sits under, outermost first }
   Each tuplet is [start, span, n]: n equal parts in the time of one note `span` ticks long.
   n is 3, 5, 6, 7 or 9, written 3:2, 5:4, 6:4, 7:4 and 9:8. Cutting a piece of a tuplet in 2
   does not make a new tuplet; cutting it in 3 (or 5, 7...) nests one.
   Split music adds { drums: [1-5, ...], flam: true, accent: true }. */
(function (root) {
  'use strict';

  var BAR = 64 * 729 * 125 * 343, BEAT = BAR / 4, U64 = BAR / 64;
  var OCC = { 3: 2, 5: 4, 6: 4, 7: 4, 9: 8 };          // a tuplet of n takes the time of OCC[n] notes
  // Written values, counted in 64th notes.
  var VALUE = { 64: 'w', 48: 'hd', 32: 'h', 24: 'qd', 16: 'q', 12: '8d', 8: '8', 6: '16d', 4: '16', 3: '32d', 2: '32', 1: '64' };
  var VALUE_NAME = { 64: 'whole', 48: 'dotted half', 32: 'half', 24: 'dotted quarter', 16: 'quarter', 12: 'dotted eighth', 8: 'eighth',
    6: 'dotted sixteenth', 4: 'sixteenth', 3: 'dotted thirty-second', 2: 'thirty-second', 1: 'sixty-fourth' };
  var TUPLET_NAME = { 3: 'triplet', 5: 'fivelet', 6: 'sextuplet', 7: 'sevenlet', 9: 'ninelet' };
  var OPTION = 'Turn on "More complicated rhythms" in the options';

  function chainCopy(g) { return (g || []).map(function (t) { return [t[0], t[1], t[2]]; }); }
  function box(s, d, r, g, from, lead) {
    var o = { s: s, d: d, r: !!r, g: chainCopy(g) };
    if (from && from.drums) o.drums = from.drums.slice();
    // A flam or an accent belongs to the stroke, so only the first piece of a cut keeps it.
    if (from && lead !== false && !r) {
      if (from.flam) o.flam = true;
      if (from.accent) o.accent = true;
    }
    return o;
  }
  function copy(list) { return list.map(function (b) { return box(b.s, b.d, b.r, b.g, b); }); }
  function sameTuplet(a, b) { return a[0] === b[0] && a[1] === b[1] && a[2] === b[2]; }
  function common(a, b) {
    var k = 0;
    while (k < a.length && k < b.length && sameTuplet(a[k], b[k])) k++;
    return k;
  }
  function sameChain(a, b) { return a.g.length === b.g.length && common(a.g, b.g) === a.g.length; }
  function chainKey(g, upTo) {
    return g.slice(0, upTo === undefined ? g.length : upTo).map(function (t) { return t.join(':'); }).join('/');
  }

  // The written value of a length under a chain of tuplets, in 64th notes (16 = a quarter note).
  function writtenOf(d, g) {
    var w = d;
    for (var k = 0; k < g.length; k++) w = w * g[k][2] / OCC[g[k][2]];
    return w / U64;
  }
  function written(b) { return writtenOf(b.d, b.g); }
  function dotted(w) { return w === 48 || w === 24 || w === 12 || w === 6 || w === 3; }
  function dur(b) { return VALUE[written(b)]; }
  function valueName(b) {
    var name = VALUE_NAME[written(b)] || 'note', g = b.g;
    if (!g.length) return name;
    if (g.length === 1 && g[0][2] === 3) return 'triplet ' + name;
    return name + ' in a ' + (g.length > 1 ? 'nested ' : '') + TUPLET_NAME[g[g.length - 1][2]];
  }

  /* ---------- cutting and fusing ----------
     opts.complex is the "More complicated rhythms" option: without it nothing is written smaller
     than a sixteenth, tuplets are not nested, and a triplet replaces a quarter or an eighth only.
     A result is { boxes, made, at }, or { msg } when the cut is not possible; need: 'complex'
     marks a message that the option would lift. */
  function locked(msg) { return { soon: true, need: 'complex', msg: msg + ' ' + OPTION + ' to do this.' }; }

  function cut(list, i, n, opts) {
    opts = opts || {};
    var b = list[i], w = written(b), g = chainCopy(b.g), part, tuplet = false;
    if (n === 2 || n === 4 || n === 8) {
      if (dotted(w)) return { msg: 'A dotted note does not cut into ' + n + ' equal parts. It does cut evenly into 3: try the 3 scissors.' };
      part = w / n;
    } else if (dotted(w)) {
      if (n !== 3 && n !== 6) return { msg: 'A dotted note cuts evenly into 3 or 6, not into ' + n + '.' };
      part = w / n;                                                          // plain notes, no tuplet
    } else {
      if (!OCC[n]) return { msg: 'That cut is not available.' };
      tuplet = true;
      part = w / OCC[n];
    }
    if (part < 1 || part !== Math.floor(part)) return { msg: 'Sixty-fourth notes are the smallest pieces.' };
    if (!opts.complex && part < 4) return locked('That would make notes smaller than a sixteenth.');
    if (tuplet) {
      if (!opts.complex && g.length) return locked('A tuplet inside a tuplet is a nested tuplet.');
      var base = g.length ? g[g.length - 1][0] : 0;
      if ((b.s - base) % b.d !== 0) return { msg: 'This note starts off its own beat, so it cannot be cut into a tuplet.' };
      if (!opts.complex && n === 3 && b.d > BEAT) return locked('A triplet across more than one beat is made of quarter notes or longer.');
      g.push([b.s, b.d, n]);
    }
    var out = copy(list), parts = [], d = b.d / n;
    for (var k = 0; k < n; k++) parts.push(box(b.s + k * d, d, b.r, g, b, k === 0));
    Array.prototype.splice.apply(out, [i, 1].concat(parts));
    return { boxes: out, made: n, at: i };
  }

  // Remove the cut between box i and box i + 1, fusing them into one box.
  function fuse(list, i, opts) {
    opts = opts || {};
    var a = list[i], b = list[i + 1];
    if (!a || !b) return { msg: 'Hold on the line between two boxes to fuse them.' };
    if (!sameChain(a, b)) {
      return { msg: a.g.length || b.g.length
        ? 'These two cannot fuse: they are not in the same tuplet. Fuse the tuplet back into one note first.'
        : 'These two cannot fuse.' };
    }
    var d = a.d + b.d, g = chainCopy(a.g);
    if (g.length && d === g[g.length - 1][1]) g.pop();                       // the whole tuplet is back to one plain note
    var w = writtenOf(d, g);
    if (!VALUE[w]) return { msg: 'Those two add up to a length that needs a tie, and ties are not supported yet.' };
    if (g.length && dotted(w) && !opts.complex) return locked('That would make a dotted note inside a tuplet.');
    if (!g.length) {
      var crosses = Math.floor(a.s / BEAT) !== Math.floor((a.s + d - 1) / BEAT);
      if (crosses && a.s % BEAT !== 0) return { msg: 'That note would hang over the beat and need a tie, and ties are not supported yet.' };
    }
    var out = copy(list);
    out.splice(i, 2, box(a.s, d, a.r, g, a));
    return { boxes: out, made: 1, at: i };
  }

  function toggleRest(list, i) {
    var out = copy(list);
    out[i].r = !out[i].r;
    if (out[i].r) { delete out[i].flam; delete out[i].accent; }
    return { boxes: out, made: 1, at: i };
  }

  // True when the list is a legal bar of `len` ticks (a 4/4 bar unless told otherwise).
  function valid(list, len) {
    var pos = 0, totals = {}, spans = {};
    if (!Array.isArray(list)) return false;
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      if (!b || b.s !== pos || !(b.d > 0) || !Array.isArray(b.g) || b.g.length > 6) return false;
      if (!VALUE[written(b)]) return false;
      var lo = 0, hi = Infinity;
      for (var k = 0; k < b.g.length; k++) {
        var t = b.g[k];
        if (!Array.isArray(t) || !OCC[t[2]] || !(t[1] > 0) || t[1] % t[2] !== 0) return false;
        if (t[0] < lo || t[0] + t[1] > hi || (t[0] - lo) % t[1] !== 0) return false;
        var ws = writtenOf(t[1], b.g.slice(0, k));
        if (!VALUE[ws] || dotted(ws)) return false;
        lo = t[0]; hi = t[0] + t[1];
        var key = chainKey(b.g, k + 1);
        totals[key] = (totals[key] || 0) + b.d;
        spans[key] = t[1];
      }
      if (b.s < lo || b.s + b.d > hi) return false;
      if (!b.g.length && Math.floor(b.s / BEAT) !== Math.floor((b.s + b.d - 1) / BEAT) && b.s % BEAT !== 0) return false;
      pos += b.d;
    }
    if (pos !== (len || BAR)) return false;
    return Object.keys(totals).every(function (k) { return totals[k] === spans[k]; });
  }

  // Bars saved before nested tuplets used 12 ticks to a beat and t: [start, span] for a triplet.
  function upgrade(list) {
    if (!Array.isArray(list) || !list.length || list.every(function (b) { return b && Array.isArray(b.g); })) return list;
    var k = BEAT / 12;
    return list.map(function (b) {
      var o = box(b.s * k, b.d * k, b.r, b.t ? [[b.t[0] * k, b.t[1] * k, 3]] : [], b);
      if (b.r) { delete o.flam; delete o.accent; }
      return o;
    });
  }

  /* ---------- tuplets as drawn ---------- */

  // Where the direct members of a tuplet start: its own notes, and any tuplets nested in it.
  // `depth` is how many tuplets lie above; the top level (no tuplet) is chain = [].
  function members(list, chain) {
    var n = chain.length, seen = {}, out = [];
    list.forEach(function (b) {
      if (b.g.length < n || common(b.g, chain) !== n) return;
      var at = b.g.length > n ? b.g[n][0] : b.s, len = b.g.length > n ? b.g[n][1] : b.d;
      if (seen[at]) return;
      seen[at] = true;
      out.push([at, len]);
    });
    return out;
  }
  // How finely a tuplet is cut: 0 when every member sits on its n parts, 1 when on their halves...
  function fineness(list, chain) {
    var t = chain[chain.length - 1], slot = t[1] / t[2], k = 0, pts = members(list, chain);
    while (k < 6 && pts.some(function (p) { return (p[0] - t[0]) % (slot / Math.pow(2, k)) !== 0; })) k++;
    return k;
  }
  /* The number drawn over a tuplet. A triplet that fills a beat or less is written as a 6 once
     any piece of it is cut finer than its three parts (the drumline sextuplet). */
  function shown(list, chain) {
    var t = chain[chain.length - 1];
    if (t[2] !== 3 || t[1] > BEAT) return t[2];
    var slot = t[1] / 3;
    return members(list, chain).some(function (p) { return p[1] % slot !== 0 || (p[0] - t[0]) % slot !== 0; }) ? 6 : 3;
  }

  /* ---------- counts ----------
     Sixteenths "1 e + a"; triplets "1 pul let"; sextuplets "1 2 3 4 5 6" (3, 4 and 5 line up with
     the triplet's pul, the + and the triplet's let, shown as small hints); fivelets and sevenlets
     are numbered. The first note of any tuplet takes the name of the place it starts on, and the
     rest are numbered inside it, so a nested tuplet reads "2 3" under its parent's count.
     Notes smaller than a sixteenth are numbered inside their sixteenth the same way. */
  function nameAt(list, tick, chain) {
    if (!chain.length) {
      var beat = Math.floor(tick / BEAT), rel = tick - beat * BEAT, six = BEAT / 4;
      if (rel === 0) return { text: String(beat + 1), depth: 0 };
      if (rel % six === 0) return { text: ['e', '+', 'a'][rel / six - 1], depth: 0 };
      var base = tick - rel % six, grid = 2;
      members(list, []).forEach(function (p) { if (p[0] > base && p[0] < base + six && (p[0] - base) % (six / 2) !== 0) grid = 4; });
      var at = (tick - base) / (six / grid);
      return at === Math.floor(at) ? { text: String(at + 1), depth: 1 } : { text: '?', depth: 1 };
    }
    var t = chain[chain.length - 1], k = fineness(list, chain), parts = t[2] * Math.pow(2, k);
    var idx = (tick - t[0]) / (t[1] / parts);
    if (idx === 0) return nameAt(list, tick, chain.slice(0, -1));
    var wholeBeat = chain.length === 1 && t[1] === BEAT;
    if (wholeBeat && parts === 3) return { text: idx === 1 ? 'pul' : 'let', depth: 0 };
    if (wholeBeat && parts === 6) return { text: String(idx + 1), hint: { 2: 'p', 3: '+', 4: 'l' }[idx] || '', depth: 0 };
    return { text: idx === Math.floor(idx) ? String(idx + 1) : '?', depth: chain.length - 1 };
  }
  function countName(list, tick) {
    var b = list.filter(function (x) { return x.s === tick; })[0];
    return nameAt(list, tick, b ? b.g : []).text;
  }
  function counts(list, len) {
    var out = [];
    for (var beat = 0; beat < (len || BAR) / BEAT; beat++) {
      var parts = [], held = false;
      list.forEach(function (b) {
        if (b.s >= beat * BEAT && b.s < (beat + 1) * BEAT) { if (!b.r) parts.push(nameAt(list, b.s, b.g)); }
        else if (b.s < beat * BEAT && b.s + b.d > beat * BEAT && !b.r) held = true;
      });
      out.push({ parts: parts, names: parts.map(function (p) { return p.text; }), state: parts.length ? 'play' : held ? 'hold' : 'rest' });
    }
    return out;
  }

  /* ---------- engraving layout ----------
     Everything the engraver needs that is about rhythm and not about drawing:
       beams    [{ from, to, breaks: [{ after, keep }] }]   box indexes; `keep` beams continue
                across the gap after box `from + after`, the rest stop and restart
       tuplets  [{ from, to, num, occ, depth, bracket }]    outermost first
     Beams stay inside one beat and never cross a rest. Inside a tuplet longer than a beat the
     tuplet's own parts take the place of beats. Secondary beams break where a tuplet starts or
     ends, and at the eighth (or sixteenth) when the group holds 32nds (or 64ths), as engraved. */
  function beamCount(w) { return w >= 16 ? 0 : w >= 8 ? 1 : w >= 4 ? 2 : w >= 2 ? 3 : 4; }

  function unitOf(b) {
    var us = Math.floor(b.s / BEAT) * BEAT, ue = us + BEAT;
    for (var k = 0; k < b.g.length; k++) {
      var t = b.g[k], wSpan = writtenOf(t[1], b.g.slice(0, k));
      if (wSpan <= 16) break;                              // the tuplet sits inside the unit found so far
      var slot = t[1] / t[2], wSlot = wSpan / OCC[t[2]];
      var part = wSlot >= 16 ? slot : t[2] === 6 ? t[1] / 2 : (t[2] === 9 && wSlot === 8) ? t[1] / 3 : t[1];
      us = t[0] + Math.floor((b.s - t[0]) / part) * part; ue = us + part;
      if (wSlot < 16) break;
      if (wSlot > 16) {                                    // a part longer than a quarter still beams by quarters
        var q = slot / (wSlot / 16);
        us += Math.floor((b.s - us) / q) * q; ue = us + q;
      }
    }
    return [us, ue];
  }

  function layout(list) {
    var beams = [], run = null, i;
    function close() { if (run && run.to > run.from) beams.push(run); run = null; }
    for (i = 0; i < list.length; i++) {
      var b = list[i], w = written(b);
      if (b.r || w >= 16) { close(); continue; }
      var u = unitOf(b);
      if (run && (run.us !== u[0] || run.ue !== u[1])) close();
      if (!run) run = { from: i, to: i, us: u[0], ue: u[1], max: 0, breaks: [] };
      run.to = i;
      run.max = Math.max(run.max, beamCount(w));
    }
    close();

    beams.forEach(function (bm) {
      for (var j = bm.from; j < bm.to; j++) {
        var a = list[j], c = list[j + 1], tick = c.s, n = common(a.g, c.g), keep = Infinity, lim;
        [a, c].forEach(function (x) {
          if (x.g.length > n) keep = Math.min(keep, Math.max(1, beamCount(writtenOf(x.g[n][1], x.g.slice(0, n)))));
        });
        if (a.g.length === n && c.g.length === n) {
          var forced = false;
          if (n) {
            var t = a.g[n - 1], slot = t[1] / t[2], wSlot = writtenOf(t[1], a.g.slice(0, n - 1)) / OCC[t[2]], off = tick - t[0];
            if (t[2] === 9 && off % (t[1] / 3) === 0) { lim = beamCount(wSlot * 2); forced = true; }
            else if (t[2] === 6 && off % (t[1] / 2) === 0) lim = beamCount(wSlot * 2);
            else {
              var r = off % slot, us = slot, ws = wSlot;
              while (r % us !== 0) { us /= 2; ws /= 2; }
              lim = beamCount(ws);
            }
          } else {
            var o = tick - bm.us, uq = (bm.ue - bm.us) / 2, wq = 8;
            while (o % uq !== 0) { uq /= 2; wq /= 2; }
            lim = beamCount(wq);
          }
          if (lim >= 1 && (forced || bm.max >= lim + 2)) keep = Math.min(keep, lim);
        }
        if (keep < Math.min(beamCount(written(a)), beamCount(written(c)))) bm.breaks.push({ after: j - bm.from, keep: keep });
      }
    });

    var groups = {}, order = [];
    list.forEach(function (b, idx) {
      for (var k = 0; k < b.g.length; k++) {
        var key = chainKey(b.g, k + 1);
        if (!groups[key]) { groups[key] = { from: idx, to: idx, chain: b.g.slice(0, k + 1), depth: k, parent: false }; order.push(key); }
        groups[key].to = idx;
        if (b.g.length > k + 1) groups[key].parent = true;
      }
    });
    var tuplets = order.map(function (key) {
      var grp = groups[key], num = shown(list, grp.chain);
      var bm = beams.filter(function (x) { return x.from <= grp.from && x.to >= grp.to; })[0];
      var bracket = true;
      if (bm) {
        // The beam already shows the group when it is the whole beam, or when fewer beams
        // cross each of its ends than run through it. A tuplet with one nested in it, or
        // nested itself, keeps its bracket unless it has a beam to itself.
        var exact = bm.from === grp.from && bm.to === grp.to, inside = 4, k;
        for (k = grp.from; k <= grp.to; k++) inside = Math.min(inside, beamCount(written(list[k])));
        var across = function (j) {                       // beams joining box j to box j + 1
          var n = Math.min(beamCount(written(list[j])), beamCount(written(list[j + 1])));
          bm.breaks.forEach(function (br) { if (br.after === j - bm.from) n = Math.min(n, br.keep); });
          return n;
        };
        var closed = (bm.from === grp.from || across(grp.from - 1) < inside) && (bm.to === grp.to || across(grp.to) < inside);
        bracket = grp.parent || !(exact || (closed && !grp.depth));
      }
      return { from: grp.from, to: grp.to, num: num, occ: num === 6 ? 4 : OCC[num], depth: grp.depth, bracket: bracket };
    });
    return { beams: beams.map(function (x) { return { from: x.from, to: x.to, breaks: x.breaks }; }), tuplets: tuplets };
  }

  /* ---------- text and trees ---------- */

  // "q 8 r16" are plain values (r = rest); square brackets wrap a triplet, and 5[ ... ], 6[ ... ],
  // 7[ ... ] or 9[ ... ] another tuplet. Brackets can be nested.
  function parse(text) {
    var out = [], pos = 0, stack = [];
    var plain = { w: 64, hd: 48, h: 32, qd: 24, q: 16, '8d': 12, '8': 8, '16d': 6, '16': 4, '32d': 3, '32': 2, '64': 1 };
    (text.match(/[35679]?\[|\]|r?(?:w|hd|h|qd|q|8d|8|16d|16|32d|32|64)/g) || []).forEach(function (tok) {
      if (tok[tok.length - 1] === '[') { stack.push([pos, 0, tok.length > 1 ? Number(tok[0]) : 3]); return; }
      if (tok === ']') { var t = stack.pop(); if (t) t[1] = pos - t[0]; return; }
      var rest = tok[0] === 'r', d = plain[rest ? tok.slice(1) : tok] * U64;
      stack.forEach(function (t) { d = d * OCC[t[2]] / t[2]; });
      out.push({ s: pos, d: d, r: rest, g: stack.slice() });
      pos += d;
    });
    return out.map(function (b) { return box(b.s, b.d, b.r, b.g); });
  }

  // Boxes i to j as one box, or null when together they are not one plain written note.
  function joined(list, i, j) {
    var a = list[i], d = 0, g = chainCopy(a.g), k;
    for (k = i; k <= j; k++) { d += list[k].d; g = g.slice(0, common(g, list[k].g)); }
    while (g.length && a.s === g[g.length - 1][0] && d === g[g.length - 1][1]) g.pop();
    for (k = i; k <= j; k++) {                         // no tuplet may be taken in only partly
      var t = list[k].g[g.length];
      if (t && (t[0] < a.s || t[0] + t[1] > a.s + d)) return null;
    }
    var w = writtenOf(d, g);
    if (!VALUE[w] || (g.length && dotted(w))) return null;
    if (!g.length && Math.floor(a.s / BEAT) !== Math.floor((a.s + d - 1) / BEAT) && a.s % BEAT !== 0) return null;
    return box(a.s, d, a.r, g, a);
  }

  /* A beat (or any stretch) as a tree: { n, kids }. n is how many equal parts it is cut into;
     each kid is null (silence), a list of drums or `true` (a note), or another tree. Cut in 2, 4
     or 8 it stays plain; 3, 5, 7 and 9 make a tuplet; 6 is a triplet with each part halved.
     The boxes are then written the level-2 way: a note rings until the next note and rests take
     the largest value, wherever that is one written note. style 'short' keeps every note at its
     own length and only joins rests. */
  function treeBoxes(tree, start, span, style) {
    var out = [];
    (function emit(node, s, len, g) {
      var n = node.n, chain = g;
      if (n === 6) chain = g.concat([[s, len, 3]]);
      else if (OCC[n]) chain = g.concat([[s, len, n]]);
      var d = len / n;
      node.kids.forEach(function (kid, k) {
        if (kid && kid.kids) { emit(kid, s + k * d, d, chain); return; }
        var o = box(s + k * d, d, !kid, chain);
        if (Array.isArray(kid)) o.drums = kid.slice();
        out.push(o);
      });
      // "1 pul" is written as two eighths and a rest.
      if (n === 3 && !g.length && node.kids[0] && node.kids[1] && !node.kids[2] && !node.kids[0].kids && !node.kids[1].kids) out[out.length - 1].solid = true;
    })(tree, start, span, []);
    // From each box, take in as many of the rests after it as still make one written note.
    for (var i = 0; i < out.length; i++) {
      if (out[i].solid || (!out[i].r && style === 'short')) continue;
      var j = i;
      while (j + 1 < out.length && out[j + 1].r && !out[j + 1].solid) j++;
      for (; j > i; j--) {
        var one = joined(out, i, j);
        if (one) { out.splice(i, j - i + 1, one); break; }
      }
    }
    out.forEach(function (b) { delete b.solid; });
    return out;
  }

  // Figures per beat, weighted like the Written Split Quiz's level 2.
  var MASKS = {
    s: [['1111', 10], ['1011', 5], ['1101', 5], ['1110', 5], ['0111', 4], ['1010', 6], ['1001', 3],
        ['1000', 4], ['0010', 3], ['0011', 3], ['1100', 3], ['0101', 2], ['0110', 2], ['0001', 2],
        ['0100', 1], ['0000', 2]],
    t: [['111', 10], ['101', 4], ['110', 3], ['011', 3], ['001', 2], ['010', 1]],
    x: [['111111', 10], ['011111', 2], ['111110', 2], ['110110', 1], ['101101', 1], ['110111', 1], ['111011', 1]],
    5: [['11111', 10], ['01111', 2], ['11110', 2], ['10111', 1], ['11011', 1], ['11101', 1], ['10101', 1]],
    7: [['1111111', 10], ['0111111', 1], ['1111110', 2], ['1011111', 1]]
  };
  var PER_BEAT = { e: 2, s: 4, t: 3, x: 6, 5: 5, 7: 7 };
  function weighted(pairs) {
    var total = 0, i;
    for (i = 0; i < pairs.length; i++) total += pairs[i][1];
    var r = Math.random() * total;
    for (i = 0; i < pairs.length; i++) { r -= pairs[i][1]; if (r < 0) return pairs[i][0]; }
    return pairs[pairs.length - 1][0];
  }
  // One beat from a figure. grid is 'e' (eighths), 's' (sixteenths), 't' (triplets), 'x' (sextuplets),
  // '5' or '7'; mask is a string of 1s and 0s.
  function beatBoxes(grid, mask, start) {
    return treeBoxes({ n: PER_BEAT[grid], kids: mask.split('').map(function (c) { return c === '1' ? true : null; }) }, start, BEAT);
  }

  var api = {
    BEAT: BEAT, BAR: BAR, U64: U64, OCC: OCC, VALUE: VALUE, VALUE_NAME: VALUE_NAME, TUPLET_NAME: TUPLET_NAME,
    copy: copy, cut: cut, fuse: fuse, toggleRest: toggleRest, valid: valid, upgrade: upgrade,
    written: written, writtenOf: writtenOf, dur: dur, valueName: valueName, shown: shown, layout: layout,
    nameAt: nameAt, countName: countName, counts: counts, parse: parse, treeBoxes: treeBoxes,
    MASKS: MASKS, PER_BEAT: PER_BEAT, weighted: weighted, beatBoxes: beatBoxes
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RhythmModel = api;
})(typeof window !== 'undefined' ? window : this);
