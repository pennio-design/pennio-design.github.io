# design_engine MCP server

Backs the seven-agent pipeline described in `../CLAUDE.md`. Registered for this
project in `../.mcp.json`; Claude Code starts it automatically.

Dependency-free: this repository has no `package.json` and no `node_modules`, so
the server speaks JSON-RPC over stdio directly and uses only the Node 22 standard
library. Nothing to install before first use.

## Tool status

| Tool | Status | Needs |
| --- | --- | --- |
| `extract_design_dna` | Working | Network access to the reference URL |
| `audit_viewport_integrity` | Working | Playwright (see below) |
| `deploy_to_edge` | Working, dry-run by default | Git push rights |
| `generate_kinetic_asset` | **Unconfigured stub** | `HIGSFIELD_API_URL` + `HIGSFIELD_API_KEY` |

### extract_design_dna

Fetches a URL, reads its inline `<style>` blocks and up to eight linked
stylesheets, and returns custom properties, font stacks, the border-radius set,
and the font-size scale.

`base_radius` is the most frequently declared single-length radius. Shorthand
values (`0 0 4px 0`), zeros, and percentages (`50%`, a circle) are excluded from
that vote, so the result reflects the corner scale rather than one-off shapes.

Verified against this repository's own `index.html`: 17 custom properties,
`--orange: #F26522`, `base_radius: 4px` (6 declarations, the button radius).

### audit_viewport_integrity

Loads a URL at 375, 768, 1024, and 1440px and reports horizontal overflow plus
touch targets under 44x44px.

Two filters keep the output trustworthy:

- **Clipped elements are skipped.** Anything inside an ancestor whose
  `overflow-x` is not `visible` cannot widen the page. Without this, animated
  marquees and decorative transformed grids produce dozens of "overflow" reports
  on a page that does not actually scroll sideways.
- **Hidden and inline elements are skipped.** Off-screen skip links are not
  layout bugs, and WCAG 2.5.8 exempts targets rendered inline within a sentence.

Playwright is not bundled, but it is no longer required to be local. This
repository has no `package.json` and no `node_modules`, so a bare
`require('playwright')` resolves nothing even on a machine that has Playwright
installed - Node walks parent `node_modules` directories, and the npm global
root is not one of them. `loadPlaywright()` therefore tries, in order:

1. `require('playwright')` - a local install, if one is ever added
2. `PLAYWRIGHT_MODULE_PATH`, if set
3. every entry in `NODE_PATH`
4. the npm global root beside the running interpreter, derived from
   `process.execPath`: with node at `<prefix>/bin/node`, packages are at
   `<prefix>/lib/node_modules`
5. `/usr/local/lib/node_modules` and `/usr/lib/node_modules`

Only a `MODULE_NOT_FOUND` naming that exact candidate advances the loop. A copy
that is present but throws while loading is a real fault and propagates. When
every candidate misses, the error lists what it searched.

This matters because the tool previously reported "Playwright is not installed"
on a machine carrying a working global copy, which reads as a missing
dependency rather than a resolution failure. Verified against the global
Playwright 1.56.1 in this sandbox: the audit runs and reports `passed: true`
across 375, 768, 1024 and 1440px.

To add a local install instead:

```sh
npm install playwright
```

If the installed Playwright pins a Chromium revision that is not present, set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` to an existing binary rather than downloading a
second copy:

```sh
export PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium-1194/chrome-linux/chrome
```

When Playwright is missing the tool returns a setup error. It does not report a
pass it did not measure.

To audit this site locally:

```sh
python3 -m http.server 3000
# then call audit_viewport_integrity with local_server_url http://127.0.0.1:3000/
```

### deploy_to_edge

Commits the working tree and pushes to the GitHub Pages branch (`master`), which
is what publishes `pennio.agency`. There is no Vercel project; `VERCEL_TOKEN` is
carried in `.mcp.json` because the original manifest specified it, but the
current implementation does not use it.

**Dry-run by default.** Without `confirm: true` it returns the plan — target
branch, current branch, changed files, commit message — and changes nothing.
Pass `confirm: true` to actually commit and push.

`CNAME` must stay in the repo root; losing it drops the custom domain.

### generate_kinetic_asset

Deliberately left unconfigured. The Higsfield request and response contract was
not verified against live documentation, so no endpoint URL is guessed here —
a plausible-looking wrong endpoint is worse than an explicit error.

To enable it, set `HIGSFIELD_API_URL` and `HIGSFIELD_API_KEY`, then confirm the
request body in `generateKineticAsset()` matches the provider's actual contract.
It currently posts `{ prompt, media_type, aspect_ratio }` with a bearer token.

## aesthetic-audit.js

Not an MCP tool, and unlike everything else here it needs no server, no browser
and no dependencies - which is what lets it gate a commit.

```sh
node scripts/aesthetic-audit.js --max=24     # the gate: fail above 24
node scripts/aesthetic-audit.js              # every page, always fails today
node scripts/aesthetic-audit.js --json --max=24
node scripts/aesthetic-audit.js index.html --max=7
```

Static conformance against the thresholds in `../SKILLS.md`: typeface count,
type-ramp length and adjacent step ratios, spacing grid, corner scales, and
colour literals that cannot follow the theme.

**`--max` is the form that gates.** The baseline is 24 violations across five
pages, so a bare run exits 1 by design - a check that always fails gets ignored
within a day. `--max=24` tolerates the known debt, exits 1 on anything that
adds to it, and prints the lower ceiling to adopt once the count drops.
Lowering the number is the commit that locks in a fix; it never goes up. Bad
input to `--max` exits 2, so a typo cannot silently pass.

Per page today: `index.html` 7, `audit/index.html` 6, `letscreate/index.html`
7, `reel-studio/index.html` 3, `thank-you.html` 1. They sum to the 24 above.

Four decisions keep the output honest:

- **Token blocks are excluded from the colour check.** A literal hex inside
  `:root` *is* the palette definition. Without that split every page reports
  its own token block and the output is worthless.
- **Inline `style` attributes are scanned for colour** as well as the `<style>`
  blocks. That is where a theme-blind literal survives review:
  `letscreate/index.html:538` hardcodes `#6c635b` this way, which is 3.16:1 on
  the dark page and is exactly the value `--invert-muted` already holds. Sizes
  and spacing are *not* read from inline attributes, because a one-off nudge is
  a different defect from a systemic one and would distort the ramp counts.
- **A fluid size occupies two steps of the ramp**, its `clamp()` floor and its
  ceiling, analysed as separate scales. Collapsing it to one number hides the
  common failure where the desktop ramp is well spaced and the mobile one is
  flat.
- **Pills and shorthand radii are exempt from the corner scale.** `50%`,
  `999px` and `0 0 4px 0` are shape decisions, not steps on a scale.

The check it deliberately does not attempt is compositional: whether a viewport
has one dominant element. That needs a screenshot, so it stays with the
Playwright loop.

## contrast-audit.js

Not an MCP tool - a standalone script, since it checks the site rather than
driving a generation pipeline.

```sh
python3 -m http.server 3000
node scripts/contrast-audit.js
```

Loads each page in both themes and reports every text node below WCAG AA
(4.5:1 body, 3:1 for large text). It composites translucent backgrounds up the
ancestor chain and resolves gradients to their first colour stop; without that
second step, anything sitting on a gradient reports the page default and the
output is worthless.

Orange used as *text* is handled by `--orange-ink`, which is `#F26522` on dark
grounds (6.46:1) and `#BC440B` on light ones (4.5-5.3:1 across every light
surface in use). It is rebound per surface rather than per theme, because an
inverted section runs opposite to the page: the dark ink would itself fail on a
dark ground at 3.87:1. Brand *fills* are untouched and stay `#F26522`.

What remains is a brand decision, not a defect. White on the brand orange is
3.15:1, so every CTA label falls short of the 4.5:1 body-text threshold, in
both themes, exactly as it did before this work. The two remedies both alter
the most recognisable element on the site, so neither was taken unilaterally:
darken the button fill to `#CD4A0C` (4.57:1 with white), or keep the fill and
switch labels to near-black (about 5.9:1). The oversized decorative numerals
("01") are deliberately near-invisible in both themes.

## Networking note

Node's built-in `fetch` ignores `HTTPS_PROXY` unless `NODE_USE_ENV_PROXY=1`,
which `.mcp.json` sets. In sandboxes with an egress allowlist, a blocked host
surfaces as `Proxy response (403) !== 200 when HTTP Tunneling`; that is the
network policy, not a server fault.

## Manual smoke test

```sh
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"t","version":"1"}}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  | node scripts/mcp-design-engine.js
```

## The checklist PDF

`audit/checklist-source.html` -> `audit/pennio-brand-checklist.pdf`, six A4
pages, no build step and no local server:

```
node scripts/render-checklist.js
python3 scripts/pdf-creator.py audit/pennio-brand-checklist.pdf "PENNIO."
```

`render-checklist.js` refuses to write a PDF when Inter has not loaded, because
a document that silently ships in a fallback face is worse than one that fails
to build. `pdf-creator.py` replaces the User-Agent string Skia stamps into
`/Creator`, padding to the same byte length so the cross-reference table stays
valid.

Inter is embedded in the source rather than linked. Subset to the characters
the document uses, the four faces come to 62 KB; the full family is 843 KB.
After adding a character the document did not previously contain, rebuild the
subset or that character renders as a blank:

```
pip install fonttools brotli
python3 scripts/embed-inter.py
```

That step needs fonts.googleapis.com and fonts.gstatic.com. The render itself
needs neither.
