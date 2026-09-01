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

Playwright is not bundled. Install it and point the server at a browser:

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
