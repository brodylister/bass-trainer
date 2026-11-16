/* Bass Trainer: the sound of a five-drum bassline.

   Tuning, bottom to top: D2 A2 D3 F#3 A3 (bass 5 to bass 1). Dry, muffled, mostly
   fundamental, with a soft beater attack. Sustain shortens by the same ratio from each
   drum to the next one up; attack and brightness rise evenly toward bass 1.

   Each drum's stroke is computed once into a buffer, so playing a note is only
   "start this buffer at this time". That keeps timing sample-accurate and cheap on phones.

   In a page:
     var line = BassVoice.create(audioContext);   // builds the five buffers
     line.output.connect(audioContext.destination);
     line.play([3], when);                         // bass 3
     line.play([1, 2, 3, 4, 5], when);             // unison
     line.play([2], when, { gain: 1.6 });          // louder (an accent), or quieter below 1
   A changed drum, for the Discrepancy Quiz: line.variant(bass, { sustain: 2 }) returns a
   buffer that rings twice as long; pass it as { buffers: { 3: thatBuffer } } to play().
   With no options the sound is exactly the approved one. */
(function (root) {
  'use strict';

  // Settings are written as [bass 5, bass 1]; the drums between are spaced evenly.
  var VOICE = {
    pitch: { 5: 73.42, 4: 110.00, 3: 146.83, 2: 185.00, 1: 220.00 },   // Hz
    decay: [85, 410],        // dB per second, spaced by ratio (each drum rings ~2/3 as long as the one below)
    glide: [0.10, 0.05],     // how sharp the stroke starts before settling, as a fraction of pitch
    glideTime: 0.012,        // seconds
    rise: 0.003,             // seconds to full volume
    // Tones above the pitch. ratio is a multiple of the pitch, level is dB as [bass 5, bass 1],
    // decayFactor is how many times faster than the pitch it dies away.
    overtones: [
      { ratio: 1.59, level: [-12, -12], decayFactor: 2 }
    ],
    // Experiment (16 Nov), off unless added to the list above: three higher tones found,
    // with some noise, in the reference recording.
    experimentalOvertones: [
      { ratio: 2.70, level: [-18, -12], decayFactor: 2.5 },
      { ratio: 3.45, level: [-24, -20], decayFactor: 3.0 },
      { ratio: 4.50, level: [-27, -23], decayFactor: 3.5 }
    ],
    warmth: 0.7,             // soft saturation; 0 is none, 1.6 already sounds like a string
    thump: [-25, -20],       // dB, low-mid beater noise (300-1100 Hz), 10 ms
    click: [-46, -32],       // dB, high beater noise
    clickHz: [1800, 4500],
    clickMs: [6, 4],
    level: { 5: -2.5, 4: -1.75, 3: -1.0, 2: -0.25, 1: 0.5 },   // dB, single hits
    unisonLift: { 5: 0, 4: 0, 3: 0, 2: 1.5, 1: 2.0 },          // extra dB when all five play together
    headroom: 0.42,          // into the soft clip, so a unison stays clean
    outLevel: 0.8
  };

  function db(x) { return Math.pow(10, x / 20); }
  function lerp(pair, u) { return pair[0] + (pair[1] - pair[0]) * u; }

  // Repeatable noise, so every visitor and every render gets the same drum.
  function noise(n) {
    var a = 7, out = new Float32Array(n), t;
    for (var i = 0; i < n; i++) {
      a = (a + 0x6D2B79F5) | 0;
      t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      out[i] = ((t ^ (t >>> 14)) >>> 0) / 2147483648 - 1;
    }
    return out;
  }

  // Band-pass (two passes of a standard two-pole filter), then scaled to unit loudness
  // so the dB levels above mean what they say.
  function bandpass(x, lo, hi, sr) {
    var f0 = Math.sqrt(lo * hi), q = f0 / (hi - lo);
    var w = 2 * Math.PI * f0 / sr, alpha = Math.sin(w) / (2 * q), a0 = 1 + alpha;
    var b0 = alpha / a0, b2 = -alpha / a0, a1 = -2 * Math.cos(w) / a0, a2 = (1 - alpha) / a0;
    var y = new Float32Array(x), pass, i, x1, x2, y1, y2, v;
    for (pass = 0; pass < 2; pass++) {
      x1 = x2 = y1 = y2 = 0;
      for (i = 0; i < y.length; i++) {
        v = b0 * y[i] + b2 * x2 - a1 * y1 - a2 * y2;
        x2 = x1; x1 = y[i]; y2 = y1; y1 = v; y[i] = v;
      }
    }
    var m = Math.min(y.length, Math.round(0.045 * sr)), sum = 0;
    for (i = 0; i < m; i++) sum += y[i] * y[i];
    var k = 1 / Math.sqrt(sum / m);
    for (i = 0; i < y.length; i++) y[i] *= k;
    return y;
  }

  // One stroke on bass 1-5 as raw samples, before its level is applied.
  // mods (optional) changes one drum's sound: sustain multiplies how long it rings,
  // overtone and attack scale the tones above the pitch and the beater noise (1 = unchanged).
  function renderHit(bass, sr, mods) {
    var u = (5 - bass) / 4;                      // 0 at bass 5, 1 at bass 1, like the settings
    var f0 = VOICE.pitch[bass];
    var rate = Math.exp(lerp([Math.log(VOICE.decay[0]), Math.log(VOICE.decay[1])], u));
    if (mods && mods.sustain) rate = rate / mods.sustain;
    var n = Math.round(sr * Math.min(1.2, 70 / rate));
    var out = new Float32Array(n);
    var src = noise(n);
    var thump = bandpass(src, 300, 1100, sr);
    var hz = lerp(VOICE.clickHz, u);
    var click = bandpass(src, hz * 0.6, hz * 1.6, sr);
    var glide = lerp(VOICE.glide, u), thumpAmp = db(lerp(VOICE.thump, u)), clickAmp = db(lerp(VOICE.click, u));
    var clickTime = lerp(VOICE.clickMs, u) / 1000;
    if (mods && mods.attack !== undefined) { thumpAmp *= mods.attack; clickAmp *= mods.attack; }
    var otScale = mods && mods.overtone !== undefined ? mods.overtone : 1;
    var ots = VOICE.overtones.map(function (o) {
      return { w: 2 * Math.PI * o.ratio * f0, amp: db(lerp(o.level, u)) * otScale, rate: rate * o.decayFactor };
    });
    var warm = VOICE.warmth, warmNorm = warm ? Math.tanh(warm) : 1;
    var phase = 0, i, k, t, rise, tone;
    for (i = 0; i < n; i++) {
      t = i / sr;
      rise = Math.min(t / VOICE.rise, 1);
      phase += 2 * Math.PI * f0 * (1 + glide * Math.exp(-t / VOICE.glideTime)) / sr;
      tone = Math.sin(phase) * Math.pow(10, -rate * t / 20);
      for (k = 0; k < ots.length; k++) tone += Math.sin(ots[k].w * t) * Math.pow(10, -ots[k].rate * t / 20) * ots[k].amp;
      tone *= rise;
      if (warm) tone = Math.tanh(warm * tone) / warmNorm;
      out[i] = tone + thump[i] * Math.exp(-t / 0.010) * thumpAmp + click[i] * Math.exp(-t / clickTime) * clickAmp;
    }
    return out;
  }

  // The volume of one drum inside a stroke: single-hit level, plus the lift when all five play.
  function gainFor(bass, howMany) {
    return db(VOICE.level[bass] + (howMany === 5 ? VOICE.unisonLift[bass] : 0));
  }

  // The output stage: headroom, a gentle soft clip, then the final level.
  function master(x) { return Math.tanh(x * VOICE.headroom) * VOICE.outLevel; }

  function create(ctx) {
    var buffers = {}, bass, data, buf;
    for (bass = 1; bass <= 5; bass++) {
      data = renderHit(bass, ctx.sampleRate);
      buf = ctx.createBuffer(1, data.length, ctx.sampleRate);
      buf.getChannelData(0).set(data);
      buffers[bass] = buf;
    }
    // input -> soft clip -> output. The curve spans inputs of -4..4 so a unison never hits its ends.
    var input = ctx.createGain(), shaper = ctx.createWaveShaper(), output = ctx.createGain();
    var N = 4097, curve = new Float32Array(N), SPAN = 4, i;
    for (i = 0; i < N; i++) curve[i] = Math.tanh((i / (N - 1) * 2 - 1) * SPAN);
    input.gain.value = VOICE.headroom / SPAN;
    shaper.curve = curve;
    output.gain.value = VOICE.outLevel;
    input.connect(shaper); shaper.connect(output);

    function toBuffer(data) {
      var b = ctx.createBuffer(1, data.length, ctx.sampleRate);
      b.getChannelData(0).set(data);
      return b;
    }
    // A buffer for one drum with its sound changed (see renderHit). Built once and kept.
    var variants = {};
    function variant(bass, mods) {
      var key = bass + ':' + JSON.stringify(mods);
      if (!variants[key]) variants[key] = toBuffer(renderHit(bass, ctx.sampleRate, mods));
      return variants[key];
    }

    // Play the listed drums (1-5) together at time `when` on the audio clock.
    // opts (optional): gain multiplies the volume; of is how many drums the stroke counts as
    // (for the unison lift when its drums are scheduled one by one); buffers swaps in variants.
    // Returns the started sources, so a player can stop strokes that have not sounded yet.
    function play(drums, when, opts) {
      opts = opts || {};
      return drums.map(function (b) {
        var src = ctx.createBufferSource(), g = ctx.createGain();
        src.buffer = (opts.buffers && opts.buffers[b]) || buffers[b];
        g.gain.value = gainFor(b, opts.of || drums.length) * (opts.gain === undefined ? 1 : opts.gain);
        src.connect(g); g.connect(input);
        src.start(Math.max(when, 0));
        return src;
      });
    }
    return { output: output, play: play, variant: variant };
  }

  var api = { VOICE: VOICE, create: create, renderHit: renderHit, gainFor: gainFor, master: master };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BassVoice = api;
})(typeof window !== 'undefined' ? window : this);
