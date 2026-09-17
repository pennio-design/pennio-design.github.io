#!/usr/bin/env node
/**
 * Renders audit/checklist-source.html to audit/pennio-brand-checklist.pdf.
 *
 *   node scripts/render-checklist.js
 *
 * Requires Playwright (see scripts/README.md). Set PW_EXE to a Chromium binary
 * when the installed Playwright pins a revision that is not present.
 *
 * No local server and no network: Inter is embedded in the source as a subset
 * woff2, so file:// is enough and the render is identical everywhere. The font
 * check below still runs, because a PDF that quietly ships in a fallback face
 * is worse than one that fails to build.
 */
const path = require('path');
const { chromium } = require('playwright');

const SRC = path.resolve(process.env.SRC || 'audit/checklist-source.html');
const OUT = process.env.OUT || 'audit/pennio-brand-checklist.pdf';

(async () => {
  const browser = await chromium.launch(
    process.env.PW_EXE ? { executablePath: process.env.PW_EXE } : {}
  );
  const page = await browser.newPage();
  await page.goto('file://' + SRC, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);

  const report = await page.evaluate(() => ({
    inter: [...document.fonts].filter(f => f.family === 'Inter' && f.status === 'loaded').length,
    pages: document.querySelectorAll('.page').length,
    items: document.querySelectorAll('.item').length,
  }));
  if (report.inter === 0) {
    console.error('Inter did not load; the PDF would ship in a fallback face. Refusing.');
    await browser.close();
    process.exit(1);
  }

  await page.pdf({
    path: OUT,
    format: 'A4',
    printBackground: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
  });
  await browser.close();
  console.log(`wrote ${OUT} (${report.pages} pages, ${report.items} items, ${report.inter} Inter faces)`);
})();
