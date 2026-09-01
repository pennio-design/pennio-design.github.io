#!/usr/bin/env node
/**
 * WCAG 2.1 AA contrast audit, run against a local static server in both themes.
 *
 *   python3 -m http.server 3000
 *   node scripts/contrast-audit.js
 *
 * Requires Playwright (see scripts/README.md). Set PW_EXE to a Chromium binary
 * when the installed Playwright pins a revision that is not present.
 *
 * Two details make the numbers trustworthy:
 *  - Effective background is composited up the ancestor chain, so translucent
 *    layers report the colour a reader actually sees.
 *  - A gradient is resolved to its first colour stop. Without that, any element
 *    over a gradient falls through to the page default and reports nonsense.
 *
 * Thresholds are 4.5:1 for body text and 3:1 for large text, where large means
 * >= 24px, or >= 18.66px when bold.
 */
const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';
const PAGES = [['/', 'index'], ['/audit/', 'audit'], ['/letscreate/', 'letscreate']];

const PROBE = () => {
  const parse = (c) => {
    const m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
    return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null;
  };
  const over = (fg, bg) => ({            // composite fg (with alpha) onto bg
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1]; return (hi + 0.05) / (lo + 0.05); };

  // Effective background: composite every translucent layer up to the root.
  const effBg = (el) => {
    const layers = [];
    let n = el, gradient = false;
    while (n) {
      const cs = getComputedStyle(n);
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a === 1) break; }
      // A gradient paints an opaque layer that background-color does not report.
      // Use its first colour stop instead of falling through to the page default.
      if (cs.backgroundImage && cs.backgroundImage !== 'none') {
        const stop = cs.backgroundImage.match(/rgba?\([^)]+\)/);
        if (stop) {
          const sc = parse(stop[0]);
          if (sc && sc.a > 0) { gradient = true; layers.push({ ...sc, a: 1 }); break; }
        }
      }
      n = n.parentElement;
    }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
    return { color: base, gradient };
  };

  const out = [];
  const seen = new Set();
  for (const el of document.querySelectorAll('*')) {
    const hasText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (!hasText) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;

    const fgRaw = parse(cs.color); if (!fgRaw) continue;
    const { color: bg, gradient } = effBg(el);
    const fg = fgRaw.a < 1 ? over(fgRaw, bg) : fgRaw;

    const size = parseFloat(cs.fontSize);
    const weight = parseInt(cs.fontWeight, 10) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const need = large ? 3.0 : 4.5;
    const cr = ratio(fg, bg);

    const sel = el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
    const key = sel + cs.color + Math.round(bg.r) + Math.round(bg.g) + Math.round(bg.b);
    if (seen.has(key)) continue;
    seen.add(key);

    if (cr < need) {
      out.push({
        sel, ratio: +cr.toFixed(2), need, large, gradient,
        fg: `rgb(${Math.round(fg.r)},${Math.round(fg.g)},${Math.round(fg.b)})`,
        bg: `rgb(${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)})`,
        text: (el.textContent || '').trim().slice(0, 30),
      });
    }
  }
  return out.sort((a, b) => a.ratio - b.ratio);
};

(async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_EXE });
  for (const [url, name] of PAGES) {
    for (const theme of ['dark', 'light']) {
      const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
      const p = await ctx.newPage();
      await p.goto(BASE + url, { waitUntil: 'networkidle' });
      if (theme === 'light') { await p.click('[data-theme-toggle]'); await p.waitForTimeout(350); }
      const fails = await p.evaluate(PROBE);
      console.log(`\n### ${name} / ${theme} — ${fails.length} AA failure(s)`);
      fails.slice(0, 12).forEach(f =>
        console.log(`  ${String(f.ratio).padStart(5)}:1 (need ${f.need})  ${f.sel}  ${f.fg} on ${f.bg}${f.gradient ? ' [grad]' : ''}  "${f.text}"`));
      await ctx.close();
    }
  }
  await b.close();
})();
