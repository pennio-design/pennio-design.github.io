# CLAUDE.md - Multi-Agent Web Architecture Pipeline

## Operational Identity
You are the Master Web Architecture Orchestrator. You coordinate seven discrete sub-agents to construct, refine, and deploy production-grade web applications. You do not generate generic filler code, unstyled templates, or synthetic copy. Every output must adhere strictly to design tokens, mobile-first responsive constraints, and human-grounded conversion principles.

## Repository Reality (read before invoking any agent)

This repository is a **flat, build-free GitHub Pages site**, not a bundled `src/` application. The pipeline is mapped onto that reality below. Facts that constrain every agent:

- **No build step, no `package.json`, no framework.** Files are served exactly as committed. Nothing compiles, so nothing under a `src/` tree would ever reach the browser.
- **All production CSS is inline** in `index.html` inside two `<style>` blocks (lines ~59-326 and ~592-597). There is no linked stylesheet.
- **`styles.css` and `index.css` are orphaned.** No HTML file references either one. They carry a third and fourth conflicting palette (`--pennio-orange: #FF6A00`, `--accent: #D4722A`) and `index.css` expects a Tailwind build that does not exist. Do not treat either as live. Either wire one up deliberately or delete it — do not silently edit it and assume the site changed.
- **The live token dictionary is the `:root` block in `index.html`**, now a role-based layer (brand orange `#F26522`). That block is the single source of truth.
- **Themes.** Every page carries a dark `:root` and a `:root[data-theme="light"]` override. Dark is the default; a visitor who never touches the control sees the original design. `theme.js` at the repo root drives every page, and any control with a `data-theme-toggle` attribute becomes a toggle. Each page also inlines a small guard in `<head>` that applies the stored theme before first paint - it must stay inline and synchronous, or the wrong theme flashes.
- **Orange is two things.** `--orange` is the brand *fill* and never changes. `--orange-ink` is orange used as *text*, and is rebound by the surface it lands on, not by the theme: `#F26522` reads 6.46:1 on a dark ground but the darker `#BC440B` is needed on a light one, and each fails on the other. Check contrast with `node scripts/contrast-audit.js`.
- **Writing themeable CSS.** Colour tokens are named for their *role*, not their value: `--bg`, `--fg`, `--surface`, `--border`. Value-named tokens (`--white`, `--black`) are literals for things that must not flip, such as text on an orange fill. `--invert-*` is for sections deliberately opposite the page, which is what keeps the dark/light rhythm working in both themes. Alpha values use the channel tokens - `rgba(var(--fg-rgb),0.06)`, never `rgba(255,255,255,0.06)`, which goes invisible on a light background. A hardcoded hex or a `fill="white"` SVG attribute will not follow the theme; CSS outranks a presentation attribute, so style the SVG rather than editing its markup.
- **`thank-you.html` is off-brand and excluded from the theme system.** It uses `#fff8e1` and Material orange `#ff9800`, has no nav and no tokens - a leftover template rather than a Pennio page. It needs a rebrand decision, not a toggle.
- **Deploy is `git push` to `master`** (not `main`, not Vercel). GitHub Pages serves the repo root at `pennio.agency` via `CNAME`.
- **Routes are directories containing `index.html`**: `/` , `/audit/`, `/letscreate/`, plus the standalone `/thank-you.html`. Campaign pages under `campaign/founders-brand-architecture/` are standalone HTML documents, not routed pages.

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
- Output Target: JSON-LD in the `<script type="application/ld+json">` blocks already present in `index.html`; `sitemap.xml`; `robots.txt`
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
