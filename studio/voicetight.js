/* Tighten a voice to the beat: each entry is moved onto the nearest step of the grid (by `strength`, 0 to 1), and the
   stretch it needs is spread over the syllable that follows, with the first 30 ms (the attack) left alone. Pure and
   dependency-free so it runs in Node tests and in the page.
   tighten({x, sr, onsets, bpm, offset, N, swing, strength, maxMove}) -> {data, moves:[{from,to}], before, after}
   x is a Float32Array (mono); onsets are the entries' heard-start times in seconds (see attackTimes in studio/index.html). */
(function (root) {
  "use strict";
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const median = a => { if (!a.length) return 0; const s = a.slice().sort((p, q) => p - q); return s[Math.floor(s.length / 2)]; };

  function slotNear(t, g) {
    const step = 60 / g.bpm / (g.N / 4), k0 = Math.round((t - g.offset) / step); let best = null;
    for (let k = k0 - 1; k <= k0 + 1; k++) {
      const so = (g.N === 16 && ((k % 2) + 2) % 2 === 1) ? step * (g.swing || 0) / 100 * .5 : 0, s = g.offset + k * step + so, d = Math.abs(s - t);
      if (!best || d < best.d) best = { s, d, k };
    }
    return best;
  }

  /* waveform-similarity overlap-add: stretch x[a..b) to `len` samples without changing pitch */
  function wsola(x, a, b, len, sr) {
    const L = b - a, out = new Float32Array(len);
    if (L < 600 || len < 600) { for (let i = 0; i < len; i++) out[i] = x[Math.min(b - 1, a + Math.floor(i * L / len))]; return out; }
    const F = Math.max(256, Math.round(sr * .016) & ~1), H = F >> 1, S = Math.round(sr * .006), win = new Float32Array(F);
    for (let i = 0; i < F; i++) win[i] = .5 - .5 * Math.cos(2 * Math.PI * (i + .5) / F);
    const wsum = new Float32Array(len + F), ratio = L / len; let pos = 0, nextIn = 0;
    for (let o = 0; o < len; o += H) {
      const nominal = Math.round(o * ratio); let best = nominal;
      if (o > 0) {
        let bs = -1e30; const want = nextIn;
        for (let d = -S; d <= S; d += 2) {
          const c = nominal + d; if (c < 0 || c + F > L) continue; let s = 0;
          for (let i = 0; i < F; i += 2) s += x[a + c + i] * x[a + want + i];
          if (s > bs) { bs = s; best = c; }
        }
      }
      for (let i = 0; i < F && o + i < len + F; i++) { const v = (a + best + i < b ? x[a + best + i] : 0) * win[i]; if (o + i < out.length) out[o + i] += v; wsum[o + i] += win[i]; }
      nextIn = best + H; pos = best;
    }
    for (let i = 0; i < len; i++) out[i] = wsum[i] > 1e-4 ? out[i] / wsum[i] : 0;
    return out;
  }

  function tighten(o) {
    const x = o.x, sr = o.sr, n = x.length, g = { bpm: o.bpm, offset: o.offset, N: o.N || 16, swing: o.swing || 0 };
    const strength = clamp(o.strength == null ? 1 : o.strength, 0, 1), maxMove = o.maxMove || .09;
    /* entries, at least 70 ms apart */
    const ons = []; (o.onsets || []).slice().sort((p, q) => p - q).forEach(t => { if (t > .02 && t < n / sr - .05 && (!ons.length || t - ons[ons.length - 1] >= .07)) ons.push(t); });
    const before = ons.map(t => slotNear(t, g).d);
    if (ons.length < 3 || strength === 0) return { data: x.slice(), moves: [], before: median(before) * 1000, after: median(before) * 1000, changed: 0 };
    /* where each entry should land */
    const tgt = ons.map(t => { const sl = slotNear(t, g); return sl.d > maxMove ? t : t + strength * (sl.s - t); });
    for (let i = 1; i < tgt.length; i++) if (tgt[i] < tgt[i - 1] + .05) tgt[i] = tgt[i - 1] + .05;
    /* segment i runs from cut[i] (just before entry i) to cut[i+1] */
    const pre = ons.map((t, i) => Math.min(.02, (i ? t - ons[i - 1] : t) / 4));
    const cut = ons.map((t, i) => t - pre[i]), oPos = ons.map((t, i) => tgt[i] - pre[i]);
    const outLen = n + Math.round(sr * .5), out = new Float32Array(outLen), moves = [];
    const put = (src, at, fadeIn, fadeOut) => {
      const s0 = Math.round(at * sr);
      for (let i = 0; i < src.length; i++) { const k = s0 + i; if (k < 0 || k >= outLen) continue; let w = 1; if (i < fadeIn) w = i / fadeIn; if (src.length - i <= fadeOut) w = Math.min(w, (src.length - i) / fadeOut); out[k] += src[i] * w; }
    };
    const X = Math.round(sr * .008);
    /* the lead-in before the first entry keeps its own time, moved with the first entry */
    { const a = 0, b = Math.round(cut[0] * sr), lead = new Float32Array(b + X); lead.set(x.subarray(a, Math.min(n, b + X))); put(lead, oPos[0] - cut[0], 0, X); }
    for (let i = 0; i < ons.length; i++) {
      const a = Math.round(cut[i] * sr), b = i + 1 < ons.length ? Math.round(cut[i + 1] * sr) : n, natural = (b - a) / sr;
      const want = i + 1 < ons.length ? oPos[i + 1] - oPos[i] : natural; let r = clamp(want / natural, .85, 1.2);
      let seg;
      if (Math.abs(r - 1) < .02) seg = x.subarray(a, b);
      else { const keep = Math.min(b - a, Math.round(sr * (pre[i] + .03))), body = wsola(x, a + keep, b, Math.max(1, Math.round((b - a - keep) * r)), sr), s2 = new Float32Array(keep + body.length); s2.set(x.subarray(a, a + keep)); s2.set(body, keep); seg = s2; }
      if (i + 1 < ons.length) { const ext = x.subarray(b, Math.min(n, b + X)), s3 = new Float32Array(seg.length + ext.length); s3.set(seg); s3.set(ext, seg.length); seg = s3; }
      put(seg, oPos[i], i ? X : 0, i + 1 < ons.length ? X : 0);
      moves.push({ from: ons[i], to: tgt[i] });
    }
    const data = out.subarray(0, n).slice();
    const after = ons.map((t, i) => slotNear(tgt[i], g).d);
    return { data, moves, before: median(before) * 1000, after: median(after) * 1000, changed: ons.length };
  }

  const api = { tighten, wsola, slotNear };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.PennioVoiceTight = api;
})(typeof self !== "undefined" ? self : this);
