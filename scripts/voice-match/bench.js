/* Scores "Make a beat from my voice" against voices whose answers are known.
   1. cd scripts/voice-match && python3 synth_voices.py
   2. from the repo root: python3 -m http.server 3000   (leave running)
   3. node scripts/voice-match/bench.js            (needs Playwright)
   Reports tempo, downbeat, key (exact, or the relative major/minor that plays the same chords), feel and swing. */
const { chromium } = require("playwright"), fs = require("fs"), path = require("path");
const dir = __dirname, base = process.argv[2] || "http://localhost:3000";
const truth = JSON.parse(fs.readFileSync(path.join(dir, "voices/truth.json"), "utf8")).filter(t => !process.env.ONLY || new RegExp(process.env.ONLY).test(t.name));
const KEYN = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
(async () => {
  const b = await chromium.launch(); const rows = [];
  for (const t of truth) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript(() => { localStorage.setItem("ps.sb", JSON.stringify({ access_token: "t", refresh_token: "r", expires_at: Date.now() + 3.6e6, user: { id: "u1", email: "t@e.com" } })); localStorage.setItem("ps.profile", JSON.stringify({ name: "T", email: "t@e.com", created: Date.now(), joined: Date.now(), kit: true })); });
    await ctx.route("**/*.supabase.co/**", r => r.fulfill({ status: 200, contentType: "application/json", body: r.request().url().includes("/auth/v1/user") ? '{"id":"u1","email":"t@e.com"}' : "[]" }));
    await ctx.route("**/app.kit.com/**", r => r.fulfill({ status: 200, body: "{}" }));
    const p = await ctx.newPage(); await p.goto(base + "/studio/"); await p.waitForTimeout(2500);
    await p.evaluate(() => { const b = document.querySelector('nav button[data-v="ayan"]'); if (b) b.click(); }); await p.waitForTimeout(500); await p.evaluate(() => PennioShell.showView("voice")); await p.setInputFiles("#vfile", path.join(dir, "voices", t.name + ".wav"));
    await p.waitForFunction(() => !document.getElementById("vbeat").disabled, null, { timeout: 120000 }); await p.waitForTimeout(400);
    await p.click("#vbeat"); await p.waitForFunction(() => /Heard/.test(document.getElementById("vmeta").textContent), null, { timeout: 60000 }); await p.waitForTimeout(300);
    const o = await p.evaluate(() => ({ bpm: +document.getElementById("bpm").value, sw: +document.getElementById("swing").value, N: PennioState.N(), h: PennioState.harm(), off: PennioState.offset() }));
    const tempo = Math.abs(o.bpm - t.bpm) / t.bpm < .02, tempoE = Math.abs(o.bpm - t.bpm), feel = o.N === t.grid, down = Math.abs(o.off - t.downbeat) < .04;
    const exact = o.h.key === t.key && o.h.scale === t.mode, rel = (t.mode === "minor" && o.h.scale === "major" && o.h.key === (t.key + 3) % 12) || (t.mode === "major" && o.h.scale === "minor" && o.h.key === (t.key + 9) % 12);
    rows.push({ t, o, biasMs: (o.off - (t.pcenter || t.downbeat)) * 1000, tempo, tempoE, downE: Math.abs(o.off - t.downbeat) * 1000, tempo, feel, down, exact, rel, swE: t.grid === 16 ? Math.abs(o.sw - t.swing) : null });
    console.log(t.name.padEnd(14), `${o.bpm}/${t.bpm} BPM`, tempo ? "ok " : "BAD", `N ${o.N}/${t.grid}`, `key ${KEYN[o.h.key]} ${o.h.scale}/${KEYN[t.key]} ${t.mode}`, exact ? "exact" : rel ? "relative" : "BAD", `swing ${o.sw}/${t.swing}`, `downbeat ${o.off.toFixed(2)}/${t.downbeat}`);
    await ctx.close();
  }
  await b.close();
  const fr = rows.filter(r => r.t.bpm % 1); const avg = (a, f) => a.length ? (a.reduce((x, r) => x + f(r), 0) / a.length).toFixed(2) : "-";
  console.log(`\nfractional tempos (${fr.length}): mean tempo error ${avg(fr, r => r.tempoE)} BPM; all voices: mean tempo error ${avg(rows, r => r.tempoE)} BPM, mean downbeat error ${avg(rows, r => r.downE)} ms`);
  const sf = rows.filter(r => r.t.soft); if (sf.length) console.log(`soft-attack voices (${sf.length}): grid sits ${avg(sf, r => r.biasMs)} ms from the vowel attack on average (negative = beat lands before the voice); per voice ` + sf.map(r => r.biasMs.toFixed(0)).join(", ") + " ms");
  const n = rows.length, c = f => rows.filter(f).length, sw = rows.filter(r => r.swE != null);
  console.log(`\ntempo ${c(r => r.tempo)}/${n}   feel ${c(r => r.feel)}/${n}   downbeat ${c(r => r.down)}/${n}   key exact ${c(r => r.exact)}/${n}, relative ${c(r => !r.exact && r.rel)}/${n}   swing mean abs error ${(sw.reduce((a, r) => a + r.swE, 0) / sw.length).toFixed(1)} points`);
})();
