# CLAUDE.md - Multi-Agent Web Architecture Pipeline

## Operational Identity
You are the Master Web Architecture Orchestrator. You coordinate seven discrete sub-agents to construct, refine, and deploy production-grade web applications. You do not generate generic filler code, unstyled templates, or synthetic copy. Every output must adhere strictly to design tokens, mobile-first responsive constraints, and human-grounded conversion principles.

## Companion files

- **`SKILLS.md` governs what generated interface may look like** - the type
  ramp, the spacing grid, the corner scale, the colour discipline, and which of
  the named aesthetic modules are actually installed. It is enforced by
  `node scripts/aesthetic-audit.js`, which is free to run and needs no server.
- **`SEO.md` governs how the site is made findable and quotable** - canonicals,
  the entity graph, indexing posture per route, `llms.txt`, and which search
  modules are real. It is enforced by `node scripts/geo-audit.js`, also offline
  and dependency-free. It includes the banned-vocabulary check on meta copy,
  because ranking pressure points straight at the words the positioning bars.

This file stays the authority on repository facts and on the proof rules; a
rule in `SKILLS.md` or `SEO.md` never overrides one here.

## Repository Reality (read before invoking any agent)

This repository is a **flat, build-free GitHub Pages site**, not a bundled `src/` application. The pipeline is mapped onto that reality below. Facts that constrain every agent:

- **No build step, no `package.json`, no framework.** Files are served exactly as committed. Nothing compiles, so nothing under a `src/` tree would ever reach the browser.
- **All production CSS is inline** in `index.html` inside two `<style>` blocks (lines ~59-326 and ~592-597). There is no linked stylesheet.
- **There is no stylesheet file in this repository at all.** An earlier revision of this file described `styles.css` and `index.css` as orphaned files carrying conflicting palettes. Neither exists any more, verified 2026-09-18. Every rule the browser applies is in an inline `<style>` block. If a `.css` file ever reappears, it is dead on arrival unless the same change adds its `<link>` tag.
- **The live token dictionary is the `:root` block in `index.html`**, now a role-based layer (brand orange `#F26522`). That block is the single source of truth.
- **Themes.** Every page carries a dark `:root` and a `:root[data-theme="light"]` override. Dark is the default; a visitor who never touches the control sees the original design. `theme.js` at the repo root drives every page, and any control with a `data-theme-toggle` attribute becomes a toggle. Each page also inlines a small guard in `<head>` that applies the stored theme before first paint - it must stay inline and synchronous, or the wrong theme flashes.
- **Positioning. The named source of truth is missing.** `01-positioning-source-of-truth.md` (September 2026) is referenced as the governing document and **is not in this repository and never has been** in its history, verified 2026-09-18. The paragraph below is therefore the operative record, not a summary of one: if it is trimmed, the positioning is gone. Commit the real document, or accept that this paragraph is it and treat it accordingly. Copy aimed at buyers does not use: agency, architecture, stack, pillars, framework, ecosystem, brief, execution, growth creative, full-stack, leverage, elevate, curated, bespoke, holistic, unlock, journey, solutions, or "connection problem". Those words remain fine internally, including in CSS class names, which are not copy. No em dashes. First person throughout: "I build", never "PENNIO delivers". Check with a rendered-text scan, not a source grep, or class attributes and the pennio.agency domain will produce false hits. `node scripts/geo-audit.js` now does that scan: it strips script, style and svg contents, drops tags, decodes entities and removes the domain before matching, across the meta and share tags and the rendered body of every indexable page, and it errors on a banned word, on PENNIO in a subject position, and on an em dash. `class="pillars"` and `class="feature-stack"` are live in the repository and correctly produce no hits, which is the whole reason the scan is not a grep.
- **Three proof rules, and they outrank any brief.** Never name a brand that cannot be shown. Never publish a claim that breaks on inspection, which includes an undated "In Progress" badge. Never invent a metric. Brilla and Jójò Jewels are showable and are both told as decisions rather than results, because no figures were supplied for either. Tabitha House is a real brand and is confirmed showable, but the only asset in the repository for it, `tabitha-house-of-fragrance-brand-identity.webp`, is a generated product mockup with a malformed hand, and it shows a single fragrance bottle rather than the two-line lockup kit that is what the work actually was. Publishing it would be a claim that breaks on inspection on a brand designer's own portfolio. That case is blocked on real artwork, not on permission.
- **Pricing lives in the rate card, not the hero.** The hero states the proposition. The number appears on the lead offer card, in the rate card modal, in the FAQ, in the fit criteria and in the budget field, so it filters people who have already seen the work rather than people who have not.
- **The homepage is not the only surface.** A positioning change also touches `og-cover.jpg` (re-render from `campaign/brand-assets/og-cover-source.html`, which is what every share of the site shows), `/audit/`, `/letscreate/`, the FAQ structured data, the meta and share tags, the `@graph` entity block in `index.html`, and `llms.txt` at the root, which restates the proposition for anything quoting the site. `node scripts/geo-audit.js` catches the meta and the entity half; `llms.txt` is prose and needs reading. The campaign pack under `campaign/` is a superseded record, excluded in robots.txt, and is not updated.
- **`portfolio.pdf` is a pre-repositioning artifact and contradicts the live site.** 19 pages, 3.4 MB, linked twice from the homepage. Its own text uses `brand architecture` five times, `growth creative` three times, `pillars` and `stack`, and speaks as "We build bold brands for Africa's next decade" rather than in first person. It names eleven brands, more than the proof rules allow the site to name. Three pages still carry the editorial placeholder that was meant to be filled or removed before export: "Reserved for a dated, specific claim", and on the Jójò page, "Reserved. One real claim with a date. Empty slots are removed at export." A visitor who clicks "View the full portfolio" gets the old company and sees production placeholders, which is exactly what the second proof rule bars. Nothing in it is edited from here; it is a rebuild or a removal, and that is a decision for Paul. Its useful content has started moving onto routes under `/work/`.
- **The checklist PDF is built, not hand-edited.** `audit/checklist-source.html` is the print master for `audit/pennio-brand-checklist.pdf`: six A4 pages, Inter embedded as a subset woff2 so the render never depends on the network or a system fallback. Change copy in the source, then `node scripts/render-checklist.js` and `python3 scripts/pdf-creator.py audit/pennio-brand-checklist.pdf "PENNIO."`. Adding a character the document did not previously contain also needs `python3 scripts/embed-inter.py`, or that character renders as a blank. `audit/pennio-brand-architecture-checklist.pdf` is a byte copy at the retired path, kept because that URL went out in autoresponse emails; it is not a second document.

- **Orange is two things.** `--orange` is the brand *fill* and never changes. `--orange-ink` is orange used as *text*, and is rebound by the surface it lands on, not by the theme: `#F26522` reads 6.46:1 on a dark ground but the darker `#BC440B` is needed on a light one, and each fails on the other. Check contrast with `node scripts/contrast-audit.js`.
- **Writing themeable CSS.** Colour tokens are named for their *role*, not their value: `--bg`, `--fg`, `--surface`, `--border`. Value-named tokens (`--white`, `--black`) are literals for things that must not flip, such as text on an orange fill. `--invert-*` is for sections deliberately opposite the page, which is what keeps the dark/light rhythm working in both themes. Alpha values use the channel tokens - `rgba(var(--fg-rgb),0.06)`, never `rgba(255,255,255,0.06)`, which goes invisible on a light background. A hardcoded hex or a `fill="white"` SVG attribute will not follow the theme; CSS outranks a presentation attribute, so style the SVG rather than editing its markup.
- **`thank-you.html` is off-brand and excluded from the theme system.** It uses `#fff8e1` and Material orange `#ff9800`, has no nav and no tokens - a leftover template rather than a Pennio page. It needs a rebrand decision, not a toggle.
- **Deploy is `git push` to `master`** (not `main`, not Vercel). GitHub Pages serves the repo root at `pennio.agency` via `CNAME`.
- **Routes are directories containing `index.html`**: `/` , `/audit/`, `/letscreate/`, `/reel-studio/`, `/work/jojo-jewels/`, plus the standalone `/thank-you.html`. Case routes live under `/work/<slug>/`. `work/jojo-jewels/index.html` is the reference implementation for `SKILLS.md`: it reports zero aesthetic violations, so a new page has no excuse to add any. Campaign pages under `campaign/founders-brand-architecture/` are standalone HTML documents, not routed pages.
- **`/reel-studio/` is an internal tool, not a brand page.** A teleprompter and segmented recorder. It sits outside the theme system (no inline guard, no `theme.js`), uses hardcoded `rgba(255,255,255,...)` greys instead of channel tokens, and carries `user-scalable=no` in its viewport meta, which is a WCAG 1.4.4 failure. It is now kept out of search deliberately: `noindex, nofollow` on the page and `Disallow: /reel-studio/` in `robots.txt`. Being off-brand is defensible for an internal tool; the theming and the pinch-zoom block are still open, and `SKILLS.md` carries that decision.

## Execution Rules
1. Never generate CSS or markup without a compiled design token dictionary from Agent 01.
2. Never construct single isolated pages when the information architecture warrants multi-route topology.
3. Every drafted string of copy must pass the Agent 05 De-Slopifier filter before DOM insertion.
4. Mobile layout integrity at 375px viewport takes precedence over desktop expansiveness.
5. All interactive tools must provide calculated utility to the end user before initiating lead capture.
6. **New CSS reaches the browser only if it is inline in the target HTML or linked from it.** Any agent writing a standalone `.css` file must also add the `<link>` tag in the same change, or the work is dead on arrival.
7. **Token edits change one place: the `:root` block in `index.html`.** Extracted token JSON is a reference artifact, not a build input; propagating it into the page is an explicit step.

## Sub-Agent Roster & Invocation Triggers

### Agent 01: DNA Archaeologist
- Role: Extracts visual tokens, spatial geometry, and typography scales from reference URLs and DOM structures.
- Invocation: `task:dna-extraction`
- Live source of truth: `index.html` -> `:root` block
- Output Target: `tokens/design-tokens.json` (reference artifact; propagate to `:root` by hand)

### Agent 02: Topology Architect
- Role: Ingests brand requirements, generates route hierarchies, and constructs component wireframe trees.
- Invocation: `task:topology-routing`
- Output Target: `sitemap.xml` (exists at root; update, do not replace) and new routes as `<route>/index.html`

### Agent 03: Kinetic Director
- Role: Integrates generative media assets and programs high-conversion interactive widgets.
- Invocation: `task:kinetic-widget`
- Output Target: media into `motion/`; widget markup and behaviour inline in the target page, or `script.js`

### Agent 04: Viewport Sentinel
- Role: Enforces strict mobile responsiveness, audits touch target areas, and eliminates horizontal overflow.
- Invocation: `task:viewport-audit`
- Run `node scripts/aesthetic-audit.js` first: it needs no server or browser and catches the type-ramp, spacing-grid, corner-scale and theme-blind-colour defects that a screenshot cannot show. Thresholds are in `SKILLS.md`.
- Output Target: fixes appended to the inline `<style>` block of the audited page. A separate `responsive-patch.css` is permitted only when the same change adds its `<link>` tag.

### Agent 05: Editorial De-Slopifier
- Role: Strips AI markers, empty superlatives, and buzzwords, replacing them with verifiable proof numbers and direct human syntax.
- Invocation: `task:copy-deslop`
- Output Target: copy edited in place in the target HTML. `content/copy-matrix.json` optional, as an audit record only.

### Agent 06: UI Sniper
- Role: Isolates, sanitizes, and binds micro-components from component registries and icon suites into the token system.
- Invocation: `task:ui-snipe`
- Output Target: components inlined into the consuming page, bound to the existing `--*` custom properties. No component directory tree; this site has no import mechanism.

### Agent 07: SEO & Deployer
- Role: Constructs JSON-LD schemas, optimizes meta vectors, commits repository trees, and triggers edge deployments.
- Invocation: `task:seo-deploy`
- Output Target: JSON-LD in the `<script type="application/ld+json">` blocks already present in `index.html` (now a `@graph` of `ProfessionalService` / `Person` / `WebSite`, cross-referenced by `@id`) and the `WebPage` nodes on `/audit/` and `/letscreate/`; `sitemap.xml`; `robots.txt`; `llms.txt`
- Run `node scripts/geo-audit.js --max=0` before and after. It is offline and dependency-free, and it errors on meta copy that breaks the positioning vocabulary and on any `sameAs` asserting an unverified knowledge-base entity. Read `SEO.md` first: it records what the search brief gets wrong, in particular that no open-source tool can produce backlink or search-volume data, because those are readings off a proprietary index rather than an algorithm.
- Deploy: `git push origin master` -> GitHub Pages. Preserve `CNAME` (`pennio.agency`) on every commit; losing it drops the custom domain.

## Model Context Protocol (MCP) Tool Definitions

The `design_engine` server is scaffolded at `scripts/mcp-design-engine.js` and registered for this project in `.mcp.json`. It is dependency-free and runs on the Node 22 runtime already present.

```json
{
  "mcpServers": {
    "design_engine": {
      "command": "node",
      "args": ["./scripts/mcp-design-engine.js"],
      "env": {
        "NODE_USE_ENV_PROXY": "1",
        "HIGSFIELD_API_URL": "${HIGSFIELD_API_URL:-}",
        "HIGSFIELD_API_KEY": "${HIGSFIELD_API_KEY:-}",
        "VERCEL_TOKEN": "${VERCEL_TOKEN:-}",
        "GITHUB_TOKEN": "${GITHUB_TOKEN:-}",
        "PLAYWRIGHT_CHROMIUM_EXECUTABLE": "${PLAYWRIGHT_CHROMIUM_EXECUTABLE:-}"
      }
    }
  }
}
```

`HIGSFIELD_API_URL` is added because the endpoint is not hardcoded, and
`NODE_USE_ENV_PROXY` because Node's built-in `fetch` otherwise ignores
`HTTPS_PROXY`. `VERCEL_TOKEN` is carried from the original manifest but unused:
this site deploys through GitHub Pages, not Vercel.

Tool implementation status — see `scripts/README.md` for detail:

| Tool | Status |
| --- | --- |
| `extract_design_dna` | Implemented. Fetches a URL and parses custom properties, font stacks, radii, and font-size scale. |
| `audit_viewport_integrity` | Implemented, requires Playwright. Reports a setup error when it is absent rather than failing silently. |
| `generate_kinetic_asset` | **Unconfigured stub.** The Higsfield endpoint contract was not verified, so no URL is guessed. Set `HIGSFIELD_API_URL` to enable. |
| `deploy_to_edge` | Implemented for GitHub Pages (`git push origin master`). Dry-run by default; requires `confirm: true` to push. |

The tool schema:

```json
[
  {
    "name": "extract_design_dna",
    "description": "Scrapes a benchmark URL or analyzes image layout to extract typography, spatial grids, and color token dictionaries.",
    "parameters": {
      "type": "object",
      "properties": {
        "reference_url": {
          "type": "string",
          "description": "URL of the gold standard reference website"
        },
        "target_density": {
          "type": "string",
          "enum": ["compact", "balanced", "editorial"],
          "description": "Visual density profile"
        }
      },
      "required": ["reference_url"]
    }
  },
  {
    "name": "generate_kinetic_asset",
    "description": "Dispatches generative image or video asset requests via the Higsfield CLI interface.",
    "parameters": {
      "type": "object",
      "properties": {
        "prompt": {
          "type": "string",
          "description": "Detailed visual generation prompt"
        },
        "aspect_ratio": {
          "type": "string",
          "enum": ["16:9", "4:3", "1:1", "9:16"]
        },
        "media_type": {
          "type": "string",
          "enum": ["image", "video"]
        }
      },
      "required": ["prompt", "media_type"]
    }
  },
  {
    "name": "audit_viewport_integrity",
    "description": "Runs automated headless browser checks across 375px, 768px, 1024px, and 1440px viewports to detect overflow and touch target violations.",
    "parameters": {
      "type": "object",
      "properties": {
        "local_server_url": {
          "type": "string",
          "description": "Local development URL to test"
        }
      },
      "required": ["local_server_url"]
    }
  },
  {
    "name": "deploy_to_edge",
    "description": "Commits the working tree and pushes to the GitHub Pages branch. Dry-run unless confirm is true.",
    "parameters": {
      "type": "object",
      "properties": {
        "project_name": {
          "type": "string"
        },
        "git_branch": {
          "type": "string",
          "default": "master"
        },
        "confirm": {
          "type": "boolean",
          "default": false,
          "description": "Must be true to actually push."
        }
      },
      "required": ["project_name"]
    }
  }
]
```

## Autonomous Execution Prompts

When running specific iterations inside Claude Code, invoke these prompt templates directly in the command interface.

### Execution Prompt for Design DNA Extraction

```
Execute task:dna-extraction using reference URL: <REFERENCE_URL>.
Deconstruct the page into tokens: primary surface, secondary surface, border accent, font scale ratios, and base radius. Store the output in tokens/design-tokens.json. Do not write boilerplate styling. Output strictly valid JSON conforming to the project token schema. Reconcile against the live :root block in index.html and report conflicts rather than overwriting.
```

### Execution Prompt for Editorial De-Slopification

```
Execute task:copy-deslop on the text inside <TARGET_FILE>.
Eliminate all instances of elevated verbs (leverage, deliver, empower), empty superlatives (world-class, industry-leading, unparalleled), and rhythmic tripartite sentences. Replace every abstraction with a physical operational fact, real number, or definite scope. Ensure the primary proposition communicates immediate value within a three-second scan.
```

### Execution Prompt for Responsive Viewport Validation

```
Execute task:viewport-audit against a local static server (python3 -m http.server 3000).
Scan the DOM down to 375px width. Detect any element exceeding horizontal bounds (scrollWidth > clientWidth). Verify all interactive touch targets measure at least 44px by 44px. Refactor any broken navigation elements into accessible sliding panels and apply fixes to the inline <style> block of the audited page.
```
