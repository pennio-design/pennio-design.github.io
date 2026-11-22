/* MP3 encoder in a worker, so the page never freezes while an export encodes.
   Input:  {L: Float32Array, R: Float32Array, sr, kbps, q}   (transferred). When the audio is split across workers, each piece starts a few blocks early so the filterbank is warm; the page drops those frames.
   Output: {p: 0..1} progress, then {done:true, chunks:[Uint8Array]} or {error}. */
self.window = self;
/* The version in the address matters: this file is cached on phones, and an older encoder file answers the quality argument
   by switching to mono 128 kbps. A new address cannot be served from an old copy. */
importScripts("vendor/lame.min.js?v=3");
/* Never trust the encoder blindly: encode a little silence and read the first frame header. */
function selfTest(sr) {
  const e = new lamejs.Mp3Encoder(2, sr, 192, 5), z = new Int16Array(1152), out = [];
  for (let i = 0; i < 4; i++) { const o = e.encodeBuffer(z, z); if (o.length) out.push(...o); }
  const f = e.flush(); if (f.length) out.push(...f);
  for (let p = 0; p + 4 <= out.length; p++) if ((out[p] & 255) === 255 && (out[p + 1] & 0xE0) === 0xE0) return { bitrateIndex: (out[p + 2] & 255) >> 4, mode: (out[p + 3] & 255) >> 6 };
  return null;
}
let tested = false;
self.onmessage = function (e) {
  try {
    const d = e.data, L = d.L, R = d.R, n = L.length, blk = 1152;
    if (!tested) { const h = selfTest(d.sr); if (!h || h.bitrateIndex !== 11 || h.mode === 3) throw new Error("stale-encoder"); tested = true; }
    const enc = new lamejs.Mp3Encoder(2, d.sr, d.kbps || 192, d.q == null ? 5 : d.q), out = [];
    const l = new Int16Array(blk), r = new Int16Array(blk);
    const s16 = v => Math.max(-32768, Math.min(32767, Math.round(v * 32767)));
    let last = 0;
    for (let i = 0; i < n; i += blk) {
      const m = Math.min(blk, n - i);
      for (let j = 0; j < m; j++) { l[j] = s16(L[i + j]); r[j] = s16(R[i + j]); }
      const o = enc.encodeBuffer(m < blk ? l.subarray(0, m) : l, m < blk ? r.subarray(0, m) : r);
      if (o.length) out.push(new Uint8Array(o));
      if (i - last >= blk * 400) { last = i; self.postMessage({ p: i / n }); }
    }
    const f = enc.flush(); if (f.length) out.push(new Uint8Array(f));
    self.postMessage({ done: true, chunks: out }, out.map(c => c.buffer));
  } catch (err) { self.postMessage({ error: String((err && err.message) || err) }); }
};
