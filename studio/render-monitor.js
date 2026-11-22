/* PENNIO Studio render monitor.
   Measures every render and export, checks the audio against quality gates, and keeps a small history so speed
   and quality can be watched over time. Audio is never stored, only numbers.

   Use:  const run = PennioRender.begin({kind:"export", fmt:"mp3", expectedSec, targetLufs});
         const buf = await run.stage("render", "Render mix", () => renderMix());
         ...
         const report = run.finish({buf, lufs, matched, verify});   // verdict + gates + log entry
*/
(function () {
  "use strict";
  const KEY = "ps.render.log.v1", MAX = 30;
  const dB = x => 20 * Math.log10(Math.max(x, 1e-10));
  const load = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
  const save = a => { try { localStorage.setItem(KEY, JSON.stringify(a.slice(-MAX))); } catch (e) {} };

  /* how long did the page freeze while this ran (Chromium long tasks, 50 ms and up) */
  let longMax = 0, longCount = 0, po = null;
  try { po = new PerformanceObserver(l => { for (const e of l.getEntries()) { longMax = Math.max(longMax, e.duration); longCount++; } }); po.observe({ entryTypes: ["longtask"] }); } catch (e) { po = null; }

  /* one pass over the samples */
  function analyze(buf) {
    const ch = buf.numberOfChannels, n = buf.length, sr = buf.sampleRate, d = [];
    for (let c = 0; c < ch; c++) d.push(buf.getChannelData(c));
    const win = Math.max(1, Math.round(sr * 0.1)), wins = Math.ceil(n / win), wr = new Float64Array(wins);
    let peak = 0, sumsq = 0, sum = 0, clipped = 0, nan = 0, sl = 0, sr2 = 0, slr = 0;
    for (let c = 0; c < ch; c++) {
      const x = d[c];
      for (let i = 0; i < n; i++) {
        const v = x[i];
        if (v !== v || v === Infinity || v === -Infinity) { nan++; continue; }
        const a = v < 0 ? -v : v;
        if (a > peak) peak = a;
        if (a >= 0.9995) clipped++;
        sumsq += v * v; sum += v; wr[(i / win) | 0] += v * v;
      }
    }
    if (ch > 1) { const L = d[0], R = d[1]; for (let i = 0; i < n; i++) { const l = L[i], r = R[i]; sl += l * l; sr2 += r * r; slr += l * r; } }
    const tot = n * ch;
    const winDb = Array.from(wr, (s, i) => dB(Math.sqrt(s / (Math.min(win, n - i * win) * ch))));
    const active = winDb.filter(v => v > -60).length, silenceRatio = wins ? 1 - active / wins : 1;
    let lead = 0; while (lead < wins && winDb[lead] <= -60) lead++;
    let trail = 0; while (trail < wins && winDb[wins - 1 - trail] <= -60) trail++;
    /* inter-sample (true) peak: 4x cubic interpolation around the loudest samples only */
    let tp = peak;
    if (peak > 0.5) {
      const thr = peak * 0.8; let checked = 0;
      for (let c = 0; c < ch && checked < 40000; c++) {
        const x = d[c];
        for (let i = 1; i < n - 2 && checked < 40000; i++) {
          if ((x[i] < 0 ? -x[i] : x[i]) < thr) continue; checked++;
          const p0 = x[i - 1], p1 = x[i], p2 = x[i + 1], p3 = x[i + 2];
          for (let k = 1; k < 4; k++) {
            const t = k / 4, t2 = t * t, t3 = t2 * t;
            const v = 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
            const a = v < 0 ? -v : v; if (a > tp) tp = a;
          }
        }
      }
    }
    const rms = Math.sqrt(sumsq / Math.max(1, tot));
    return {
      sr, len: n, sec: n / sr, ch, peak, peakDb: dB(peak), truePeakDb: dB(tp), rmsDb: dB(rms), crestDb: dB(peak) - dB(rms),
      dc: sum / Math.max(1, tot), clipped, nan, silenceRatio, leadMs: Math.round(lead * 100), trailMs: Math.round(trail * 100),
      corr: ch > 1 && sl > 0 && sr2 > 0 ? slr / Math.sqrt(sl * sr2) : 1
    };
  }

  /* quality and speed gates. level: pass | warn | fail. Failing a "block" gate stops the export. */
  function gates(m, c) {
    const g = [];
    const add = (id, label, level, value, limit, block, perf) => g.push({ id, label, level, value, limit, block: !!block, perf: !!perf });
    add("finite", "No corrupt samples", m.nan === 0 ? "pass" : "fail", m.nan + " bad", "0", true);
    const lufsOk = c.lufs == null || c.lufs > -45;
    add("audible", "Audible", m.silenceRatio < 0.9 && m.peakDb > -50 && lufsOk ? "pass" : "fail", Math.round((1 - m.silenceRatio) * 100) + "% active", "10% or more", true);
    add("clip", "No clipping", m.clipped === 0 ? "pass" : m.clipped <= 3 ? "warn" : "fail", m.clipped + " samples", "0");
    add("tp", "True peak", m.truePeakDb <= -1 ? "pass" : m.truePeakDb <= -0.3 ? "warn" : "fail", m.truePeakDb.toFixed(1) + " dBTP", "-1.0 or lower");
    if (c.matched && c.lufs != null) { const e = Math.abs(c.lufs - c.targetLufs); add("lufs", "Loudness on target", e <= 1 ? "pass" : e <= 2 ? "warn" : "fail", c.lufs.toFixed(1) + " LUFS", c.targetLufs + " ±1"); }
    else if (c.lufs != null) add("lufs", "Loudness", "pass", c.lufs.toFixed(1) + " LUFS", "info");
    if (c.expectedSec) { const e = Math.abs(m.sec - c.expectedSec); add("dur", "Length is right", e <= 0.05 ? "pass" : e <= 0.25 ? "warn" : "fail", m.sec.toFixed(2) + " s", c.expectedSec.toFixed(2) + " s"); }
    add("dc", "No DC offset", Math.abs(m.dc) <= 0.002 ? "pass" : Math.abs(m.dc) <= 0.01 ? "warn" : "fail", m.dc.toExponential(1), "0.002 or less");
    add("phase", "Mono safe", m.corr >= -0.2 ? "pass" : m.corr >= -0.5 ? "warn" : "fail", "corr " + m.corr.toFixed(2), "-0.2 or more");
    if (c.rtfRender != null) add("speed", "Render speed", c.rtfRender >= 5 ? "pass" : c.rtfRender >= 2 ? "warn" : "fail", c.rtfRender.toFixed(1) + "x real time", "5x or more", false, true);
    if (c.rtfTotal != null) add("total", "Whole export speed", c.rtfTotal >= 2.5 ? "pass" : c.rtfTotal >= 1 ? "warn" : "fail", c.rtfTotal.toFixed(1) + "x real time", "2.5x or more", false, true);
    if (c.longMaxMs != null) add("freeze", "Page stayed responsive", c.longMaxMs <= 200 ? "pass" : c.longMaxMs <= 500 ? "warn" : "fail", Math.round(c.longMaxMs) + " ms longest freeze", "200 ms or less", false, true);
    if (c.tags) add("tags", "Credits and cover art", c.tags.ok ? "pass" : "fail", c.tags.ok ? "title, credits and cover written" : "missing from the file", "in every file", true);
    if (c.verify) add("file", "File verified", c.verify.ok ? "pass" : "fail", c.verify.note, "decodes and matches", true);
    return g;
  }
  const verdictOf = g => g.some(x => x.level === "fail") ? "fail" : g.some(x => x.level === "warn") ? "warn" : "pass";

  let cur = null;
  const emit = () => { try { window.dispatchEvent(new CustomEvent("pennio:render", { detail: cur })); } catch (e) {} };

  function begin(meta) {
    longMax = 0; longCount = 0;
    const run = { id: Date.now().toString(36), meta: Object.assign({}, meta), stages: [], t0: performance.now(), t1: null, state: "running", gates: [], verdict: null, metrics: null };
    cur = run;
    run.stage = async (name, label, fn) => {
      const s = { name, label, ms: null, state: "running" }; run.stages.push(s); emit(); run.cur = s; s.p = 0; try { const h = window.PennioRender && window.PennioRender.onStage; if (h) h(label, overall(run)); } catch (e) {}
      const t = performance.now();
      try { const r = await fn(); s.ms = performance.now() - t; s.state = "done"; emit(); return r; }
      catch (e) { s.ms = performance.now() - t; s.state = "fail"; s.err = String((e && e.message) || e); emit(); throw e; }
    };
    run.progress = f => {
      const s = run.cur; if (!s || s.state !== "running") return;
      s.p = Math.max(0, Math.min(1, +f || 0));
      const now = performance.now(); if (now - (run.lastEmit || 0) < 90 && s.p < 1) return; run.lastEmit = now;
      emit(); try { const h = window.PennioRender && window.PennioRender.onStage; if (h) h(s.label || s.name, overall(run)); } catch (e) {}
    };
    run.finish = info => {
      run.t1 = performance.now(); run.state = "done";
      const totalMs = run.t1 - run.t0, st = n => (run.stages.find(s => s.name === n) || {}).ms;
      const m = info.metrics || (info.buf ? analyze(info.buf) : null); run.metrics = m;
      const sec = info.sec || (m && m.sec) || run.meta.expectedSec || 0;
      const rtfRender = st("render") ? sec / (st("render") / 1000) : null, rtfTotal = totalMs ? sec / (totalMs / 1000) : null;
      run.speed = { totalMs, rtfRender, rtfTotal, longMaxMs: po ? longMax : null, longCount };
      run.gates = m ? gates(m, { expectedSec: run.meta.expectedSec, lufs: info.lufs, targetLufs: run.meta.targetLufs, matched: !!info.matched, rtfRender, rtfTotal, longMaxMs: po ? longMax : null, verify: info.verify, tags: info.tags }) : [];
      run.verdict = verdictOf(run.gates.filter(x => !x.perf)); run.perfVerdict = verdictOf(run.gates.filter(x => x.perf));
      run.blocked = run.gates.some(x => x.block && x.level === "fail");
      run.info = { lufsBefore: info.lufsBefore, lufs: info.lufs, fixed: !!info.fixed, bytes: info.bytes };
      const entry = {
        ts: Date.now(), kind: run.meta.kind, fmt: run.meta.fmt, sec: +sec.toFixed(2), bpm: run.meta.bpm, bars: run.meta.bars,
        ms: Object.fromEntries(run.stages.map(s => [s.name, Math.round(s.ms || 0)])), total: Math.round(totalMs),
        rtfRender: rtfRender && +rtfRender.toFixed(1), rtfTotal: rtfTotal && +rtfTotal.toFixed(1), freeze: po ? Math.round(longMax) : null,
        lufs: info.lufs != null ? +info.lufs.toFixed(1) : null, tp: m ? +m.truePeakDb.toFixed(1) : null, clipped: m ? m.clipped : null,
        verdict: run.verdict, perf: run.perfVerdict, bad: run.gates.filter(x => x.level !== "pass").map(x => x.id), fixed: !!info.fixed, blocked: run.blocked, bytes: info.bytes || null
      };
      const a = load(); a.push(entry); save(a); run.entry = entry;
      emit(); return run;
    };
    run.fail = err => { run.t1 = performance.now(); run.state = "error"; run.verdict = "fail"; run.error = String((err && err.message) || err); const a = load(); a.push({ ts: Date.now(), kind: run.meta.kind, fmt: run.meta.fmt, verdict: "fail", error: run.error, total: Math.round(run.t1 - run.t0) }); save(a); emit(); return run; };
    emit(); return run;
  }

  function summary() {
    const a = load().filter(x => x.verdict), n = a.length;
    const med = k => { const v = a.map(x => x[k]).filter(x => x != null).sort((p, q) => p - q); return v.length ? v[Math.floor(v.length / 2)] : null; };
    const p95 = k => { const v = a.map(x => x[k]).filter(x => x != null).sort((p, q) => p - q); return v.length ? v[Math.min(v.length - 1, Math.floor(v.length * 0.95))] : null; };
    return { runs: n, perfWarn: a.filter(x => x.perf && x.perf !== "pass").length, pass: a.filter(x => x.verdict === "pass").length, warn: a.filter(x => x.verdict === "warn").length, fail: a.filter(x => x.verdict === "fail").length,
      medianRtf: med("rtfTotal"), medianTotalMs: med("total"), p95TotalMs: p95("total"), worstFreezeMs: Math.max(0, ...a.map(x => x.freeze || 0)) };
  }

  function text(run) {
    run = run || cur; if (!run) return "";
    const L = ["PENNIO Studio render report", "Verdict: " + String(run.verdict).toUpperCase() + (run.fixed ? " (auto-corrected)" : ""), ""];
    run.stages.forEach(s => L.push((s.label || s.name).padEnd(18) + (s.ms != null ? Math.round(s.ms) + " ms" : "…") + (s.state === "fail" ? "  FAILED " + (s.err || "") : "")));
    if (run.speed) L.push("", "Total " + Math.round(run.speed.totalMs) + " ms, " + (run.speed.rtfTotal ? run.speed.rtfTotal.toFixed(1) : "?") + "x real time, longest page freeze " + (run.speed.longMaxMs == null ? "n/a" : Math.round(run.speed.longMaxMs) + " ms"));
    L.push("", "Quality: " + String(run.verdict).toUpperCase() + "   Performance: " + String(run.perfVerdict).toUpperCase(), "");
    run.gates.forEach(g => L.push((g.level === "pass" ? "PASS " : g.level === "warn" ? "WARN " : "FAIL ") + g.label.padEnd(26) + g.value + "  (limit " + g.limit + ")"));
    if (run.error) L.push("", "Error: " + run.error);
    return L.join("\n");
  }

  /* small live panel */
  /* how much of an export each stage is worth, so one bar can run across all of them */
  const WEIGHT = { render: .46, match: .12, meter: .08, check: .04, encode: .22, tags: .04, verify: .04 };
  const overall = run => {
    let done = 0, total = 0; const planned = ["render", "match", "check", "encode", "tags", "verify"];
    const names = planned.concat(run.stages.some(s => s.name === "meter") ? ["meter"] : []);
    names.forEach(n => { total += WEIGHT[n]; });
    run.stages.forEach(s => { const w = WEIGHT[s.name] || 0; if (!names.includes(s.name)) return; done += s.state === "done" ? w : s.state === "running" ? w * (s.p || 0) : 0; });
    return total ? Math.min(1, done / total) : 0;
  };
  function mount(root) {
    const esc = s => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    const word = { pass: "Ready", warn: "Ready, with notes", fail: "Needs attention" };
    function paint(run) {
      if (!run) return;
      root.hidden = false; root.dataset.state = run.state === "running" ? "running" : run.verdict || "fail";
      const pct = run.state === "running" ? Math.round(overall(run) * 100) : 100;
      const head = run.state === "running" ? "Working " + pct + "%" : run.state === "error" ? "Render failed" : word[run.verdict] + (run.fixed ? " (auto-corrected)" : "");
      const total = run.speed ? Math.round(run.speed.totalMs) + " ms" : "";
      const sum = summary();
      root.innerHTML =
        (run.state === "running" ? '<div class="rm-bar" role="progressbar" aria-label="Export progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><i style="width:' + pct + '%"></i></div>' : '') +
        '<div class="rm-head"><b role="status" aria-live="polite">' + esc(head) + '</b><span>' + esc(total) + '</span></div>' +
        '<ol class="rm-stages">' + run.stages.map(s => '<li class="' + s.state + '"><span>' + esc(s.label || s.name) + '</span><em>' + (s.ms != null ? Math.round(s.ms) + ' ms' : (s.p > 0 ? Math.round(s.p * 100) + '%' : '…')) + '</em></li>').join("") + '</ol>' +
        (run.gates.length ? '<div class="rm-gates">' + run.gates.map(g => '<span class="rm-chip ' + g.level + (g.perf ? ' perf' : '') + '" title="' + esc(g.label + ": " + g.value + " (limit " + g.limit + ")") + '">' + esc(g.label) + '</span>').join("") + '</div>' : "") +
        (run.state !== "running" ? '<div class="rm-foot"><small>' + (sum.runs ? sum.runs + ' runs, ' + sum.pass + ' passed' + (sum.medianRtf ? ', median ' + sum.medianRtf + 'x real time' : '') : '') + '</small><span><button type="button" class="rm-btn" data-rm="copy">Copy report</button><button type="button" class="rm-btn" data-rm="log">Log</button></span></div>' : "");
    }
    root.addEventListener("click", e => {
      const b = e.target.closest("[data-rm]"); if (!b) return;
      if (b.dataset.rm === "copy") { try { navigator.clipboard.writeText(text()); b.textContent = "Copied"; setTimeout(() => (b.textContent = "Copy report"), 1400); } catch (x) {} }
      if (b.dataset.rm === "log") { const url = URL.createObjectURL(new Blob([JSON.stringify({ summary: summary(), runs: load() }, null, 2)], { type: "application/json" })); const a = document.createElement("a"); a.href = url; a.download = "pennio-render-log.json"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1500); }
    });
    window.addEventListener("pennio:render", e => paint(e.detail));
  }

  window.PennioRender = { progress: f => { if (cur && cur.progress) cur.progress(f); }, begin, analyze, gates, summary, text, mount, log: load, clear: () => save([]), last: () => cur };
})();
