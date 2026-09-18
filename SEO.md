# SEO.md - Search and Generative Engine Optimization

How search work is done on this repository: what is measured, what is claimed,
and what is deliberately not attempted.

## How this file relates to CLAUDE.md and SKILLS.md

`CLAUDE.md` owns repository facts and the three proof rules. `SKILLS.md` owns
what generated interface may look like. This file owns how the site is made
findable and quotable.

CLAUDE.md wins on every collision, and the collision is not hypothetical.
**Ranking pressure points straight at the vocabulary the positioning bars.**
The highest-volume phrasing for this business is "brand architecture agency",
"full-stack brand solutions", "unlock growth" - every one of those is on the
banned list, and every one would read as a different, worse company. The same
pressure pushes toward naming clients who cannot be shown and toward inventing
a metric to put in a title tag.

So the guard is in the tool, not in good intentions:
`scripts/geo-audit.js` scans title, meta description and the Open Graph copy
against CLAUDE.md's banned list and errors on a hit, and errors on any
`sameAs` pointing at a knowledge base whose entry has not been verified. An
autonomous SEO pass cannot quietly trade the positioning for a ranking.

## What the brief gets wrong

Three corrections, because acting on the brief as written would waste money or
produce false confidence.

### Open-source tooling does not replace Ahrefs or Semrush

What those products sell is not an algorithm, it is an **index**: a continuous
crawl of a large fraction of the web, plus clickstream and bid data. Backlink
topology and keyword search volume are readings off that corpus. An
open-source CLI has no corpus, so it cannot produce them. It can do the part
that only needs your own site - crawl it, find broken internal links, check
status codes and indexability - and that part is real and worth having.

Treat any open tool that reports competitor backlinks or search volume as
either a wrapper around a paid API, in which case you are paying for the API,
or as fabricating. There is no third case.

Practical consequence: the crawl and technical-integrity half of Module B is
already covered here by `scripts/geo-audit.js` plus the Playwright loop in
`SKILLS.md`, offline and free. The competitive-intelligence half is not
available at zero cost and should be budgeted or dropped, not simulated.

### GEO is hygiene with option value, not a measurable channel

Valid structured data, a resolvable entity graph, crawlability and a legible
summary file are all real, cheap and verifiable. Whether any of them *causes*
an assistant to cite the site is not verifiable, by anyone: there is no
citation attribution data for ChatGPT, Claude or AI Overviews comparable to a
referrer log.

So: do the hygiene, because it is cheap and it is also ordinary good SEO.
Never report it as ROI, to yourself or to a client. "Synthetic citation
priming" is a claim about a mechanism nobody can measure, and this repository's
second proof rule bars publishing a claim that breaks on inspection.

### The site does not currently need explicit AI crawler rules

`robots.txt` has one group, `User-agent: *`, with `Allow: /`. Every compliant
AI crawler already falls under it and is already permitted. Adding a
`User-agent: GPTBot` group that also allows would change nothing. Explicit
groups matter only where the answer differs from the wildcard - if you ever
want to admit search crawlers while refusing training crawlers, that is when
those lines get written, and it is a business decision about your content, not
an optimisation.

`geo-audit.js` reports the AI crawler state as INFO for exactly this reason. It
is a fact to know, not a defect to fix.

## Module status

| Module | Real project | Status here |
| --- | --- | --- |
| GSC MCP | [AminForou/mcp-gsc](https://github.com/AminForou/mcp-gsc) and [ncosentino/google-search-console-mcp](https://github.com/ncosentino/google-search-console-mcp) | **Not installed, and the highest-value one.** The brief does not say which; two different servers answer to that name. Pin one before use. |
| Open SEO | [every-app/open-seo](https://github.com/every-app/open-seo) and [shashank-sn/open-seo](https://github.com/shashank-sn/open-seo) | **Not installed, and the name is ambiguous** - two unrelated repositories, same description. Its crawl half is already covered offline; see the correction above. |
| GEO Optimizer | [Auriti-Labs/geo-optimizer-skill](https://github.com/Auriti-Labs/geo-optimizer-skill), MIT, on PyPI | **Not installed and not runnable in the current sandbox.** `uvx` is present, but PyPI returns 503 through this network policy, so `uvx --from geo-optimizer-skill geo audit` cannot be verified from here. The brief credits it to `geoready.dev`, which is the hosted platform by the same authors, not the repository. |
| `scripts/geo-audit.js` | this repository | **Working.** Offline, dependency-free, ratchetable. |

Nothing in this sandbox can reach the network: PyPI answers 503 and
`https://pennio.agency/` answers 403 at the proxy. Every number in this file
was therefore measured against the repository as committed, and no claim here
depends on a live fetch.

### Before installing any module

Vendor it and pin it, matching the `skills-lock.json` pattern already used for
the twelve skills in `.agents/skills/`. Two extra cautions specific to these:

- **A GSC OAuth credential reads all search data for the property.** It is a
  real secret. It does not belong in the repository, in `.mcp.json`, or in a
  commit. The property is already verified - `google9287af6d6d5441a9.html` at
  the root is the Search Console verification file - so the connection is a
  credential decision, not a setup project.
- **`uvx --from <package>` executes third-party code from PyPI on every run**,
  at whatever version resolves that day. Pin the version.

## What geo-audit.js checks

```sh
node scripts/geo-audit.js --max=1    # the gate
node scripts/geo-audit.js            # every finding
node scripts/geo-audit.js --json --max=1
```

Per page: title presence and length, meta description presence and length,
canonical present and self-referential, exactly one `h1`, the four Open Graph
tags, `twitter:card`, `og:url` agreeing with the canonical, a share image that
is actually in the repository, JSON-LD that parses, and meta copy against the
banned vocabulary.

Site-wide: every route with an `index.html` is either in the sitemap or
excluded in `robots.txt`; sitemap entries match the canonical form and have
files behind them; `robots.txt` has a `Sitemap:` line; `llms.txt` links resolve
to real files *and* real anchor ids.

Entities: an `Organization` without an `@id` cannot be referenced; a
`linkedin.com/in/` URL on an organization is a disambiguation error, not a
social link; a `Person` with neither `@id` nor `sameAs` is a name rather than
an entity; and any knowledge-base `sameAs` is an unverified factual claim.

Two false positives were removed during the build and are worth not
reintroducing: an X or Instagram handle cannot be classified as personal or
corporate from its URL, so only `linkedin.com/in/` is flagged; and a fragment
link like `/#services` addresses the homepage, so the fragment is split off
before resolving a path - and then checked against the real element ids.

**Out of scope here, permanently.** Live status codes, redirect chains, index
coverage, Core Web Vitals field data, query performance, and anything about a
competitor. Those need the network, Search Console, or an index this
repository does not have. The script says so rather than approximating them.

`--max` is the gate, for the reason given in `SKILLS.md`: the baseline is **1
finding**, and a bare run exits 1 while any finding stands. The ceiling only
moves down.

## What this change did

The audit started at 14 findings, 7 of them errors. All errors are fixed:

- **`/letscreate/` had no canonical, no `og:url` and no `twitter:*` tags**, and
  the sitemap listed it as `/letscreate` while `/audit/` is listed as
  `/audit/`. Nothing arbitrated which form was indexable. Canonical, `og:url`
  and the Twitter card are now present, and the sitemap entry matches. CLAUDE.md
  already required this for `/audit/`; `/letscreate/` had simply never had it.
- **The homepage Organization claimed a personal LinkedIn profile as its own
  identity.** `sameAs` held `linkedin.com/in/paul-oyatowo`, which equates the
  company with its founder instead of linking them. The schema is now a
  `@graph`: `ProfessionalService` at `#organization`, `Person` at
  `#paul-oyatowo` carrying the LinkedIn profile, `WebSite` at `#website`,
  cross-referenced by `@id` with `founder` and `worksFor`. No new facts were
  introduced; `areaServed: "Africa"` restates the site's own headline.
- **`/audit/` and `/letscreate/` had no structured data at all.** Both now carry
  a minimal `WebPage` node linked into the site graph by `isPartOf` and
  `publisher`. Deliberately minimal: a `Course` or `Offer` node would need
  dates, prices and instances that were not supplied, and inventing them
  breaks the third proof rule.
- **`thank-you.html` and `/reel-studio/` were indexable by default.** A
  post-conversion page in results is a dead end that leaks the funnel; an
  internal teleprompter with no `h1` and no description competing for the brand
  name is worse. Both now carry a `robots` meta, and `/reel-studio/` is
  disallowed in `robots.txt` as well.

  Those two signals do not stack, and it is worth being precise about why.
  `Disallow` stops the fetch, so the `noindex` on that page is never read: it
  is a fallback for if the `Disallow` is lifted, not a second active signal.
  A disallowed URL can still appear as a URL-only result when something links
  to it, and a meta that is never fetched cannot prevent that. Nothing on this
  site links to either page, which is what makes `Disallow` sufficient here.
  If that changes, drop the `Disallow` and let the `noindex` work - a signal
  that is read beats one that is blocked. `thank-you.html` is crawlable and
  relies on its meta, which is the right arrangement for a page a form
  redirects to.
- **`llms.txt` now exists**, written from the site's own copy rather than
  composed for it, in first person, clear of the banned vocabulary and free of
  em dashes. It closes with a note for anything quoting the site: no figures
  are attributable, because none were supplied. That is the proof rules
  reaching the one file whose entire audience is a model.

One finding is left, and it is a copy decision rather than a defect: the
`/letscreate/` meta description is 181 characters and will be truncated in
results. Trimming it is an edit to buyer-facing copy, so it is not made here.

## The honest strategic read

The technical layer is now clean, and that means it has stopped being the
bottleneck. It was never the real one.

This site has **one showable case**. CLAUDE.md records that plainly: Brilla,
told as decisions rather than results because no figures were supplied. No
amount of schema, no `llms.txt`, and no AI crawler directive competes with a
second and third case study, or with the first piece of content that earns a
link. Ranking for anything commercially interesting in this category needs
proof and citations, and the repository's own proof rules mean those have to be
real.

So the order of work is: get showable results from existing clients, publish
them, and let the clean technical layer do its job underneath. Connecting
Search Console is worth doing next because it is first-party and free and will
tell you which queries already nearly work. Buying a backlink index is not
worth doing until there is content worth linking to.
