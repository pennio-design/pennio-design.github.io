#!/usr/bin/env node
'use strict';

/**
 * geo-audit.js - static search and citation-readiness check
 *
 * Reads the repository as committed and reports the defects that stop a page
 * ranking or being cited: a missing canonical, a route that is neither in the
 * sitemap nor excluded from it, structured data that does not parse, an
 * Organization entity pointing at a personal profile, a share image that is
 * not on disk, and meta copy that breaks the positioning vocabulary.
 *
 * Offline and dependency-free on purpose. Everything here is answerable from
 * the files, so it runs with no network, no API credentials and no third-party
 * package, which is what lets it gate a commit. The checks it cannot do
 * offline are named in SEO.md rather than guessed at: live status codes,
 * redirect behaviour, index coverage and actual query performance all need the
 * network or Search Console.
 *
 * Usage:
 *   node scripts/geo-audit.js               # every check
 *   node scripts/geo-audit.js --json
 *   node scripts/geo-audit.js --max=N       # ratchet: fail only above N
 *
 * Exit 1 above the ceiling (or on any finding when --max is absent), 2 on bad
 * input.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const ORIGIN = 'https://pennio.agency';

/**
 * Every page, and what its indexing posture is meant to be.
 *
 * `index: true`  - a public page; it belongs in the sitemap and needs the full
 *                  meta set.
 * `index: false` - not for search. It must say so, either with a robots meta
 *                  or a robots.txt exclusion, and must not be in the sitemap.
 *                  Silence is the defect: a page nobody decided about is one
 *                  that gets indexed by default.
 */
const PAGES = [
  { file: 'index.html', url: `${ORIGIN}/`, index: true },
  { file: 'audit/index.html', url: `${ORIGIN}/audit/`, index: true },
  { file: 'letscreate/index.html', url: `${ORIGIN}/letscreate/`, index: true },
  { file: 'work/jojo-jewels/index.html', url: `${ORIGIN}/work/jojo-jewels/`, index: true },
  { file: 'reel-studio/index.html', url: `${ORIGIN}/reel-studio/`, index: false },
  { file: 'thank-you.html', url: `${ORIGIN}/thank-you.html`, index: false },
];

/* Words CLAUDE.md bars from copy aimed at buyers. Meta and structured data are
   buyer-facing: a title is often the only thing a person reads. This check
   exists because ranking pressure pushes straight at this vocabulary. */
const BANNED_COPY = [
  'agency', 'architecture', 'stack', 'pillars', 'framework', 'ecosystem',
  'brief', 'execution', 'growth creative', 'full-stack', 'leverage', 'elevate',
  'curated', 'bespoke', 'holistic', 'unlock', 'journey', 'solutions',
  'connection problem',
];

/**
 * Third-person constructions the positioning bars. CLAUDE.md requires first
 * person throughout: "I build", never "PENNIO delivers".
 *
 * Matched as PENNIO in a subject position, not as a bare mention. "Built by
 * Paul Oyatowo" and "PENNIO." as a wordmark are fine; "PENNIO-led" and "PENNIO
 * is a" are not. /letscreate/ carried "a PENNIO-led learning system" in its
 * hero and its meta description until this check existed.
 */
const THIRD_PERSON = [
  /PENNIO[-\s]led\b/i,
  /\bPENNIO\s+(?:builds?|delivers?|creates?|offers?|provides?|helps?|serves?|works?|is|was|has|specialis\w+|specializ\w+)\b/i,
  /\bPENNIO's\b/i,
  /\bwe(?:'re| are)\s+an?\s+\w*\s*(?:studio|team|company|practice)\b/i,
];

/* The AI crawler tokens worth a deliberate decision. Reported, not scored:
   `User-agent: *` with `Allow: /` already permits every compliant crawler, so
   an absent group means "allowed by the wildcard", not "blocked". An explicit
   group only matters when the answer differs from the wildcard. */
const AI_AGENTS = [
  'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot',
  'anthropic-ai', 'PerplexityBot', 'Google-Extended', 'CCBot', 'Bytespider',
  'Applebot-Extended', 'meta-externalagent',
];

const findings = [];
const add = (severity, where, message) => findings.push({ severity, where, message });

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

/* ---------------------------------------------------------------- *
 * Parsing helpers
 * ---------------------------------------------------------------- */

const headOf = (src) => {
  const end = src.search(/<\/head>/i);
  return end === -1 ? src : src.slice(0, end);
};

/**
 * Reads one meta/link value. Quote-agnostic on purpose: an earlier pass of
 * this audit used a character class that excluded both quote marks and
 * truncated every description containing an apostrophe, which looked exactly
 * like a broken attribute in the report.
 */
function attr(head, selectorAttr, selectorValue, wanted) {
  const tag = new RegExp(
    `<(?:meta|link)\\b[^>]*\\b${selectorAttr}\\s*=\\s*(["'])${selectorValue}\\1[^>]*>`,
    'i'
  );
  const m = tag.exec(head);
  if (!m) return null;
  const val = new RegExp(`\\b${wanted}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i').exec(m[0]);
  return val ? val[2].trim() : null;
}

const metaName = (head, name) => attr(head, 'name', name, 'content');
const metaProp = (head, prop) => attr(head, 'property', prop, 'content');
const linkRel = (head, rel) => attr(head, 'rel', rel, 'href');

/** Decode the few entities that appear in this repo's titles. */
const decode = (s) =>
  s.replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
   .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

/**
 * Approximates the text a reader sees: script, style and svg contents removed,
 * tags stripped, entities decoded, whitespace collapsed.
 *
 * CLAUDE.md is explicit that this has to be a rendered-text scan rather than a
 * source grep, because class attributes and the pennio.agency domain otherwise
 * produce false hits - `class="brand-architecture"` is a name, not copy. The
 * domain is removed here for the same reason. This is not a DOM, so it will not
 * resolve text injected by script; the Playwright loop in SKILLS.md covers
 * that ground when it matters.
 */
function renderedText(src) {
  let body = src.slice(Math.max(0, src.search(/<body\b/i)));
  body = body.replace(/<(script|style|svg|template|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  body = body.replace(/<!--[\s\S]*?-->/g, ' ');
  body = body.replace(/<[^>]+>/g, ' ');
  return decode(body).replace(/pennio\.agency/gi, ' ').replace(/\s+/g, ' ').trim();
}

/** Every distinct banned word or third-person construction in a stretch of copy. */
function copyViolations(text) {
  const out = [];
  for (const word of BANNED_COPY) {
    const re = new RegExp(`\\b${word.replace(/[-\s]/g, '[-\\s]')}\\w*`, 'i');
    const m = re.exec(text);
    if (m) out.push({ kind: 'banned word', match: m[0], word });
  }
  for (const re of THIRD_PERSON) {
    const m = re.exec(text);
    if (m) out.push({ kind: 'third person', match: m[0].trim() });
  }
  if (text.includes('\u2014')) out.push({ kind: 'em dash', match: '\u2014' });
  return out;
}

function jsonLdBlocks(src) {
  return [...src.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((m) => m[1]);
}

/** Flatten a graph so nested nodes are checked too. */
function flattenNodes(value, out = []) {
  if (Array.isArray(value)) { value.forEach((v) => flattenNodes(v, out)); return out; }
  if (value && typeof value === 'object') {
    if (value['@type']) out.push(value);
    for (const v of Object.values(value)) flattenNodes(v, out);
  }
  return out;
}

/* ---------------------------------------------------------------- *
 * Per-page checks
 * ---------------------------------------------------------------- */

function auditPage(page) {
  if (!exists(page.file)) { add('error', page.file, 'listed in PAGES but not on disk'); return; }
  const src = read(page.file);
  const head = headOf(src);
  const w = page.file;

  const title = (/<title>([\s\S]*?)<\/title>/i.exec(head) || [])[1];
  const description = metaName(head, 'description');
  const canonical = linkRel(head, 'canonical');
  const robots = metaName(head, 'robots');
  const h1s = (src.match(/<h1[\s>]/gi) || []).length;

  if (page.index) {
    if (!title) add('error', w, 'no <title>');
    else if (decode(title).length > 60) {
      add('warn', w, `title is ${decode(title).length} chars; over about 60 it is truncated in results`);
    }

    if (!description) add('error', w, 'no meta description');
    else if (description.length < 50 || description.length > 160) {
      add('warn', w, `meta description is ${description.length} chars, outside 50-160`);
    }

    if (!canonical) {
      add('error', w, 'no canonical link, so nothing arbitrates the indexable form of this URL');
    } else if (canonical !== page.url) {
      add('error', w, `canonical is ${canonical}, expected ${page.url}`);
    }

    if (h1s === 0) add('error', w, 'no <h1>');
    else if (h1s > 1) add('warn', w, `${h1s} <h1> elements`);

    for (const [prop, get] of [
      ['og:title', metaProp], ['og:description', metaProp],
      ['og:image', metaProp], ['og:url', metaProp],
    ]) {
      if (!get(head, prop)) add('error', w, `no ${prop}`);
    }
    if (!metaName(head, 'twitter:card')) {
      add('warn', w, 'no twitter:card; X falls back to the og tags and renders the small card');
    }

    const ogUrl = metaProp(head, 'og:url');
    if (ogUrl && canonical && ogUrl !== canonical) {
      add('error', w, `og:url (${ogUrl}) and canonical (${canonical}) disagree`);
    }

    const ogImage = metaProp(head, 'og:image');
    if (ogImage && ogImage.startsWith(ORIGIN)) {
      const rel = ogImage.slice(ORIGIN.length).replace(/^\//, '');
      if (!exists(rel)) add('error', w, `og:image points at ${ogImage}, which is not in the repository`);
    }
  } else {
    // Not for search. It has to say so somewhere.
    const noindexMeta = robots && /noindex/i.test(robots);
    if (!noindexMeta) {
      add('error', w, 'not meant for search but carries no robots noindex meta; needs that or a robots.txt exclusion');
    }
  }

  // Structured data must parse. An unparseable block is silently ignored by
  // every consumer, which is indistinguishable from having none.
  const blocks = jsonLdBlocks(src);
  if (page.index && blocks.length === 0) {
    add('warn', w, 'no JSON-LD; nothing here is machine-readable as an entity');
  }
  blocks.forEach((raw, i) => {
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch (err) { add('error', w, `JSON-LD block ${i} does not parse: ${err.message}`); return; }
    auditEntities(w, flattenNodes(parsed));
  });

  // Meta and share tags are buyer-facing copy, and so is the page itself.
  const metaCopy = [decode(title || ''), description || '',
                    metaProp(head, 'og:title') || '', metaProp(head, 'og:description') || '',
                    metaName(head, 'twitter:title') || '', metaName(head, 'twitter:description') || '']
    .join(' ').replace(/pennio\.agency/gi, ' ');

  for (const v of copyViolations(metaCopy)) {
    add('error', w, `meta copy uses ${v.kind} "${v.match}", which CLAUDE.md bars from copy aimed at buyers`);
  }
  // Only pages meant for readers are held to the positioning. /reel-studio/ is
  // an internal tool and thank-you.html is a leftover template awaiting a
  // rebrand decision, both recorded as such in CLAUDE.md.
  if (page.index) {
    for (const v of copyViolations(renderedText(src))) {
      add('error', w, `rendered copy uses ${v.kind} "${v.match}", which CLAUDE.md bars from copy aimed at buyers`);
    }
  }
}

/* ---------------------------------------------------------------- *
 * Entity checks
 * ---------------------------------------------------------------- */

/**
 * URLs whose shape alone proves they identify a person rather than a company.
 *
 * Only LinkedIn qualifies: `/in/` is a member profile and `/company/` is the
 * organization page, so the path settles it. An X, Instagram or Facebook
 * handle carries no such marker - `x.com/penniodesign` is the company and
 * `x.com/paul` would be the person, and nothing in the URL distinguishes
 * them. An earlier revision flagged every X handle and reported the company's
 * own account as a person, which is the kind of false positive that gets a
 * checker ignored.
 */
const PERSONAL_PROFILE = [/linkedin\.com\/in\//i];

/** Links that assert an entity exists in a public knowledge base. */
const KNOWLEDGE_BASE = [/wikidata\.org/i, /wikipedia\.org/i, /crunchbase\.com/i, /dbpedia\.org/i];

const ORG_TYPES = ['Organization', 'ProfessionalService', 'LocalBusiness', 'Corporation', 'Brand'];

function auditEntities(where, nodes) {
  for (const node of nodes) {
    const types = [].concat(node['@type']);
    const isOrg = types.some((t) => ORG_TYPES.includes(t));
    const sameAs = [].concat(node.sameAs || []).filter(Boolean);

    if (isOrg) {
      if (!node['@id']) {
        add('warn', where,
          `${types.join('/')} has no @id, so nothing else on the site can reference this entity`);
      }
      // A personal profile is evidence about a person, not about the company.
      // Asserting it as the organization's own identity is a disambiguation
      // error: it merges two entities that should be linked, not equated.
      for (const url of sameAs) {
        if (PERSONAL_PROFILE.some((re) => re.test(url))) {
          add('error', where,
            `${types.join('/')}.sameAs includes ${url}, a personal profile. ` +
            'It belongs on the Person node, which the organization then links with founder/@id.');
        }
      }
    }

    if (types.includes('Person') && !node['@id'] && !node.sameAs) {
      add('warn', where,
        'Person node has neither @id nor sameAs, so it is an unresolvable name rather than an entity');
    }

    // Any knowledge-base sameAs is a factual claim about an entity existing.
    for (const url of sameAs) {
      if (KNOWLEDGE_BASE.some((re) => re.test(url))) {
        add('error', where,
          `sameAs asserts a knowledge-base entity: ${url}. ` +
          'CLAUDE.md bars a claim that breaks on inspection; verify the entry exists and is this subject, ' +
          'or remove it. A dangling sameAs is worse than none.');
      }
    }
  }
}

/* ---------------------------------------------------------------- *
 * Site-wide checks
 * ---------------------------------------------------------------- */

function discoverRoutes() {
  const routes = [];
  const walk = (dir, depth) => {
    if (depth > 2) return;
    for (const entry of fs.readdirSync(path.join(ROOT, dir || '.'), { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const rel = dir ? `${dir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(rel, depth + 1);
      else if (entry.name === 'index.html' && dir) routes.push(`${ORIGIN}/${dir}/`);
    }
  };
  walk('', 0);
  routes.push(`${ORIGIN}/`);
  return routes;
}

function auditSiteWide() {
  const robots = exists('robots.txt') ? read('robots.txt') : null;
  if (!robots) { add('error', 'robots.txt', 'missing'); return; }

  const disallowed = [...robots.matchAll(/^\s*Disallow:\s*(\S+)/gim)].map((m) => m[1]);
  const isExcluded = (url) => {
    const p = url.startsWith(ORIGIN) ? url.slice(ORIGIN.length) : url;
    return disallowed.some((d) => d !== '/' && p.startsWith(d));
  };

  if (!/^\s*Sitemap:\s*\S+/im.test(robots)) {
    add('error', 'robots.txt', 'no Sitemap: line');
  }

  // Which AI crawler tokens have an explicit group. Informational.
  const explicit = AI_AGENTS.filter((a) =>
    new RegExp(`^\\s*User-agent:\\s*${a}\\s*$`, 'im').test(robots));
  add('info', 'robots.txt',
    explicit.length
      ? `explicit groups for ${explicit.join(', ')}; the rest fall to User-agent: *`
      : `no explicit AI crawler groups. All ${AI_AGENTS.length} tracked tokens fall to ` +
        'User-agent: * which allows them, so content is already crawlable. ' +
        'An explicit group is only needed where the answer differs from the wildcard.');

  // Sitemap consistency.
  if (!exists('sitemap.xml')) { add('error', 'sitemap.xml', 'missing'); return; }
  const sitemap = read('sitemap.xml');
  const locs = [...sitemap.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);

  const canonicalOf = new Map();
  for (const page of PAGES) {
    if (!exists(page.file)) continue;
    canonicalOf.set(page.url, linkRel(headOf(read(page.file)), 'canonical'));
  }

  for (const loc of locs) {
    const withSlash = loc.endsWith('/') ? loc : `${loc}/`;
    const page = PAGES.find((p) => p.url === loc || p.url === withSlash);
    if (!page) { add('error', 'sitemap.xml', `${loc} is not a known route`); continue; }
    if (!exists(page.file)) { add('error', 'sitemap.xml', `${loc} has no file behind it`); continue; }
    if (!page.index) {
      add('error', 'sitemap.xml', `${loc} is listed but is not meant for search`);
    }
    if (loc !== page.url) {
      const canon = canonicalOf.get(page.url);
      add('error', 'sitemap.xml',
        `${loc} does not match the route's indexable form ${page.url}` +
        (canon ? ` (canonical says ${canon})` : ' (and the page has no canonical to arbitrate)') +
        '. A sitemap entry that is not the canonical form spends crawl budget on a redirect.');
    }
  }

  // The check that catches drift: a route that is neither promoted nor excluded.
  for (const route of discoverRoutes()) {
    const known = PAGES.find((p) => p.url === route);
    if (!known) {
      add('error', 'routes', `${route} has an index.html but is not in this script's PAGES list`);
      continue;
    }
    const inSitemap = locs.some((l) => l === route || `${l}/` === route);
    if (known.index && !inSitemap) {
      add('error', 'sitemap.xml', `${route} is a public route but is not in the sitemap`);
    }
    if (!known.index && !inSitemap && !isExcluded(route)) {
      add('error', 'robots.txt',
        `${route} is not meant for search, is not in the sitemap, and is not excluded in robots.txt. ` +
        'It is reachable and indexable by default, which is a decision nobody made.');
    }
  }

  // llms.txt. Absence is a gap, not a failure: adoption is not universal and it
  // is not a ranking input. It is cheap and it is the one file in this list
  // whose whole audience is a model.
  if (!exists('llms.txt')) {
    add('warn', 'llms.txt',
      'absent. Not read by Google as a ranking input and support across assistants is uneven, ' +
      'so treat it as a cheap, legible summary of the site rather than a lever.');
  } else {
    const llms = read('llms.txt');
    if (!/^#\s+\S/m.test(llms)) add('error', 'llms.txt', 'no H1 title line');
    for (const url of [...llms.matchAll(/\]\((https?:\/\/[^)]+)\)/g)].map((m) => m[1])) {
      if (!url.startsWith(ORIGIN)) continue;
      // Split the fragment off before resolving a path. A link to
      // `/#services` addresses the homepage, not a file called `#services`.
      const [pathPart, fragment] = url.slice(ORIGIN.length).split('#');
      const rel = pathPart.replace(/^\//, '').split('?')[0];
      const target = rel === '' ? 'index.html' : (rel.endsWith('/') ? `${rel}index.html` : rel);
      if (!exists(target)) {
        add('error', 'llms.txt', `links ${url}, which is not in the repository`);
        continue;
      }
      // A fragment is a promise that the anchor exists. Checking it catches the
      // link that silently lands at the top of the page instead.
      if (fragment && !new RegExp(`id=["']${fragment}["']`).test(read(target))) {
        add('error', 'llms.txt', `links ${url}, but ${target} has no element with id="${fragment}"`);
      }
    }
  }
}

/* ---------------------------------------------------------------- *
 * Runner
 * ---------------------------------------------------------------- */

function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const maxArg = args.find((a) => a.startsWith('--max'));
  const max = maxArg ? Number(maxArg.split('=')[1]) : null;
  if (maxArg && !Number.isFinite(max)) {
    console.error('--max needs a number, e.g. --max=12');
    process.exit(2);
  }

  PAGES.forEach(auditPage);
  auditSiteWide();

  const errors = findings.filter((f) => f.severity === 'error');
  const warns = findings.filter((f) => f.severity === 'warn');
  const infos = findings.filter((f) => f.severity === 'info');
  const scored = errors.length + warns.length;

  if (json) {
    console.log(JSON.stringify({ total: scored, errors: errors.length, warnings: warns.length, max, findings }, null, 2));
    process.exit(max === null ? (scored ? 1 : 0) : scored > max ? 1 : 0);
  }

  for (const [label, list] of [['ERROR', errors], ['WARN', warns], ['INFO', infos]]) {
    if (!list.length) continue;
    console.log(`\n${label} (${list.length})\n${'-'.repeat(64)}`);
    for (const f of list) console.log(`  ${f.where}\n    ${f.message}`);
  }

  console.log(`\n${'='.repeat(64)}`);
  console.log(`${errors.length} error${errors.length === 1 ? '' : 's'}, ${warns.length} warning${warns.length === 1 ? '' : 's'} (${scored} scored).`);
  console.log('Network and Search Console checks are out of scope here; see SEO.md.');
  if (max !== null) {
    if (scored > max) console.log(`\nFAIL  ${scored} findings, ceiling is ${max}. This change added ${scored - max}.`);
    else if (scored < max) console.log(`\nPASS  ${scored} findings, under the ceiling of ${max}. Lower --max to ${scored} to hold the gain.`);
    else console.log(`\nPASS  ${scored} findings, at the ceiling of ${max}.`);
  }
  process.exit(max === null ? (scored ? 1 : 0) : scored > max ? 1 : 0);
}

main();
