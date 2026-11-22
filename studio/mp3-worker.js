/* MP3 encoder in a worker, so the page never freezes while an export encodes.
   Input:  {L: Float32Array, R: Float32Array, sr, kbps, q}   (transferred). When the audio is split across workers, each piece starts a few blocks early so the filterbank is warm; the page drops those frames.
   Output: {p: 0..1} progress, then {done:true, chunks:[Uint8Array]} or {error}. */
self.window = self;
importScripts("vendor/lame.min.js");
self.onmessage = function (e) {
  try {
    const d = e.data, L = d.L, R = d.R, n = L.length, blk = 1152;
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
