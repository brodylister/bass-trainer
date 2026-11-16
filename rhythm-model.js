/* Bass Trainer: the rhythm model shared by the Rhythm Sandbox and the Split Sandbox.
   Both sandboxes cut, fuse and toggle through this one file, so their tools always match:
   a new kind of cut added here appears in both.

   Time is counted in ticks: 12 to a beat. That makes a sixteenth 3 ticks, a triplet eighth 4
   and a triplet sixteenth 2, so every length the sandboxes allow is a whole number.

   A bar is a list of boxes in time order: { s: start tick, d: length, r: is a rest,
   t: null or [start, span] of the tuplet bracket the box sits under (span 12 = a whole beat,
   span 6 = half a beat) }. Split music adds { drums: [1-5, ...], flam: true, accent: true }. */
(function (root) {
  'use strict';

  var BEAT = 12, BAR = 48;
  // Written value for each box length. Lengths inside a tuplet use their own table.
  var STRAIGHT = { 48: 'w', 36: 'hd', 24: 'h', 18: 'qd', 12: 'q', 9: '8d', 6: '8', 3: '16' };
  var TUPLET = { 8: 'q', 4: '8', 2: '16' };
  var STRAIGHT_NAME = { 48: 'whole', 36: 'dotted half', 24: 'half', 18: 'dotted quarter', 12: 'quarter', 9: 'dotted eighth', 6: 'eighth', 3: 'sixteenth' };
  var TUPLET_NAME = { 8: 'triplet quarter', 4: 'triplet eighth', 2: 'triplet sixteenth' };

  function box(s, d, r, t, from, lead) {
    var o = { s: s, d: d, r: r, t: t ? [t[0], t[1]] : null };
    if (from && from.drums) o.drums = from.drums.slice();
    // A flam or an accent belongs to the stroke, so only the first piece of a cut keeps it.
    if (from && lead !== false && !r) {
      if (from.flam) o.flam = true;
      if (from.accent) o.accent = true;
    }
    return o;
  }
  function copy(list) { return list.map(function (b) { return box(b.s, b.d, b.r, b.t, b); }); }
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
    for (var k = 0; k < n; k++) parts.push(box(b.s + k * part, part, b.r, t, b, k === 0));
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
    out.splice(i, 2, box(a.s, d, a.r, t, a));
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
    if (out[i].r) { delete out[i].flam; delete out[i].accent; }
    return { boxes: out, made: 1, at: i };
  }

  // True when the list is a legal bar of `len` ticks (a 4/4 bar unless told otherwise).
  function valid(list, len) {
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
    if (pos !== (len || BAR)) return false;
    return Object.keys(groups).every(function (k) { return groups[k] === Number(k.split(':')[1]); });
  }

  /* Counts, with the names the Written Split Quiz uses: sixteenths "1 e + a", triplets "1 pul let",
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

  // Figures per beat, weighted like the Written Split Quiz's level 2.
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
  // grid is 's' (sixteenths), 't' (triplets) or 'x' (sextuplets); mask is a string of 1s and 0s.
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

  var api = {
    BEAT: BEAT, BAR: BAR, STRAIGHT: STRAIGHT, TUPLET: TUPLET, STRAIGHT_NAME: STRAIGHT_NAME, TUPLET_NAME: TUPLET_NAME,
    copy: copy, cut: cut, fuse: fuse, toggleRest: toggleRest, isSix: isSix, valid: valid,
    countName: countName, counts: counts, parse: parse, MASKS: MASKS, weighted: weighted, beatBoxes: beatBoxes
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RhythmModel = api;
})(typeof window !== 'undefined' ? window : this);
