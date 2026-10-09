#!/usr/bin/env node
'use strict';

/**
 * copy-audit.js - readability and concision check on rendered copy
 *
 * Scores the text a reader actually sees, per page and per section, against
 * the target band in CLAUDE.md: plain but adult, roughly grade 5 to 6.
 *
 * Offline and dependency-free, like the other two gates. Readability is a
 * property of the words, so nothing here needs a browser.
 *
 * The formulas are Flesch Reading Ease and Flesch-Kincaid Grade Level. They
 * are proxies, not truth: they count syllables and sentence length and cannot
 * tell whether a short sentence says anything. A low grade with a high jargon
 * count is still bad copy. Use the numbers to find suspects, then read them.
 *
 * Usage:
 *   node scripts/copy-audit.js                 # every page
 *   node scripts/copy-audit.js --sections      # break the homepage down
 *   node scripts/copy-audit.js --json
 *   node scripts/copy-audit.js --max=N         # ratchet
 *
 * Exit 1 above the ceiling (or on any finding without --max), 2 on bad input.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

/* Pages whose prose is written for a reader. reel-studio is an internal tool
   and thank-you.html is a leftover template, both recorded as such in
   CLAUDE.md, so neither is held to the copy standard. */
const PAGES = [
  'index.html',
  'audit/index.html',
  'letscreate/index.html',
  'work/jojo-jewels/index.html',
  // Not a route: the print master for the checklist PDF, which is the lead
  // magnet people actually receive. It shares a paragraph with /audit/ and had
  // already drifted from it, so it is held to the same standard.
  'audit/checklist-source.html',
];

/* The band CLAUDE.md commits to. Grade 6 is the ceiling: above it the writing
   is working harder than the reader should have to. There is no floor
   enforced, because pushing prose below grade 4 on a page asking for
   350,000 naira starts to read as talking down, but a section that lands
   there naturally is not a defect. */
const MAX_GRADE = 6.0;
const MIN_READING_EASE = 60;    // "plain English" on the Flesch scale
const MAX_SENTENCE_WORDS = 25;  // one long sentence is fine; a habit is not
const MIN_SECTION_WORDS = 40;   // below this the formulas are noise

const findings = [];
const add = (where, message) => findings.push({ where, message });

/* ---------------------------------------------------------------- *
 * Text extraction
 * ---------------------------------------------------------------- */

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·' };
const decode = (s) =>
  s.replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
   .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
   .replace(/&(\w+);/g, (m, n) => (n in ENTITIES ? ENTITIES[n] : m));

/**
 * Approximates what a reader sees. Closing block tags become sentence
 * boundaries first: without that a heading runs into the paragraph under it
 * and the two are scored as one impossibly long sentence.
 */
function renderedText(src) {
  let body = stripCode(src.slice(Math.max(0, src.search(/<body\b/i))));
  body = body.replace(/<\/(p|h[1-6]|li|div|section|article|header|footer|td|dd|dt|figcaption|button|a|span|label|option)>/gi, ' . ');
  body = body.replace(/<br\s*\/?>/gi, ' . ');
  body = body.replace(/<[^>]+>/g, ' ');
  return decode(body).replace(/\s+/g, ' ').trim();
}

/** English syllable estimate: vowel groups, with a silent trailing e. */
function syllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  let count = 0, prevVowel = false;
  for (const ch of w) {
    const v = 'aeiouy'.includes(ch);
    if (v && !prevVowel) count++;
    prevVowel = v;
  }
  if (w.endsWith('e') && count > 1) count--;
  return Math.max(1, count);
}

function score(text) {
  const clean = text.replace(/\s*\.\s*(?:\.\s*)+/g, '. ');
  const sentences = clean.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => /[A-Za-z]{2}/.test(s));
  const words = clean.match(/[A-Za-z][A-Za-z'’-]*/g) || [];
  if (!words.length || !sentences.length) return null;

  const syl = words.reduce((n, w) => n + syllables(w), 0);
  const asl = words.length / sentences.length;
  const asw = syl / words.length;

  const long = sentences
    .map((s) => ({ s, n: (s.match(/[A-Za-z'’-]+/g) || []).length }))
    .filter((x) => x.n > MAX_SENTENCE_WORDS)
    .sort((a, b) => b.n - a.n);

  return {
    words: words.length,
    sentences: sentences.length,
    avgSentenceWords: +asl.toFixed(1),
    readingEase: +(206.835 - 1.015 * asl - 84.6 * asw).toFixed(1),
    grade: +(0.39 * asl + 11.8 * asw - 15.59).toFixed(1),
    longSentences: long.length,
    longest: long.length ? { words: long[0].n, text: long[0].s.slice(0, 150) } : null,
  };
}

/**
 * Strips script, style, svg and comments. Done before anything else looks at
 * the markup, because `/letscreate/` keeps modal HTML inside JS template
 * literals: a section splitter run over the raw body matches the
 * `<div class="modal-body">` inside a string, slices there, and then scores
 * JavaScript as prose. That produced a "section" at grade 23 with a 119-word
 * sentence, which was source code.
 */
function stripCode(html) {
  return html
    .replace(/<(script|style|svg|template|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
}

/** Split a page into its named sections so a page average cannot hide one. */
function sections(src) {
  const body = stripCode(src.slice(Math.max(0, src.search(/<body\b/i))));
  const out = new Map();
  /*
   * Only real containers. An earlier version matched any class containing
   * "case", which split on `case-kind` and `case-name` and then scored
   * "Jewellery, retail - Identity, packaging and campaign" as a sentence.
   * A label row is six polysyllabic nouns with no verb: the formula reads it
   * as grade 7.6, which is an artifact of measuring a fragment, not a
   * sentence. Sections are things with an id, or a whole case article, or a
   * modal body.
   */
  const re = /<(?:section|article|footer|div)[^>]*?(?:id="([^"]+)"|class="(case|modal-box)[\s"])[^>]*>/gi;
  const marks = [...body.matchAll(re)].map((m) => ({ name: m[1] || m[2], at: m.index }));
  for (let i = 0; i < marks.length; i++) {
    const slice = body.slice(marks[i].at, marks[i + 1] ? marks[i + 1].at : body.length);
    const text = renderedText('<body>' + slice);   // already stripped above
    const prev = out.get(marks[i].name) || '';
    out.set(marks[i].name, prev + ' ' + text);
  }
  return out;
}

/* ---------------------------------------------------------------- *
 * Runner
 * ---------------------------------------------------------------- */

function auditPage(file, wantSections) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const page = score(renderedText(src));
  const result = { file, page, sections: [] };

  if (page) {
    if (page.grade > MAX_GRADE) add(file, `grade ${page.grade} over the ceiling of ${MAX_GRADE}`);
    if (page.readingEase < MIN_READING_EASE) add(file, `reading ease ${page.readingEase} under ${MIN_READING_EASE}`);
  }

  for (const [name, text] of sections(src)) {
    const s = score(text);
    if (!s || s.words < MIN_SECTION_WORDS) continue;
    result.sections.push({ name, ...s });
    if (s.grade > MAX_GRADE) {
      add(`${file} [${name}]`, `grade ${s.grade}, reading ease ${s.readingEase}` +
        (s.longest ? ` - longest sentence ${s.longest.words} words: "${s.longest.text}"` : ''));
    }
  }
  result.sections.sort((a, b) => b.grade - a.grade);
  if (!wantSections) result.sections = result.sections.slice(0, 3);
  return result;
}

function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const wantSections = args.includes('--sections');
  const maxArg = args.find((a) => a.startsWith('--max'));
  const max = maxArg ? Number(maxArg.split('=')[1]) : null;
  if (maxArg && !Number.isFinite(max)) { console.error('--max needs a number, e.g. --max=0'); process.exit(2); }

  const named = args.filter((a) => !a.startsWith('--'));
  const targets = (named.length ? named : PAGES).filter((f) => {
    if (fs.existsSync(path.join(ROOT, f))) return true;
    console.error(`skipped ${f}: not found`);
    return false;
  });

  const results = targets.map((f) => auditPage(f, wantSections));
  const total = findings.length;

  if (json) {
    console.log(JSON.stringify({ thresholds: { MAX_GRADE, MIN_READING_EASE, MAX_SENTENCE_WORDS }, total, findings, results }, null, 2));
    process.exit(max === null ? (total ? 1 : 0) : total > max ? 1 : 0);
  }

  for (const r of results) {
    const p = r.page;
    console.log(`\n${'='.repeat(70)}\n${r.file}`);
    console.log(`${'='.repeat(70)}`);
    if (p) {
      console.log(`  ${p.words} words, ${p.sentences} sentences, ${p.avgSentenceWords} words per sentence`);
      console.log(`  reading ease ${p.readingEase}   grade ${p.grade}   sentences over ${MAX_SENTENCE_WORDS}w: ${p.longSentences}`);
    }
    if (r.sections.length) {
      console.log(`  ${'section'.padEnd(22)} ${'words'.padStart(5)} ${'ease'.padStart(6)} ${'grade'.padStart(6)}`);
      for (const s of r.sections) {
        const flag = s.grade > MAX_GRADE ? '  <-- over' : '';
        console.log(`  ${s.name.slice(0, 22).padEnd(22)} ${String(s.words).padStart(5)} ${String(s.readingEase).padStart(6)} ${String(s.grade).padStart(6)}${flag}`);
      }
    }
  }

  if (findings.length) {
    console.log(`\n${'-'.repeat(70)}`);
    for (const f of findings) console.log(`  ${f.where}\n    ${f.message}`);
  }
  console.log(`\n${'='.repeat(70)}`);
  console.log(`${total} finding${total === 1 ? '' : 's'}. Ceiling is grade ${MAX_GRADE}, reading ease ${MIN_READING_EASE}.`);
  if (max !== null) {
    if (total > max) console.log(`\nFAIL  ${total} findings, ceiling is ${max}.`);
    else if (total < max) console.log(`\nPASS  ${total} findings, under ${max}. Lower --max to ${total} to hold the gain.`);
    else console.log(`\nPASS  ${total} findings, at the ceiling of ${max}.`);
  }
  process.exit(max === null ? (total ? 1 : 0) : total > max ? 1 : 0);
}

main();
