/* Voice match: read a recorded voice and design a groove that fits it.
   Nothing here touches the page. It takes numbers in (pitch frames, onset times, a tempo guess) and returns a plan.
   Every figure it reports is measured from the voice; nothing is a preset label dressed up as analysis.

   What it works out:
   1. Tempo and feel: whether the voice sits on a straight sixteenth grid or a triplet (12/8) grid, and the tempo level
      that explains its onsets best (so a 12/8 phrase at 96 is not mistaken for 144 straight eighths).
   2. Swing: how far the off-beat sixteenths are pushed late, in the same units the Studio's swing control uses.
   3. Key and mode: from a tuning-corrected pitch-class profile, matched against major and minor key profiles.
   4. Chords: the progression whose chords cover the notes sung in each bar.
   5. A groove: the authored style that suits this tempo, feel, swing and mode, adapted to the voice. Drums lock to the
      voice's accents; harmony instruments leave room where the voice is busy; the talking drum answers in the rests.
   Then it scores how well the result fits. */
(function (root) {
  "use strict";
  const KS = {
    major: [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
    minor: [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
  };
  const SC = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };
  const median = a => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const mod1 = x => { x %= 1; return x < 0 ? x + 1 : x; };
  const circ = (u, c) => { const d = Math.abs(mod1(u) - c); return Math.min(d, 1 - d); };

  /* ---------- pitch classes and key ---------- */
  function chroma(frames) {
    const v = frames.filter(f => f.f > 0);
    const c = new Array(12).fill(0);
    if (!v.length) return { c, tuning: 0, n: 0, voiced: 0 };
    let sx = 0, sy = 0;
    v.forEach(f => { const m = 12 * Math.log2(f.f / 440) + 69, dev = m - Math.round(m); sx += Math.cos(2 * Math.PI * dev); sy += Math.sin(2 * Math.PI * dev); });
    const tuning = Math.atan2(sy, sx) / (2 * Math.PI); // semitones the singer sits sharp (+) or flat (-) of equal temperament
    const emax = Math.max(...v.map(f => f.e), 1e-9);
    v.forEach(f => { const m = 12 * Math.log2(f.f / 440) + 69 - tuning; c[((Math.round(m) % 12) + 12) % 12] += Math.sqrt(f.e / emax); });
    return { c, tuning, n: v.length, voiced: v.length };
  }
  function pearson(a, b) {
    const n = a.length; let ma = 0, mb = 0; for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; } ma /= n; mb /= n;
    let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; sab += x * y; saa += x * x; sbb += y * y; }
    return sab / Math.sqrt(saa * sbb + 1e-12);
  }
  function estimateKey(c) {
    const out = [];
    for (const mode of ["major", "minor"]) for (let t = 0; t < 12; t++) {
      const rot = c.map((_, i) => c[(i + t) % 12]);
      out.push({ tonic: t, mode, r: pearson(rot, KS[mode]) });
    }
    out.sort((a, b) => b.r - a.r);
    return { tonic: out[0].tonic, mode: out[0].mode, r: out[0].r, margin: out[0].r - out[1].r, runnerUp: out[1] };
  }

  /* ---------- tempo level, feel, swing ---------- */
  const g = (d, s) => Math.exp(-(d * d) / (s * s));
  function wDuple(u) { return Math.max(g(circ(u, 0), .06), .55 * g(circ(u, .5), .06), .3 * g(circ(u, .25), .06), .3 * g(circ(u, .75), .06)); }
  function wTriplet(u) { return Math.max(g(circ(u, 0), .06), .5 * g(circ(u, 1 / 3), .06), .5 * g(circ(u, 2 / 3), .06)); }
  const BASE = { duple: null, triplet: null };
  (function () { for (const k of ["duple", "triplet"]) { const f = k === "duple" ? wDuple : wTriplet; let s = 0; const n = 400; for (let i = 0; i < n; i++) s += f(i / n); BASE[k] = s / n; } })();
  function gridScore(onsets, bpm, feel) {
    const beat = 60 / bpm, f = feel === "duple" ? wDuple : wTriplet; let best = { s: -1e9, phi: 0 };
    for (let k = 0; k < 48; k++) {
      const phi = (k / 48) * beat; let s = 0;
      for (let i = 0; i < onsets.length; i++) s += f((onsets[i] - phi) / beat) - BASE[feel];
      if (s > best.s) best = { s, phi };
    }
    return best;
  }
  /* How much more of the onset mass sits on the beat than an even spread over the positions the voice actually uses would give.
     A straight 144 and a 12/8 at 96 can explain the same onsets; only the second makes its beats stand out. */
  function beatProminence(onsets, bpm, phi) {
    const beat = 60 / bpm, bins = 24, h = new Array(bins).fill(0);
    onsets.forEach(t => { h[Math.floor(mod1((t - phi) / beat + 1 / (2 * bins)) * bins) % bins]++; });
    const tot = onsets.length || 1, onBeat = h[0] / tot;
    const occupied = h.filter(x => x / tot >= .06).length || 1;
    return onBeat * occupied;
  }
  /* Straight sixteenths or triplets at this tempo? A straight grid at one tempo is the same grid as triplets at 4/3 of it,
     so the tempo level is kept from the detector (which folds octaves) and only the feel is decided: whichever grid explains
     the onsets clearly better. Ties go to straight. */
  function chooseGrid(onsets, bpm0) {
    if (onsets.length < 6) return { bpm: bpm0, feel: "duple", changed: false, note: "few onsets" };
    const d = gridScore(onsets, bpm0, "duple"), t = gridScore(onsets, bpm0, "triplet");
    const ds = d.s / onsets.length, ts = t.s / onsets.length;
    return { bpm: bpm0, feel: ts > ds + .08 ? "triplet" : "duple", changed: false, duple: ds, triplet: ts };
  }
  /* straight grid only: how far the off-beat sixteenths sit late, as the Studio's swing percentage (0 to 60) */
  function estimateSwing(onsets, bpm, downbeat) {
    const beat = 60 / bpm, dev = [];
    onsets.forEach(t => {
      const u = mod1((t - downbeat) / beat);
      if (u > .15 && u < .40) dev.push((u - .25) * 4);
      else if (u > .65 && u < .90) dev.push((u - .75) * 4);
    });
    if (dev.length < 4) return { swing: null, n: dev.length };
    return { swing: clamp(Math.round(median(dev) * 200), 0, 60), n: dev.length };
  }

  /* ---------- per-bar chord fit ---------- */
  function chooseProgression(frames, key, mode, bpm, offset, PROGS) {
    const bar = 4 * 60 / bpm, sc = SC[mode], progs = PROGS[mode];
    const bars = {};
    frames.forEach(f => {
      if (!(f.f > 0) || f.t < offset - .02) return;
      const b = Math.floor((f.t - offset) / bar), m = Math.round(12 * Math.log2(f.f / 440) + 69), pc = ((m % 12) + 12) % 12;
      (bars[b] = bars[b] || new Array(12).fill(0))[pc] += 1;
    });
    const idx = Object.keys(bars).map(Number);
    let best = { i: 0, s: -1 };
    progs.forEach((p, i) => {
      let tot = 0, all = 0;
      idx.forEach(b => {
        const deg = p.d[((b % p.d.length) + p.d.length) % p.d.length];
        const tones = [0, 2, 4].map(k => (key + sc[(deg + k) % 7]) % 12);
        bars[b].forEach((w, pc) => { all += w; if (tones.includes(pc)) tot += w; else if (sc.map(x => (key + x) % 12).includes(pc)) tot += .35 * w; });
      });
      const s = all ? tot / all : 0; if (s > best.s) best = { i, s };
    });
    return { prog: best.i, fit: best.s };
  }

  /* ---------- the analysis ---------- */
  function offsetGuess(db, beat) { let d = db; while (d - 4 * beat >= -.02) d -= 4 * beat; return d < 0 ? d + 4 * beat : d; }
  function analyse(inp) {
    const frames = inp.frames || [], dur = inp.duration || 0;
    let onsets = (inp.onsets || []).slice().sort((a, b) => a - b);
    /* timing questions (tempo level, feel, swing, grid lock) use the one detector whose delay is the same for every onset;
       mixing in voiced-run starts, which come later, would read that delay as swing */
    const timing = (inp.fluxOnsets && inp.fluxOnsets.length >= 8) ? inp.fluxOnsets.slice().sort((a, b) => a - b) : onsets;
    const ch = chroma(frames);
    /* tempo level and feel from the onsets */
    const grid = inp.fixedTempo ? { bpm: inp.bpm, feel: chooseGrid(timing, inp.bpm).feel, changed: false } : chooseGrid(timing, inp.bpm);
    let bpm = Math.round(grid.bpm), feel = grid.feel;
    /* downbeat: where bar one starts. A changed tempo level needs its own phase; otherwise keep the detector's. */
    const beat = 60 / bpm;
    let downbeat = inp.downbeat;
    if (grid.changed) { /* only when the tempo level was changed; otherwise the detector's finer downbeat stands */
      const sc = gridScore(timing, bpm, feel); let phi = sc.phi;
      const sums = [0, 1, 2, 3].map(j => { let s = 0; timing.forEach(t => { const k = Math.round((t - phi) / beat); if (((k % 4) + 4) % 4 === j && Math.abs(t - phi - k * beat) < beat * .12) s += 1; }); return s; });
      const mx = Math.max(...sums), first = timing.length ? timing[0] : 0;
      let bestT = 1e9, jj = 0; sums.forEach((s, j) => { if (s < mx * .8) return; let x = phi + j * beat; while (x + 4 * beat <= first - beat * .25) x += 4 * beat; while (x < first - beat * .25) x += 4 * beat; if (x < bestT) { bestT = x; jj = j; } });
      downbeat = phi + jj * beat;
    }
    let db = downbeat; while (db - 4 * beat >= -.02) db -= 4 * beat; if (db < 0) db += 4 * beat;
    const offset = Math.max(0, db);
    const N = feel === "triplet" ? 12 : 16, step = beat / (N / 4);
    /* key: the few best pitch-class matches, each judged again by how well a one-chord-per-bar progression fits the sung notes */
    const ranked = [];
    for (const mode of ["major", "minor"]) for (let t = 0; t < 12; t++) { const rot = ch.c.map((_, i) => ch.c[(i + t) % 12]); ranked.push({ tonic: t, mode, r: pearson(rot, KS[mode]) }); }
    ranked.sort((x, y) => y.r - x.r);
    const shortlist = ranked.filter(k => k.r >= ranked[0].r - .1).slice(0, 6);
    shortlist.forEach(k => { const pr = chooseProgression(frames, k.tonic, k.mode, bpm, offset, inp.PROGS); k.prog = pr.prog; k.fit = pr.fit; k.score = k.r + .6 * pr.fit; });
    shortlist.sort((x, y) => y.score - x.score);
    const key = { tonic: shortlist[0].tonic, mode: shortlist[0].mode, r: shortlist[0].r, margin: shortlist.length > 1 ? shortlist[0].score - shortlist[1].score : .3 };
    const sw = feel === "triplet" ? { swing: 0, n: 0 } : estimateSwing(timing, bpm, offset);
    /* tuning drums and voice to the same tonic, and chords to the melody */
    const prog = chooseProgression(frames, key.tonic, key.mode, bpm, offset, inp.PROGS);
    /* activity per grid step: how much of the voice lands there */
    const act = new Array(N).fill(0);
    onsets.forEach(t => { if (t < offset - .03) return; let k = Math.round((t - offset) / step); k = ((k % N) + N) % N; act[k]++; });
    const amax = Math.max(...act, 1); const actN = act.map(v => v / amax);
    const span = Math.max(.5, dur - offset), density = onsets.length / span;
    /* how well things fit, from the voice itself */
    let on = 0, lock = 0;
    timing.forEach(t => {
      if (t < offset - .03) return; on++;
      const k = Math.round((t - offset) / step), sOff = (feel === "duple" && k % 2 === 1) ? step * ((sw.swing || 0) / 100) * .5 : 0;
      if (Math.abs(t - offset - k * step - sOff) <= .04) lock++;
    });
    const scaleSet = SC[key.mode].map(x => (key.tonic + x) % 12);
    const totalC = ch.c.reduce((a, b) => a + b, 0) || 1, inKey = ch.c.reduce((a, w, pc) => a + (scaleSet.includes(pc) ? w : 0), 0) / totalC;
    return {
      bpm, feel, N, step, offset, swing: sw.swing, swingSamples: sw.n, key: key.tonic, mode: key.mode, keyR: key.r, keyMargin: key.margin, tuning: ch.tuning,
      prog: prog.prog, chordFit: prog.fit, act: actN, density, onsetCount: on, gridLock: on ? lock / on : 0, inKey, levelChanged: !!grid.changed, tempoGuess: inp.bpm,
      pitchFrames: ch.n, f0: median(frames.filter(f => f.f > 0).map(f => f.f)) || 200
    };
  }

  /* ---------- the groove ---------- */
  const EXTRA = [
    { name: "Slow 12/8", bpm: 84, n: 12, sw: 0, h: { scale: "minor" }, p: {
      udu: "1.....1.....", clap: "............", shek: "1.21.21.21.2", agogo: "1.1.1.1.1.1.", bata: "..1..2..1.2.", bass: "1.....2.....", keys: "2.....2.....", pluck: "..3..5..2...", dd: "............" } },
    { name: "Highlife 6/8", bpm: 100, n: 12, sw: 0, h: { scale: "major" }, p: {
      udu: "1..1..1.....", clap: "..1...1...1.", shek: "2.12.12.12.1", agogo: "1.1.11.1.1.1", bata: ".1..2..1..2.", bass: "1..2..1.3...", keys: "........2...", gtr: ".3.4.3.5.3.4", dd: "............" } }
  ];
  const L = s => s.split("").map(c => c === "." ? 0 : c === "H" ? 1 : c === "M" ? 2 : c === "L" ? 3 : +c);

  function styleOrder(a, presets) {
    const all = presets.concat(EXTRA.map(e => Object.assign({}, e, { p: Object.fromEntries(Object.entries(e.p).map(([k, v]) => [k, L(v)])) })));
    return all.filter(p => p.n === a.N).map(p => ({
      p, score: 1.6 * Math.abs(Math.log2(a.bpm / p.bpm)) + Math.abs((a.swing == null ? p.sw : a.swing) - p.sw) / 45 + (p.h.scale === a.mode ? 0 : .35)
    })).sort((x, y) => x.score - y.score);
  }
  function design(a, presets, variant, syl) {
    const N = a.N, order = styleOrder(a, presets), pick = order[(variant || 0) % order.length].p;
    const lane = id => { const src = pick.p[id]; const o = new Array(N).fill(0); if (src) for (let i = 0; i < N; i++) o[i] = src[i] || 0; return o; };
    const ids = ["dd", "bata", "agogo", "shek", "udu", "duru", "clap", "bass", "keys", "gtr", "pluck", "flute", "reed"];
    const p = {}; ids.forEach(id => p[id] = lane(id));
    const act = a.act, busy = s => act[s] >= .45, rest = s => act[s] === 0;
    const half = N / 2, strong = s => s % (N / 4) === 0;
    const changes = [];
    /* harmony and melody lanes leave room where the voice is busy */
    ["keys", "gtr", "pluck", "flute", "reed"].forEach(id => { for (let s = 0; s < N; s++) if (p[id][s] && busy(s) && s !== 0) { p[id][s] = 0; changes.push(id + " leaves step " + (s + 1)); } });
    if (!p.keys.some(Boolean)) { [0, half].forEach(s => { if (!busy(s) || s === 0) p.keys[s] = 2; }); }
    /* drums lock to the voice's strongest accents */
    const accents = act.map((v, s) => ({ v, s })).filter(x => x.v >= .6 && x.s !== 0 && x.s !== half).sort((x, y) => y.v - x.v).slice(0, 2);
    accents.forEach(({ s }) => { if (!p.udu[s] && !p.bata[s] && !p.agogo[s]) { if (strong(s)) p.udu[s] = 1; else p.bata[s] = 2; changes.push("drum locks to step " + (s + 1)); } });
    /* a busy voice gets space; a sparse one gets fills */
    if (a.density > 3.4) { for (let s = 0; s < N; s++) if (p.bata[s] && busy(s) && !strong(s)) p.bata[s] = 0; if (N === 16) for (let s = 1; s < N; s += 2) if (p.shek[s] === 1) p.shek[s] = 0; }
    if (a.density < 1.4) { let n = 0; for (let s = N - 1; s > 0 && n < 2; s--) if (rest(s) && !p.bata[s] && !strong(s)) { p.bata[s] = 1; n++; } }
    /* the bass sits on the kick */
    for (let s = 0; s < N; s++) if (p.udu[s] === 1 && !p.bass[s]) p.bass[s] = 1;
    /* the talking drum answers with the voice's own tones where the voice rests */
    const tones = (syl || []).slice(0, 4);
    if (tones.length) {
      let bs = half, bq = 1e9; for (let st = Math.floor(N / 2); st <= N - 4; st++) { let q = 0; for (let k = 0; k < 4; k++) q += act[st + k]; if (q < bq) { bq = q; bs = st; } }
      p.dd = new Array(N).fill(0); tones.forEach((t, i) => { if (bs + i < N) p.dd[bs + i] = t; });
    }
    return { pattern: p, style: pick.name, order: order.map(o => o.p.name), changes };
  }

  /* how much of the groove lines up with the voice, from the final pattern */
  function match(a, pattern) {
    const N = a.N, act = a.act, perc = ["udu", "bata", "agogo", "clap"];
    const top = act.map((v, s) => ({ v, s })).filter(x => x.v > 0).sort((x, y) => y.v - x.v).slice(0, 3);
    const locked = top.filter(x => perc.some(id => pattern[id] && pattern[id][x.s])).length;
    return { accentLock: top.length ? locked / top.length : 0, locked, total: top.length, topAccents: top.map(x => x.s) };
  }

  const api = { gridScore, beatProminence, analyse, design, match, chroma, estimateKey, chooseGrid, estimateSwing, chooseProgression, EXTRA, SC };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.PennioVoiceBeat = api;
})(typeof window !== "undefined" ? window : globalThis);
