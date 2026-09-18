#!/usr/bin/env node
'use strict';

/**
 * aesthetic-audit.js - static conformance check against SKILLS.md
 *
 * Reads the inline <style> blocks of each page and reports where the rendered
 * result drifts from the aesthetic constraints: too many typefaces, a type
 * ramp with steps too close to read as a hierarchy, spacing off the 8px grid,
 * a scattered corner scale, and colour written so it cannot follow the theme.
 *
 * Static on purpose. `contrast-audit.js` and `audit_viewport_integrity` need a
 * browser because they measure composited pixels and layout; every check here
 * is answerable from the declarations themselves, so this runs with no server,
 * no browser, and no dependencies - which is what lets it gate a commit.
 *
 * Usage:
 *   node scripts/aesthetic-audit.js              # every page, human readable
 *   node scripts/aesthetic-audit.js --json       # machine readable
 *   node scripts/aesthetic-audit.js index.html   # one page
 *   node scripts/aesthetic-audit.js --max=24     # ratchet: fail only above 24
 *
 * Exit code 1 when the violation count exceeds `--max`, or when there is any
 * violation at all if `--max` is not given.
 *
 * The ratchet is the form that actually gates a commit. The repository starts
 * with 24 known violations, so a plain run fails by design and a bare pass/fail
 * would be ignored within a day. `--max` pins the number that is tolerated,
 * fails anything above it, and reports when the count has dropped so the
 * ceiling can be lowered. Debt goes one direction.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

/* Pages that participate in the brand system. reel-studio/ and thank-you.html
   are audited too but flagged as out-of-system rather than scored against it,
   because neither carries the token layer - see SKILLS.md. */
const PAGES = [
  { file: 'index.html', inSystem: true },
  { file: 'audit/index.html', inSystem: true },
  { file: 'letscreate/index.html', inSystem: true },
  { file: 'work/jojo-jewels/index.html', inSystem: true },
  { file: 'reel-studio/index.html', inSystem: false },
  { file: 'thank-you.html', inSystem: false },
];

/* ---------------------------------------------------------------- *
 * Thresholds. Each one is a number SKILLS.md commits to, so a
 * change here is a change to the stated rule, not a tuning knob.
 * ---------------------------------------------------------------- */
const MAX_TYPEFACES = 2;        // display + functional; monospace is exempt
const MAX_TYPE_STEPS = 9;       // a ramp longer than this is not a hierarchy
const MIN_STEP_RATIO = 1.06;    // adjacent sizes closer than this read as equal
const MAX_RADIUS_SCALES = 3;    // pills (50%, 999px) are exempt
const SPACING_GRID = 4;         // 8px cadence, with 4px permitted for hairlines
const SPACING_PREFERRED = [8, 16, 24, 32, 48, 64, 80, 120];

/* ---------------------------------------------------------------- *
 * Extraction
 * ---------------------------------------------------------------- */

function styleBlocks(src) {
  return [...src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
}

/**
 * Inline `style="..."` attributes, with the line each one sits on.
 *
 * Scanned separately because this is where theme-blind colour hides: a literal
 * in a style attribute never appears in a `<style>` block, so a check that
 * reads only the blocks misses it. `letscreate/index.html` hardcodes
 * `#6c635b` this way, and it measures 3.16:1 against the dark page.
 *
 * Only the colour check uses these. Sizes and spacing are not read from here,
 * because a one-off inline nudge is a different defect from a systemic one and
 * would distort the ramp and grid counts.
 */
function inlineStyles(src) {
  const out = [];
  for (const m of src.matchAll(/\sstyle\s*=\s*("([^"]*)"|'([^']*)')/g)) {
    out.push({
      css: m[2] !== undefined ? m[2] : m[3],
      line: src.slice(0, m.index).split('\n').length,
    });
  }
  return out;
}

/**
 * Spans of CSS that *define* tokens rather than consume them. A literal hex
 * inside `:root` is the definition of the palette; the same hex in a rule body
 * is a value that will not follow the theme. Without this split every page
 * reports its own token block as a violation and the output is worthless.
 */
function tokenBlockRanges(css) {
  const ranges = [];
  const re = /:root(?:\[[^\]]*\])?\s*\{/g;
  let m;
  while ((m = re.exec(css))) {
    const open = m.index + m[0].length - 1;
    let depth = 0;
    for (let i = open; i < css.length; i++) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') {
        depth--;
        if (depth === 0) { ranges.push([m.index, i]); break; }
      }
    }
  }
  return ranges;
}

const inRanges = (ranges, i) => ranges.some(([a, b]) => i >= a && i <= b);

/** Strip comments so a commented-out declaration is never reported. */
const decomment = (css) => css.replace(/\/\*[\s\S]*?\*\//g, (c) => ' '.repeat(c.length));

/** Resolve custom properties one level deep, which is all this repo nests. */
function tokenMap(css) {
  const map = new Map();
  for (const [, name, value] of css.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/g)) {
    if (!map.has(name)) map.set(name, value.trim());
  }
  return map;
}

function resolve(value, tokens, depth = 0) {
  if (depth > 4) return value;
  const out = value.replace(/var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)/g, (whole, name) =>
    tokens.has(name) ? tokens.get(name) : whole
  );
  return out === value ? out : resolve(out, tokens, depth + 1);
}

const toPx = (n, unit) => (unit === 'rem' || unit === 'em' ? n * 16 : n);

/**
 * A fluid size renders as a range, so it occupies two steps of the ramp: the
 * floor on a 375px screen and the ceiling on a wide one. Collapsing it to a
 * single number would hide a mobile ramp that is flat while the desktop one
 * is well spaced, which is the usual failure.
 */
function sizesFrom(declValue) {
  const v = declValue.trim();
  const clamp = /clamp\(\s*([0-9.]+)(rem|em|px)\s*,[^,]+,\s*([0-9.]+)(rem|em|px)\s*\)/.exec(v);
  if (clamp) {
    return { min: toPx(parseFloat(clamp[1]), clamp[2]), max: toPx(parseFloat(clamp[3]), clamp[4]) };
  }
  const flat = /^([0-9.]+)(rem|em|px)$/.exec(v);
  if (flat) {
    const px = toPx(parseFloat(flat[1]), flat[2]);
    return { min: px, max: px };
  }
  return null;
}

/* ---------------------------------------------------------------- *
 * Checks
 * ---------------------------------------------------------------- */

function checkTypefaces(css, tokens) {
  const stacks = new Set();
  for (const [, raw] of css.matchAll(/font-family:\s*([^;}]+)/g)) {
    const value = resolve(raw, tokens).trim().toLowerCase();
    if (value === 'inherit' || value === 'initial' || value.startsWith('var(')) continue;
    const primary = value.split(',')[0].replace(/['"]/g, '').trim();
    if (!primary) continue;
    // Monospace is functional, not a brand face: timecodes and counters need it.
    if (/mono|courier|consolas|menlo/.test(value)) continue;
    stacks.add(primary);
  }
  const families = [...stacks].sort();
  return {
    families,
    count: families.length,
    violation: families.length > MAX_TYPEFACES
      ? `${families.length} typefaces declared (max ${MAX_TYPEFACES}): ${families.join(', ')}`
      : null,
  };
}

function checkTypeScale(css, tokens) {
  const mins = new Set();
  const maxes = new Set();
  for (const [, raw] of css.matchAll(/font-size:\s*([^;}]+)/g)) {
    const size = sizesFrom(resolve(raw, tokens));
    if (!size) continue;
    mins.add(Number(size.min.toFixed(2)));
    maxes.add(Number(size.max.toFixed(2)));
  }

  const analyse = (set, label) => {
    const steps = [...set].sort((a, b) => a - b);
    const tight = [];
    for (let i = 1; i < steps.length; i++) {
      const ratio = steps[i] / steps[i - 1];
      if (ratio < MIN_STEP_RATIO) {
        tight.push({ from: steps[i - 1], to: steps[i], ratio: Number(ratio.toFixed(3)) });
      }
    }
    return { label, steps, count: steps.length, tight };
  };

  const narrow = analyse(mins, 'at 375px');
  const wide = analyse(maxes, 'at full width');
  const violations = [];
  for (const r of [narrow, wide]) {
    if (r.count > MAX_TYPE_STEPS) {
      violations.push(`${r.count} distinct font sizes ${r.label} (max ${MAX_TYPE_STEPS})`);
    }
    if (r.tight.length) {
      const worst = r.tight.slice().sort((a, b) => a.ratio - b.ratio).slice(0, 4);
      violations.push(
        `${r.tight.length} adjacent pairs ${r.label} below ${MIN_STEP_RATIO}x, so they do not read as separate steps: ` +
          worst.map((t) => `${t.from}/${t.to}px = ${t.ratio}x`).join(', ')
      );
    }
  }
  return { narrow, wide, violations };
}

function checkSpacing(css, tokens) {
  const tally = new Map();
  const re = /(?:padding|margin|gap|row-gap|column-gap)(?:-(?:top|right|bottom|left|inline|block))?\s*:\s*([^;}]+)/g;
  for (const [, raw] of css.matchAll(re)) {
    for (const token of resolve(raw, tokens).split(/\s+/)) {
      const m = /^(-?[0-9.]+)(px|rem|em)$/.exec(token.trim());
      if (!m) continue;
      const px = Math.abs(toPx(parseFloat(m[1]), m[2]));
      if (px === 0) continue;
      tally.set(px, (tally.get(px) || 0) + 1);
    }
  }
  const offGrid = [...tally.entries()]
    .filter(([px]) => px % SPACING_GRID !== 0)
    .sort((a, b) => b[1] - a[1]);
  const offCadence = [...tally.entries()]
    .filter(([px]) => px % SPACING_GRID === 0 && px % 8 !== 0)
    .sort((a, b) => b[1] - a[1]);
  return {
    distinct: tally.size,
    offGrid: offGrid.map(([px, n]) => ({ px, uses: n })),
    offCadence: offCadence.map(([px, n]) => ({ px, uses: n })),
    violation: offGrid.length
      ? `${offGrid.length} spacing values off the ${SPACING_GRID}px grid: ` +
        offGrid.slice(0, 8).map(([px, n]) => `${px}px x${n}`).join(', ')
      : null,
  };
}

function checkRadii(css, tokens) {
  const tally = new Map();
  for (const [, raw] of css.matchAll(/border-radius:\s*([^;}]+)/g)) {
    const value = resolve(raw, tokens).trim();
    // A pill or circle is a shape decision, not a step on the corner scale.
    if (/%|9{2,}px/.test(value)) continue;
    const parts = value.split(/\s+/);
    if (parts.length !== 1) continue;  // shorthand is a one-off shape
    const m = /^([0-9.]+)(px|rem|em)$/.exec(parts[0]);
    if (!m) continue;
    const px = toPx(parseFloat(m[1]), m[2]);
    if (px === 0) continue;
    tally.set(px, (tally.get(px) || 0) + 1);
  }
  const scales = [...tally.entries()].sort((a, b) => b[1] - a[1]);
  return {
    scales: scales.map(([px, n]) => ({ px, uses: n })),
    violation: scales.length > MAX_RADIUS_SCALES
      ? `${scales.length} corner scales (max ${MAX_RADIUS_SCALES}): ` +
        scales.map(([px, n]) => `${px}px x${n}`).join(', ')
      : null,
  };
}

/**
 * Colour that cannot follow the theme: a literal outside the token blocks.
 * `rgba(255,255,255,a)` is the common one - it goes invisible when the page
 * background turns light, which a grep for hex alone would miss.
 */
const LITERAL_COLOUR =
  /(rgba?\(\s*(?:255\s*,\s*255\s*,\s*255|0\s*,\s*0\s*,\s*0)\b[^)]*\)|#[0-9a-fA-F]{3,8}\b)/g;

function checkThemeBlindColour(css, ranges, inline, inSystem) {
  if (!inSystem) return { hits: [], violation: null };
  const hits = [];

  LITERAL_COLOUR.lastIndex = 0;
  let m;
  while ((m = LITERAL_COLOUR.exec(css))) {
    if (inRanges(ranges, m.index)) continue;          // a token definition
    const lineStart = css.lastIndexOf('\n', m.index) + 1;
    const decl = css.slice(lineStart, m.index);
    if (/--[\w-]+\s*:\s*$/.test(decl)) continue;      // a custom property alias
    hits.push({ value: m[1], line: css.slice(0, m.index).split('\n').length, where: 'style block' });
    if (hits.length >= 40) break;
  }

  for (const { css: attr, line } of inline) {
    for (const hit of attr.match(LITERAL_COLOUR) || []) {
      hits.push({ value: hit, line, where: 'inline style' });
    }
  }

  const inlineCount = hits.filter((h) => h.where === 'inline style').length;
  return {
    hits,
    inlineCount,
    violation: hits.length
      ? `${hits.length} literal colours outside the token blocks (${inlineCount} in inline style attributes), ` +
        `which will not follow the theme: ` +
        [...new Set(hits.map((h) => h.value))].slice(0, 6).join(', ')
      : null,
  };
}

/** Pinch-zoom is a typographic affordance: blocking it is WCAG 1.4.4. */
function checkViewportMeta(src) {
  const m = /<meta[^>]+name=["']viewport["'][^>]*>/i.exec(src);
  if (!m) return { violation: 'no viewport meta tag' };
  if (/user-scalable\s*=\s*no|maximum-scale\s*=\s*1/i.test(m[0])) {
    return { violation: 'viewport meta blocks pinch zoom (WCAG 1.4.4)' };
  }
  return { violation: null };
}

/* ---------------------------------------------------------------- *
 * Runner
 * ---------------------------------------------------------------- */

function auditPage({ file, inSystem }) {
  const abs = path.join(ROOT, file);
  const src = fs.readFileSync(abs, 'utf8');
  const css = decomment(styleBlocks(src).join('\n'));
  const ranges = tokenBlockRanges(css);
  const tokens = tokenMap(css);
  const inline = inlineStyles(src);

  const typefaces = checkTypefaces(css, tokens);
  const typeScale = checkTypeScale(css, tokens);
  const spacing = checkSpacing(css, tokens);
  const radii = checkRadii(css, tokens);
  const colour = checkThemeBlindColour(css, ranges, inline, inSystem);
  const viewport = checkViewportMeta(src);

  const violations = [
    typefaces.violation,
    ...typeScale.violations,
    spacing.violation,
    radii.violation,
    colour.violation,
    viewport.violation,
  ].filter(Boolean);

  return { file, inSystem, typefaces, typeScale, spacing, radii, colour, viewport, violations };
}

function report(results) {
  let failed = 0;
  for (const r of results) {
    console.log(`\n${'='.repeat(64)}\n${r.file}${r.inSystem ? '' : '   [outside the token system]'}\n${'='.repeat(64)}`);
    console.log(`typefaces      ${r.typefaces.count}: ${r.typefaces.families.join(', ') || 'none declared'}`);
    console.log(`type ramp      ${r.typeScale.narrow.count} steps at 375px, ${r.typeScale.wide.count} at full width`);
    console.log(`               375px: ${r.typeScale.narrow.steps.join(', ')}`);
    console.log(`               wide:  ${r.typeScale.wide.steps.join(', ')}`);
    console.log(`spacing        ${r.spacing.distinct} distinct values, ${r.spacing.offGrid.length} off the ${SPACING_GRID}px grid, ${r.spacing.offCadence.length} on 4px but off 8px`);
    console.log(`corner scales  ${r.radii.scales.map((s) => `${s.px}px x${s.uses}`).join(', ') || 'none'}`);
    if (r.inSystem) console.log(`literal colour ${r.colour.hits.length} outside the token blocks, ${r.colour.inlineCount} of them in inline style attributes`);

    if (!r.violations.length) {
      console.log('\n  no violations');
    } else {
      failed++;
      console.log('');
      for (const v of r.violations) console.log(`  VIOLATION  ${v}`);
    }
  }
  const total = results.reduce((n, r) => n + r.violations.length, 0);
  console.log(`\n${'-'.repeat(64)}`);
  console.log(`${total} violation${total === 1 ? '' : 's'} across ${failed} of ${results.length} pages.`);
  console.log('Thresholds and the reasoning behind each are in SKILLS.md.');
  return total;
}

function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const maxArg = args.find((a) => a.startsWith('--max'));
  const max = maxArg ? Number(maxArg.split('=')[1] ?? args[args.indexOf(maxArg) + 1]) : null;
  if (maxArg && !Number.isFinite(max)) {
    console.error('--max needs a number, e.g. --max=24');
    process.exit(2);
  }
  const named = args.filter((a) => !a.startsWith('--') && a !== String(max));
  const targets = named.length
    ? named.map((f) => PAGES.find((p) => p.file === f) || { file: f, inSystem: true })
    : PAGES;

  const present = targets.filter((p) => {
    if (fs.existsSync(path.join(ROOT, p.file))) return true;
    console.error(`skipped ${p.file}: not found`);
    return false;
  });

  const results = present.map(auditPage);
  const total = results.reduce((n, r) => n + r.violations.length, 0);

  if (json) {
    console.log(JSON.stringify({
      thresholds: { MAX_TYPEFACES, MAX_TYPE_STEPS, MIN_STEP_RATIO, MAX_RADIUS_SCALES, SPACING_GRID, SPACING_PREFERRED },
      total_violations: total,
      max: max,
      results,
    }, null, 2));
    process.exit(exitCode(total, max));
  }

  report(results);
  if (max !== null) {
    if (total > max) {
      console.log(`\nFAIL  ${total} violations, ceiling is ${max}. This change added ${total - max}.`);
    } else if (total < max) {
      console.log(`\nPASS  ${total} violations, under the ceiling of ${max}. Lower --max to ${total} to hold the gain.`);
    } else {
      console.log(`\nPASS  ${total} violations, at the ceiling of ${max}.`);
    }
  }
  process.exit(exitCode(total, max));
}

const exitCode = (total, max) => (max === null ? (total ? 1 : 0) : total > max ? 1 : 0);

main();
