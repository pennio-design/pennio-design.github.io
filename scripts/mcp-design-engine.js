#!/usr/bin/env node
/**
 * design_engine - MCP stdio server for the Multi-Agent Web Architecture Pipeline.
 *
 * Dependency-free by design: this repository has no package.json and no
 * node_modules, so the server speaks JSON-RPC over stdio directly and relies
 * only on the Node 22 standard library (global fetch included).
 *
 * See scripts/README.md for per-tool configuration and status.
 */

'use strict';

const { execFile } = require('node:child_process');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const PROTOCOL_VERSION = '2024-11-05';

/* ------------------------------------------------------------------ *
 * Tool schemas
 * ------------------------------------------------------------------ */

const TOOLS = [
  {
    name: 'extract_design_dna',
    description:
      'Fetches a reference URL and extracts its CSS custom properties, font stacks, border-radius set, and font-size scale.',
    inputSchema: {
      type: 'object',
      properties: {
        reference_url: { type: 'string', description: 'URL of the reference website' },
        target_density: {
          type: 'string',
          enum: ['compact', 'balanced', 'editorial'],
          description: 'Visual density profile recorded alongside the extracted tokens',
        },
      },
      required: ['reference_url'],
    },
  },
  {
    name: 'generate_kinetic_asset',
    description:
      'Dispatches a generative image or video request to the Higsfield endpoint. Requires HIGSFIELD_API_URL and HIGSFIELD_API_KEY.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Detailed visual generation prompt' },
        aspect_ratio: { type: 'string', enum: ['16:9', '4:3', '1:1', '9:16'] },
        media_type: { type: 'string', enum: ['image', 'video'] },
      },
      required: ['prompt', 'media_type'],
    },
  },
  {
    name: 'audit_viewport_integrity',
    description:
      'Runs headless browser checks at 375, 768, 1024, and 1440px to detect horizontal overflow and undersized touch targets. Requires Playwright.',
    inputSchema: {
      type: 'object',
      properties: {
        local_server_url: { type: 'string', description: 'Local development URL to test' },
        viewports: {
          type: 'array',
          items: { type: 'number' },
          description: 'Override the default viewport widths',
        },
      },
      required: ['local_server_url'],
    },
  },
  {
    name: 'deploy_to_edge',
    description:
      'Commits the working tree and pushes to the GitHub Pages branch. Dry-run unless confirm is true.',
    inputSchema: {
      type: 'object',
      properties: {
        project_name: { type: 'string' },
        git_branch: { type: 'string', default: 'master' },
        commit_message: { type: 'string' },
        confirm: {
          type: 'boolean',
          default: false,
          description: 'Must be true to actually commit and push.',
        },
      },
      required: ['project_name'],
    },
  },
];

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd: REPO_ROOT, maxBuffer: 8 * 1024 * 1024, ...opts }, (err, stdout, stderr) => {
      resolve({ code: err ? (err.code ?? 1) : 0, stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

/** Collect every `--token: value;` pair, keyed by the selector block it came from. */
function extractCustomProperties(css) {
  const tokens = {};
  const blockRe = /(:root|html|body)[^{]*\{([^}]*)\}/g;
  let block;
  while ((block = blockRe.exec(css)) !== null) {
    const declRe = /(--[A-Za-z0-9_-]+)\s*:\s*([^;]+);/g;
    let decl;
    while ((decl = declRe.exec(block[2])) !== null) {
      tokens[decl[1]] = decl[2].trim();
    }
  }
  return tokens;
}

/**
 * The representative corner radius: the most frequently declared single-length
 * value. Shorthand declarations (e.g. `0 0 4px 0`) are one-off overrides rather
 * than the base, so they are excluded from the vote.
 */
function pickBaseRadius(css) {
  const counts = new Map();
  const re = /border-radius\s*:\s*([^;}]+)[;}]/gi;
  let m;
  while ((m = re.exec(css)) !== null) {
    const v = m[1].trim();
    if (/\s/.test(v)) continue; // shorthand, not a base value
    if (/^0(px|rem|em|%)?$/.test(v)) continue; // "no radius" is not a scale value
    if (!/^[\d.]+(px|rem|em)$/.test(v)) continue; // 50% and friends are circles/pills, not a corner scale
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  if (!counts.size) return null;
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
}

function extractUnique(css, re, limit = 40) {
  const seen = new Set();
  let m;
  while ((m = re.exec(css)) !== null) {
    seen.add(m[1].trim());
    if (seen.size >= limit) break;
  }
  return [...seen];
}

/** Sort numeric CSS lengths (rem/px/em) into an ascending scale. */
function buildScale(values) {
  const parsed = values
    .map((v) => {
      const m = /^(-?[\d.]+)(rem|em|px)$/.exec(v);
      return m ? { value: v, n: parseFloat(m[1]), unit: m[2] } : null;
    })
    .filter(Boolean);

  const byUnit = {};
  for (const p of parsed) (byUnit[p.unit] ||= []).push(p.n);

  const scale = {};
  for (const [unit, nums] of Object.entries(byUnit)) {
    const sorted = [...new Set(nums)].sort((a, b) => a - b);
    const ratios = [];
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i - 1] > 0) ratios.push(+(sorted[i] / sorted[i - 1]).toFixed(3));
    }
    scale[unit] = {
      steps: sorted,
      step_ratios: ratios,
      median_ratio: ratios.length ? ratios.sort((a, b) => a - b)[Math.floor(ratios.length / 2)] : null,
    };
  }
  return scale;
}

/* ------------------------------------------------------------------ *
 * Tool: extract_design_dna
 * ------------------------------------------------------------------ */

async function extractDesignDna({ reference_url, target_density }) {
  if (!reference_url) throw new Error('reference_url is required');

  let url;
  try {
    url = new URL(reference_url);
  } catch {
    throw new Error(`reference_url is not a valid URL: ${reference_url}`);
  }
  if (!/^https?:$/.test(url.protocol)) {
    throw new Error(`reference_url must be http or https, got ${url.protocol}`);
  }

  const res = await fetch(url, {
    headers: { 'User-Agent': 'design-engine-mcp/1.0 (+design DNA extraction)' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`fetch failed: ${res.status} ${res.statusText}`);
  const html = await res.text();

  // Inline <style> blocks, plus same-origin linked stylesheets.
  let css = '';
  const styleRe = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let sm;
  while ((sm = styleRe.exec(html)) !== null) css += '\n' + sm[1];

  const linked = [];
  const linkRe = /<link[^>]+rel=["']stylesheet["'][^>]*>/gi;
  let lm;
  while ((lm = linkRe.exec(html)) !== null) {
    const href = /href=["']([^"']+)["']/i.exec(lm[0]);
    if (href) linked.push(new URL(href[1], url).toString());
  }

  const fetchedSheets = [];
  for (const href of linked.slice(0, 8)) {
    try {
      const r = await fetch(href, { redirect: 'follow' });
      if (r.ok) {
        css += '\n' + (await r.text());
        fetchedSheets.push(href);
      }
    } catch {
      /* a stylesheet we cannot read is reported below, not fatal */
    }
  }

  const customProperties = extractCustomProperties(css);
  const fontFamilies = extractUnique(css, /font-family\s*:\s*([^;}]+)[;}]/gi, 12);
  const radii = extractUnique(css, /border-radius\s*:\s*([^;}]+)[;}]/gi, 20);
  const fontSizes = extractUnique(css, /font-size\s*:\s*([^;}]+)[;}]/gi, 60);

  return {
    reference_url: url.toString(),
    target_density: target_density || 'balanced',
    extracted_at: new Date().toISOString(),
    sources: {
      inline_style_blocks: (html.match(/<style[^>]*>/gi) || []).length,
      linked_stylesheets_found: linked.length,
      linked_stylesheets_read: fetchedSheets,
    },
    custom_properties: customProperties,
    custom_property_count: Object.keys(customProperties).length,
    typography: {
      font_families: fontFamilies,
      font_sizes: fontSizes,
      scale: buildScale(fontSizes),
    },
    geometry: {
      border_radius_values: radii,
      base_radius: pickBaseRadius(css),
    },
  };
}

/* ------------------------------------------------------------------ *
 * Tool: generate_kinetic_asset
 * ------------------------------------------------------------------ */

async function generateKineticAsset({ prompt, aspect_ratio, media_type }) {
  if (!prompt) throw new Error('prompt is required');
  if (!media_type) throw new Error('media_type is required');

  const endpoint = process.env.HIGSFIELD_API_URL;
  const key = process.env.HIGSFIELD_API_KEY;

  // The Higsfield request/response contract was not verified against live
  // documentation, so no endpoint is guessed here. Configure it explicitly.
  if (!endpoint || !key) {
    const missing = [!endpoint && 'HIGSFIELD_API_URL', !key && 'HIGSFIELD_API_KEY'].filter(Boolean);
    throw new Error(
      `generate_kinetic_asset is not configured. Missing: ${missing.join(', ')}. ` +
        'Set HIGSFIELD_API_URL to the generation endpoint and HIGSFIELD_API_KEY to your key, ' +
        'then confirm the request body below matches the provider contract ' +
        '(scripts/mcp-design-engine.js -> generateKineticAsset).'
    );
  }

  const body = { prompt, media_type, aspect_ratio: aspect_ratio || '1:1' };
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`generation endpoint returned ${res.status}: ${text.slice(0, 500)}`);

  try {
    return { request: body, response: JSON.parse(text) };
  } catch {
    return { request: body, response_raw: text.slice(0, 5000) };
  }
}

/* ------------------------------------------------------------------ *
 * Tool: audit_viewport_integrity
 * ------------------------------------------------------------------ */

const DEFAULT_VIEWPORTS = [375, 768, 1024, 1440];
const MIN_TOUCH_TARGET = 44;

async function auditViewportIntegrity({ local_server_url, viewports }) {
  if (!local_server_url) throw new Error('local_server_url is required');

  let chromium;
  try {
    // require (not import) so NODE_PATH-installed copies resolve too.
    ({ chromium } = require('playwright'));
  } catch {
    throw new Error(
      'Playwright is not installed, so no viewport audit was run. ' +
        'Install it with `npm install playwright` (a Chromium build is already present at ' +
        '/opt/pw-browsers, so set PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1), then re-run. ' +
        'No results are reported rather than reporting an unverified pass.'
    );
  }

  const widths = Array.isArray(viewports) && viewports.length ? viewports : DEFAULT_VIEWPORTS;

  // A Playwright version pinned to a different Chromium revision than the one
  // installed will refuse to launch. PLAYWRIGHT_CHROMIUM_EXECUTABLE points it
  // at an existing binary instead of downloading a second copy.
  const launchOpts = {};
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) {
    launchOpts.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  }
  const browser = await chromium.launch(launchOpts);
  const results = [];

  try {
    for (const width of widths) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();
      await page.goto(local_server_url, { waitUntil: 'networkidle' });

      const report = await page.evaluate((minTarget) => {
        const docWidth = document.documentElement.clientWidth;

        const describe = (el) =>
          el.tagName.toLowerCase() +
          (el.id ? `#${el.id}` : '') +
          (el.className && typeof el.className === 'string'
            ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.')
            : '');

        /** Rendered and on-screen: hidden or parked-offscreen nodes are not layout bugs. */
        const isVisible = (el, rect) => {
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false;
          if (rect.bottom <= 0) return false; // e.g. a skip-link parked above the viewport
          return true;
        };

        /**
         * An element clipped by an ancestor's overflow cannot widen the page.
         * Marquees and decorative grids live inside such containers by design.
         */
        const isClipped = (el) => {
          let node = el.parentElement;
          while (node && node !== document.documentElement) {
            const cs = getComputedStyle(node);
            if (cs.overflowX !== 'visible') return true;
            node = node.parentElement;
          }
          return false;
        };

        const overflowing = [];
        for (const el of document.querySelectorAll('*')) {
          if (overflowing.length >= 25) break;
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) continue;
          if (!isVisible(el, rect)) continue;
          if (isClipped(el)) continue;

          const overflowRight = Math.round(rect.right - docWidth);
          const overflowLeft = Math.round(-rect.left);
          if (overflowRight > 1 || overflowLeft > 1) {
            overflowing.push({
              selector: describe(el),
              left: Math.round(rect.left),
              right: Math.round(rect.right),
              overflow_right_px: overflowRight > 1 ? overflowRight : 0,
              overflow_left_px: overflowLeft > 1 ? overflowLeft : 0,
            });
          }
        }

        const smallTargets = [];
        const interactive = document.querySelectorAll(
          'a, button, input, select, textarea, [role="button"], [onclick], [tabindex]'
        );
        for (const el of interactive) {
          if (smallTargets.length >= 25) break;
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) continue;
          if (!isVisible(el, rect)) continue;

          // WCAG 2.5.8 exempts targets rendered inline within a sentence.
          const cs = getComputedStyle(el);
          if (cs.display === 'inline') continue;

          if (rect.width < minTarget || rect.height < minTarget) {
            smallTargets.push({
              selector: describe(el),
              text: (el.textContent || '').trim().slice(0, 40),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
              shortfall_px: Math.round(minTarget - Math.min(rect.width, rect.height)),
            });
          }
        }

        return {
          document_scroll_width: document.documentElement.scrollWidth,
          document_client_width: docWidth,
          has_horizontal_scroll: document.documentElement.scrollWidth > docWidth,
          overflowing_elements: overflowing,
          undersized_touch_targets: smallTargets,
        };
      }, MIN_TOUCH_TARGET);

      results.push({ viewport_width: width, ...report });
      await context.close();
    }
  } finally {
    await browser.close();
  }

  const failed = results.filter(
    (r) => r.has_horizontal_scroll || r.overflowing_elements.length || r.undersized_touch_targets.length
  );

  return {
    url: local_server_url,
    audited_at: new Date().toISOString(),
    min_touch_target_px: MIN_TOUCH_TARGET,
    passed: failed.length === 0,
    viewports_with_violations: failed.map((r) => r.viewport_width),
    results,
  };
}

/* ------------------------------------------------------------------ *
 * Tool: deploy_to_edge
 * ------------------------------------------------------------------ */

async function deployToEdge({ project_name, git_branch, commit_message, confirm }) {
  if (!project_name) throw new Error('project_name is required');
  const branch = git_branch || 'master';

  const status = await run('git', ['status', '--porcelain']);
  if (status.code !== 0) throw new Error(`git status failed: ${status.stderr}`);
  const changed = status.stdout.trim().split('\n').filter(Boolean);

  const current = await run('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  const currentBranch = current.stdout.trim();

  const plan = {
    project_name,
    target_branch: branch,
    current_branch: currentBranch,
    changed_files: changed,
    commit_message: commit_message || `chore: deploy ${project_name}`,
  };

  if (!confirm) {
    return {
      dry_run: true,
      note: 'Nothing was committed or pushed. Re-invoke with confirm: true to execute this plan.',
      plan,
    };
  }

  if (!changed.length) return { dry_run: false, pushed: false, note: 'Working tree clean; nothing to deploy.', plan };

  const add = await run('git', ['add', '-A']);
  if (add.code !== 0) throw new Error(`git add failed: ${add.stderr}`);

  const commit = await run('git', ['commit', '-m', plan.commit_message]);
  if (commit.code !== 0) throw new Error(`git commit failed: ${commit.stderr || commit.stdout}`);

  const push = await run('git', ['push', '-u', 'origin', branch]);
  if (push.code !== 0) throw new Error(`git push failed: ${push.stderr || push.stdout}`);

  return {
    dry_run: false,
    pushed: true,
    plan,
    git_output: (commit.stdout + '\n' + push.stderr).trim(),
    note: `Pushed to ${branch}. GitHub Pages rebuilds automatically; CNAME must remain in the repo root.`,
  };
}

/* ------------------------------------------------------------------ *
 * Dispatch
 * ------------------------------------------------------------------ */

const HANDLERS = {
  extract_design_dna: extractDesignDna,
  generate_kinetic_asset: generateKineticAsset,
  audit_viewport_integrity: auditViewportIntegrity,
  deploy_to_edge: deployToEdge,
};

async function callTool(name, args) {
  const handler = HANDLERS[name];
  if (!handler) throw new Error(`unknown tool: ${name}`);
  const result = await handler(args || {});
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}

/* ------------------------------------------------------------------ *
 * JSON-RPC over stdio (newline-delimited)
 * ------------------------------------------------------------------ */

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

async function handleMessage(msg) {
  const { id, method, params } = msg;
  const isNotification = id === undefined || id === null;

  try {
    let result;
    switch (method) {
      case 'initialize':
        result = {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: 'design_engine', version: '1.0.0' },
        };
        break;
      case 'notifications/initialized':
      case 'notifications/cancelled':
        return;
      case 'ping':
        result = {};
        break;
      case 'tools/list':
        result = { tools: TOOLS };
        break;
      case 'tools/call':
        result = await callTool(params?.name, params?.arguments);
        break;
      default:
        if (isNotification) return;
        send({ jsonrpc: '2.0', id, error: { code: -32601, message: `method not found: ${method}` } });
        return;
    }
    if (!isNotification) send({ jsonrpc: '2.0', id, result });
  } catch (err) {
    const text = err && err.message ? err.message : String(err);
    if (isNotification) return;
    // Tool failures are reported as tool results so the model can react to them.
    if (method === 'tools/call') {
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `ERROR: ${text}` }], isError: true } });
    } else {
      send({ jsonrpc: '2.0', id, error: { code: -32603, message: text } });
    }
  }
}

let buffer = '';
let stdinEnded = false;
const inFlight = new Set();

/** Exit only once every dispatched request has produced its response. */
function drainAndExit() {
  if (!stdinEnded || inFlight.size > 0) return;
  process.exit(0);
}

function track(promise) {
  inFlight.add(promise);
  promise.finally(() => {
    inFlight.delete(promise);
    drainAndExit();
  });
}

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } });
      continue;
    }
    track(handleMessage(msg));
  }
});
process.stdin.on('end', () => {
  stdinEnded = true;
  drainAndExit();
});
