# SKILLS.md - Aesthetic Intelligence Engine

Architectural guidelines for autonomous front-end design on this repository:
calibrated typographic hierarchy, disciplined spatial rhythm, and verified
visual execution.

## How this file relates to CLAUDE.md

`CLAUDE.md` governs **what is true about this repository** - the routes, the
token dictionary, the theme system, the positioning vocabulary, the three proof
rules, how the site deploys. It is the authority on all of that and this file
does not restate or override it.

`SKILLS.md` governs **what generated interface is allowed to look like**. Where
the two touch, CLAUDE.md wins: a rule here never licenses naming a brand that
cannot be shown, inventing a metric, using a forbidden word in buyer-facing
copy, or writing a colour literal that will not follow the theme.

The distinction that matters in practice: CLAUDE.md's rules are about truth and
are enforced by reading. The rules here are about form and are enforced by
`scripts/aesthetic-audit.js`, which measures the page rather than trusting the
prose. Every threshold below is a number in that script. Changing a threshold
means changing both, deliberately.

## Repository reality for the aesthetic layer

Measured on 2026-09-18 with `node scripts/aesthetic-audit.js`. These are the
facts a generation pass has to work against, not aspirations.

- **The colour layer is a real system. The type, space and corner layers are
  not.** `index.html`'s `:root` is a disciplined role-based palette with channel
  tokens and per-surface orange ink. There is no `--text-*` scale, no
  `--space-*` scale and no `--radius-*` scale on the homepage. Sizes and
  spacing are written as literals at the point of use.
- **The homepage declares 31 distinct font sizes at 375px** (9.92px to 44.8px)
  **and 33 at full width** (9.92px to 89.6px). 24 adjacent pairs sit closer
  than 1.06x, including 15.04/15.2px and 15.2/15.36px. Those are not steps in a
  hierarchy; they are the same size typed twice. This is the single largest
  piece of aesthetic debt in the repository.
- **Two body typefaces ship on one site, from two CDNs.** `index.html` and
  `/audit/` load **Inter** from Google Fonts. `/letscreate/` loads **General
  Sans** from Fontshare and sets `--font-body: 'General Sans', Inter,
  sans-serif`. This is not the display/functional pairing the brief asks for -
  it is the same role filled by two different faces on adjacent pages, which a
  visitor moving between them will read as two different companies.
- **`/letscreate/` already carries the design system the homepage lacks.** It
  defines `--text-xs` through `--text-3xl` (7 fluid steps, ratios tightening
  from 1.4 at display sizes to 1.125 at UI sizes) and `--space-1` through
  `--space-24`. 28 of its 36 `font-size` declarations go through those tokens,
  and it uses `var(--space-*)` 61 times. The remaining 8 literals are why it
  still reports 11 type steps rather than 7.
- **Corner scales are scattered**: 4 on the homepage (4px, 10px, 6px, 8px),
  7 on `/letscreate/`, 7 on `/reel-studio/`. `extract_design_dna` reports
  `base_radius: 4px` because that is the plurality, not because it is the rule.
- **`/reel-studio/` sits outside the token system**: no theme guard, no
  `theme.js`, hardcoded `rgba(255,255,255,...)` greys instead of channel
  tokens, and a viewport meta carrying `user-scalable=no`, which is a WCAG
  1.4.4 failure. It is an internal recording tool, so being off-brand is
  defensible; being invisible to the documentation was not, and CLAUDE.md now
  records it as a route. It is also now kept out of search deliberately - see
  `SEO.md` - so what remains open here is the theming and the pinch-zoom
  block.
- **The literals the static audit flags are also real contrast failures.** Two
  of `/letscreate/`'s hardcoded colours are the evidence: `#6c4d3b` in
  `.apply-bar` measures 2.24:1 in the light theme, and `#6c635b`, written into
  an inline `style` attribute at `letscreate/index.html:538`, measures 3.16:1
  against the dark page. Both are values a role token already covers
  (`--invert-muted` is literally `#6c635b`). A colour written outside the token
  blocks does not merely resist the theme; it breaks under it. The audit counts
  10 such literals on the homepage, 6 on `/letscreate/` and 1 on `/audit/`.

`node scripts/aesthetic-audit.js` currently reports **24 violations across all
five pages**. That number is the baseline. It should go down, and no change
should raise it.

## Core principles: anti-generic heuristics

AI-generated interfaces default to centered hero text, arbitrary rounded cards,
and unearned gradients. Four constraints, each with the number the audit
enforces.

### Intentional hierarchy

One dominant element per viewport. Never distribute visual weight evenly across
competing cards or callouts.

Not mechanically checkable, so it is enforced by screenshot review (see the
loop below) rather than by the script. The proxy the script does measure is the
type ramp: a page with 31 near-identical sizes cannot express a dominant
element, because nothing is decisively larger than its neighbour.

### Typographic restraint

- **At most 2 non-monospace typefaces**, site-wide, in defined roles: one
  display face, one functional face. Monospace is exempt because timecodes and
  counters need it. Today the site has two faces filling *one* role, which is
  the failure mode this rule exists to catch.
- **At most 9 distinct font sizes per page.** Long ramps are not hierarchy.
- **Adjacent steps at least 1.06x apart.** Below that the eye reads them as
  equal and the extra size buys nothing but inconsistency.
- Ratios progress: roughly 1.125 between UI sizes, widening toward 1.333-1.414
  at display sizes. A single flat ratio across the whole ramp either makes body
  text unusable or makes headlines timid.

### Calibrated white space

Space is structural, not empty. Systematic increments only: **8, 16, 24, 32,
48, 64, 80, 120px**, with 4px permitted for hairline offsets and optical
corrections.

The audit fails any padding, margin or gap off the 4px grid and separately
reports values on 4px but off 8px, so the 4px allowance stays visible as an
exception rather than becoming the default.

### Restrained colour

A resolved neutral foundation with a single deliberate accent, reserved for
high-intent actions. The repository already satisfies this: brand orange
`#F26522` is the only accent, and `--orange` (fill) and `--orange-ink` (text,
rebound per surface) keep it legible. Nothing here licenses a second accent.

Colour is written as role tokens only. The audit flags every literal hex and
every `rgba(255,255,255,...)` or `rgba(0,0,0,...)` outside the `:root` blocks,
because those are the values that go invisible when the theme flips. It scans
inline `style` attributes as well as the `<style>` blocks, since an attribute
never appears in a block and is where such a literal usually survives review.

### Corner scale

**At most 3 corner scales per page.** Pills (`50%`, `999px`) are shape
decisions and exempt. Shorthand radii (`0 0 4px 0`) are one-off shapes and
exempt. Arbitrary rounding is the most recognisable AI tell on a page.

## Toolchain modules

```
                    AESTHETIC HARNESS
                           |
      +-------------+------+------+-------------+
      |             |             |             |
    taste       impeccable   awesome-design   img2threejs
 (rule engine)  (vocabulary)   (tokens)       (procedural 3D)
      |             |             |             |
      +-------------+------+------+-------------+
                           |
              aesthetic-audit.js  (static, always available)
                           |
            Playwright + contrast-audit.js  (rendered)
```

All five named modules are real projects. None of the first four is installed
in this repository, and this file does not pretend otherwise.

| Module | Source | Status here |
| --- | --- | --- |
| `taste` | [tasteskill.dev](https://www.tasteskill.dev/) | Not installed. Rule engine; parameterises design variance, motion intensity, visual density. Scoped by its authors to landing pages and portfolios, which is what this site is. |
| `impeccable` | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) | Not installed. Design vocabulary (polish, audit, distill, bolder, quieter), live in-browser mode, and a `detect` CLI for slop patterns in CI. |
| `awesome-design-md` | [VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md) | Not installed. Benchmark `DESIGN.md` token sheets from real design systems. |
| `img2threejs` | [img2threejs/img2threejs](https://github.com/img2threejs/img2threejs) | Not installed. MIT. Rebuilds reference imagery as code-only procedural Three.js rather than a mesh download. |
| Playwright | Installed globally, **1.56.1** | **Working.** Chromium at `/opt/pw-browsers`. Drives `audit_viewport_integrity` and `contrast-audit.js`. |

What *is* installed is a different aesthetic layer: twelve skills vendored from
`emilkowalski/skills` into `.agents/skills/`, hash-locked in `skills-lock.json`
(`animate`, `apple-design`, `emil-design-eng`, `review-animations`,
`improve-animations`, `find-animation-opportunities`, `animation-vocabulary`,
`pick-ui-library`, `prototype`, `ask-sonner`, `animate-expo`, `write-swift`).
Those cover the taste-heuristic and vocabulary ground that Modules A and B
describe. **Use them before proposing an install.** Adding `taste` or
`impeccable` alongside them would put two rule engines in the same session with
no arbitration between them, which is worse than either alone.

### Before installing any module

Vendor it into `.agents/skills/` and record source and hash in
`skills-lock.json`, matching the existing pattern. An unpinned skill fetched at
run time is a silent dependency on someone else's edit history.

### Module D is blocked on a budget decision, not a capability

Three.js is on the order of 600KB minified, roughly 150-170KB gzipped over the
wire. This site is build-free, so there is no tree-shaking to trim that: a CDN
`<script>` ships the whole library. The page already has one render-blocking
third-party request - the Google Fonts stylesheet - and Three.js would be by a
wide margin the largest script on it. The existing motion layer
(`pennio-logo-morph.mp4`, the CSS perspective grid, the `mix-blend-mode` loops)
achieves spatial depth for a fraction of that. Do not add Three.js to a routed
page without an explicit decision. A standalone page under `motion/` is the
low-risk place to try it.

## The autonomous loop, as it actually runs here

Four gates. The first is free and belongs on every change; the rest need a
local server.

```sh
# 1. Static conformance. No server, no browser, no dependencies.
node scripts/aesthetic-audit.js --max=24    # the gate: fail above 24
node scripts/aesthetic-audit.js             # every violation, always fails today
node scripts/aesthetic-audit.js --json --max=24
node scripts/aesthetic-audit.js index.html --max=7

# 2. Serve the site.
python3 -m http.server 3000

# 3. Rendered geometry: overflow and 44px touch targets at 375/768/1024/1440.
#    Through the design_engine MCP tool audit_viewport_integrity.

# 4. Rendered colour: every text node in both themes against WCAG AA.
node scripts/contrast-audit.js
```

Gate 1 catches what the declarations already reveal. Gates 3 and 4 catch what
only compositing reveals. Neither substitutes for the other: the type ramp is
invisible to a screenshot, and a translucent overlay is invisible to a grep.

**Use `--max`, not the bare run.** With 24 known violations a plain invocation
fails by design, and a check that always fails gets ignored within a day.
`--max=24` tolerates today's debt, fails anything that adds to it, and prints
the lower ceiling to adopt once the count drops. The number only ever goes
down, and lowering it is the commit that locks in a fix. Per page: `index.html`
7, `audit/index.html` 6, `letscreate/index.html` 7, `reel-studio/index.html` 3,
`thank-you.html` 1.

**Then look at the screenshots.** A page can pass all four gates and still be
badly composed. Capture 375px and 1440px in both themes and read them before
calling a component done. Playwright resolves from the global install now, so:

```js
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
```

`audit_viewport_integrity` handles this itself - it searches `NODE_PATH`, the
npm global root beside the running interpreter, and `PLAYWRIGHT_MODULE_PATH`
before reporting Playwright absent. Before this it reported a setup error on a
machine that already had a working copy.

## The reference implementation

`work/jojo-jewels/index.html` is built to this document and reports **zero
violations**: one typeface, a five-step ramp, every spacing value on the 8px
cadence, two corner scales, and no colour literal outside the token blocks. It
carries its own `--text-*` and `--s-*` scales inline, which is what the
homepage still lacks.

Copy it when starting a page. It also settles open decision 2 in the small:
the scale works, it is shipped, and nothing about it required a build step.

## Open decisions - do not resolve these unilaterally

Each is a visible brand change with real cost. They are named here so they get
decided rather than drifting.

1. **One body face or two?** Inter and General Sans currently split the same
   role across pages. Converging on Inter costs `/letscreate/` its distinct
   feel and removes a Fontshare dependency. Converging on General Sans means
   re-rendering `audit/pennio-brand-checklist.pdf`, whose subset woff2 is Inter
   (`scripts/embed-inter.py`), plus `og-cover.jpg`. Adding General Sans as a
   deliberate *display* face beside Inter as the functional face is the third
   option and the only one that satisfies the brief as written. It is also a
   second font request on every page.
2. **Which type scale?** `/letscreate/`'s 7-step `--text-*` ramp is shipped,
   fluid, and roughly ratio-correct. Promoting it to `index.html` is the
   cheapest route to a real hierarchy and avoids inventing a third system.
   Doing so re-sizes most text on the homepage, which is a visual change to the
   highest-traffic page on the site and needs sign-off, not a commit.
3. **Corner scale.** Pick three from {4px, 8px, 12px} and map everything to
   them. 10px on the homepage and 28.8px on `/letscreate/` both have to move.
4. **`/reel-studio/`.** The search half is settled: it is declared an internal
   tool, carries `noindex, nofollow`, and is disallowed in `robots.txt` as
   `campaign/` is. What is still open is whether to bring it into the token
   system and fix `user-scalable=no`, or leave it as an off-brand internal
   tool. Leaving it is defensible; `user-scalable=no` is a WCAG 1.4.4 failure
   either way and should go regardless of the theming decision.
5. **`thank-you.html`.** CLAUDE.md already records this as needing a rebrand
   decision. It declares Inter without loading it, so it renders in a system
   fallback.
6. **Three footer links on `/letscreate/` are 23px tall.** `.footer-links a`
   for "The Problem", "What we build" and "Apply" measure 81x23, 93x23 and
   35x23, all under the 44px WCAG 2.5.8 minimum, at every width. The header
   `.brand-lockup` had the same defect and is fixed, because `.nav` is
   min-height 76px and absorbed it with no visual change. The footer row has no
   such slack: `min-height: 44px` there grows the footer by about 21px. That is
   a small, defensible change on a footer, but it is a visual one, so it is
   named here rather than made. The fix is one line:
   `.footer-links a { display: inline-flex; align-items: center; min-height: 44px; }`
   plus `row-gap: 0` on `.footer-links` so a wrapped row does not double-space.
7. **White on orange is 3.15:1.** `scripts/README.md` records this as a brand
   decision, not a defect, with two remedies that both alter the most
   recognisable element on the site. Unchanged and still open.

## What this file does not authorise

- Refactoring the homepage type scale, or adding or removing a typeface,
  without a decision from the list above.
- Adding Three.js, or any CDN dependency, to a routed page.
- A second accent colour.
- Relaxing a threshold in `scripts/aesthetic-audit.js` to make a page pass.
  The threshold is the rule; if it is wrong, argue it here first.
- Raising `--max`. The ceiling moves down only.
