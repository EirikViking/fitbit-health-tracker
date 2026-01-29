#!/usr/bin/env node
import path from 'node:path';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';

async function loadPlaywright() {
  try {
    const { chromium } = await import('playwright');
    return chromium;
  } catch (err) {
    const nodePath = process.env.NODE_PATH ? process.env.NODE_PATH.split(path.delimiter) : [];
    for (const p of nodePath) {
      try {
        const chromium = createRequire(import.meta.url)(path.join(p, 'playwright')).chromium;
        return chromium;
      } catch (e) { /* try next */ }
    }
    throw new Error('playwright not found. Install globally or add to devDependencies.');
  }
}

const PROD_URL = process.env.PROD_URL;
if (!PROD_URL) {
  console.error('PROD_URL is required, e.g. PROD_URL=https://fitbit-health-tracker.cromkake.workers.dev');
  process.exit(1);
}

const url = new URL(PROD_URL);
url.searchParams.set('autorunSanity', '1');

async function main() {
  const chromium = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const consoleErrors = [];
  let sanityLine = null;

  page.on('pageerror', (err) => consoleErrors.push(`pageerror:${err.message}`));
  page.on('console', (msg) => {
    const text = msg.text();
    if (msg.type() === 'error') consoleErrors.push(`console:${text}`);
    if (text.startsWith('[sanity] done ')) sanityLine = text;
  });

  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });

  // Coverage explanation + tooltip metrics
  await page.waitForSelector('[data-testid="coverage-badge"]', { timeout: 15000 }).catch(() => {});
  const covBadge = await page.locator('[data-testid="coverage-badge"]').count();
  const covHelp = await page.locator('[data-testid="coverage-help"]').count();
  const covHelpText = await page.locator('[data-testid="coverage-help"]').innerText().catch(() => '');
  if (covBadge === 0 || covHelp === 0 || !covHelpText.trim()) {
    console.error('Coverage explanation not found');
    await browser.close();
    process.exit(1);
  }
  await page.locator('[data-testid="coverage-badge"]').hover();
  await page.waitForTimeout(300);
  const covMetrics = await page.evaluate(() => {
    const sel = (id) => document.querySelector(`[data-testid="${id}"]`);
    return {
      sleep: !!sel('coverage-metric-sleep'),
      hrv: !!sel('coverage-metric-hrv'),
      rec: !!sel('coverage-metric-recovery')
    };
  });
  if (!covMetrics.sleep || !covMetrics.hrv || !covMetrics.rec) {
    console.error('Coverage metric details missing', covMetrics);
    await browser.close();
    process.exit(1);
  }

  // Estimated toggle OFF/ON
  await page.locator('nav button[data-tab="recovery"]').click();
  const estToggle = page.locator('#toggleEstimated');
  if (await estToggle.count() === 0) {
    console.error('Estimated toggle not found');
    await browser.close();
    process.exit(1);
  }
  await estToggle.uncheck({ force: true });
  await page.waitForTimeout(500);
  const estOff = await page.evaluate(() => {
    const canvases = Array.from(document.querySelectorAll('canvas[data-estimated="1"]'));
    const visible = canvases.some(c => c.dataset.estimatedVisible === "1");
    return { visible, estVisible: window._estVisible };
  });
  if (estOff.visible || estOff.estVisible !== false) {
    console.error('Estimated segments still visible after toggle off');
    await browser.close();
    process.exit(1);
  }
  await estToggle.check({ force: true });
  await page.waitForTimeout(500);
  const estOn = await page.evaluate(() => {
    const canvases = Array.from(document.querySelectorAll('canvas[data-estimated="1"]'));
    const visible = canvases.some(c => c.dataset.estimatedVisible === "1");
    return { visible, estVisible: window._estVisible };
  });
  if (!estOn.visible || estOn.estVisible !== true) {
    console.error('Estimated segments not visible after toggle on');
    await browser.close();
    process.exit(1);
  }

  // Raw export download + parse
  await page.locator('nav button[data-tab="exports"]').click();
  await page.waitForSelector('#btn-export-raw', { timeout: 15000, state: 'attached' });
  const rawBtn = page.locator('#btn-export-raw');
  const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
  await rawBtn.click();
  const download = await downloadPromise;
  const fname = download.suggestedFilename();
  if (!fname || !fname.endsWith('.json')) {
    console.error('Download filename not json', fname);
    await browser.close();
    process.exit(1);
  }
  const dlPath = await download.path();
  const jsonStr = await fs.readFile(dlPath, 'utf-8');
  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    console.error('Downloaded JSON parse error', e);
    await browser.close();
    process.exit(1);
  }
  if (!parsed.exportMeta || parsed.exportMeta.estimatedExcludedFromExport !== true) {
    console.error('exportMeta missing or estimatedExcludedFromExport not true');
    await browser.close();
    process.exit(1);
  }
  const hasEstimatedField = Array.isArray(parsed.data) && parsed.data.some(row => Object.prototype.hasOwnProperty.call(row, 'estimated'));
  if (hasEstimatedField) {
    console.error('Export includes estimated flag which should be excluded');
    await browser.close();
    process.exit(1);
  }

  const start = Date.now();
  while (Date.now() - start < 30000) {
    const done = await page.evaluate(() => document.documentElement.dataset.sanityDone === "1");
    if (done && sanityLine) break;
    await page.waitForTimeout(300);
  }

  if (!sanityLine) {
    console.error('Missing [sanity] done line');
    await browser.close();
    process.exit(1);
  }

  if (consoleErrors.length) {
    console.error('Console errors:', consoleErrors);
    await browser.close();
    process.exit(1);
  }

  const match = sanityLine.match(/ok=(\d+)\s+errors=(\d+)/);
  if (!match) {
    console.error('Could not parse sanity line:', sanityLine);
    await browser.close();
    process.exit(1);
  }
  const ok = Number(match[1]);
  const errors = Number(match[2]);
  if (ok !== 1 || errors !== 0) {
    console.error('Sanity failed:', sanityLine);
    await browser.close();
    process.exit(1);
  }

  console.log('SMOKE_OK', sanityLine);

  // Additional test: Custom Range Selector
  console.log('\n[Custom Range Test] Starting...');

  // Check that custom range inputs exist
  const fromInput = await page.$('#customFromDate');
  const toInput = await page.$('#customToDate');
  const applyBtn = await page.$('#customRangeApply');

  if (!fromInput || !toInput || !applyBtn) {
    console.error('[Custom Range Test] FAIL: Custom range inputs not found');
    await browser.close();
    process.exit(1);
  }
  console.log('[Custom Range Test] ✓ Custom range inputs exist');

  // Fill in dates: From=2014-01-01, To=2014-01-07
  await fromInput.fill('2014-01-01');
  await toInput.fill('2014-01-07');
  console.log('[Custom Range Test] ✓ Filled dates: 2014-01-01 to 2014-01-07');

  // Click Apply
  await applyBtn.click();
  console.log('[Custom Range Test] ✓ Clicked Apply button');

  // Wait a moment for the range display to update
  await page.waitForTimeout(500);

  // Check that the range display includes "2014"
  const rangeDisplay = await page.$('#rangeDisplay');
  if (!rangeDisplay) {
    console.error('[Custom Range Test] FAIL: Range display element not found');
    await browser.close();
    process.exit(1);
  }

  const rangeText = await rangeDisplay.textContent();
  if (!rangeText || !rangeText.includes('2014')) {
    console.error('[Custom Range Test] FAIL: Range display does not contain "2014". Got:', rangeText);
    await browser.close();
    process.exit(1);
  }
  console.log('[Custom Range Test] ✓ Range display updated:', rangeText);

  // Ensure no "??" in visible text
  const bodyText = await page.locator('body').innerText();
  if (bodyText.includes('??')) {
    console.error('Found ?? in UI text');
    await browser.close();
    process.exit(1);
  }

  // Estimated note present and estimated data surfaced
  const estNote = await page.locator('[data-testid="chart-estimated-note"]').count();
  if (estNote === 0) {
    console.error('Estimated note not found');
    await browser.close();
    process.exit(1);
  }
  const estEval = await page.evaluate(() => {
    const estCanvas = Array.from(document.querySelectorAll('canvas[data-estimated="1"]')).length;
    const meta = window._estMeta;
    const flags = window._estFlags;
    const charts = window._charts;
    let tooltipText = null;
    if (charts && charts.sleep && flags?.sleep?.some(Boolean)) {
      const idx = flags.sleep.findIndex(Boolean);
      try {
        charts.sleep.tooltip.setActiveElements([{ datasetIndex: 0, index: idx }], { x: 0, y: 0 });
        charts.sleep.update();
        const title = charts.sleep.tooltip.title || [];
        const body = charts.sleep.tooltip.body || [];
        tooltipText = (body[0]?.lines?.[0]) || title[0] || null;
      } catch (e) {
        tooltipText = null;
      }
    }
    return { estCanvas, meta, tooltipText, hasFlags: !!(flags && (flags.hr || flags.sleep || flags.hrv)) };
  });
  if (estEval.estCanvas === 0 && !(estEval.meta && (estEval.meta.hr || estEval.meta.sleep || estEval.meta.hrv))) {
    console.error('No estimated segments detected');
    await browser.close();
    process.exit(1);
  }
  if (estEval.tooltipText && !estEval.tooltipText.includes('Estimated')) {
    console.error('Estimated tooltip missing label', estEval.tooltipText);
    await browser.close();
    process.exit(1);
  }

  console.log('\n[Custom Range Test] PASS: All checks passed');
  console.log('\n' + '='.repeat(50));
  console.log('✅ ALL VERIFICATION PASSED');
  console.log('='.repeat(50));

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
