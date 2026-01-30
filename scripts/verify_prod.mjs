#!/usr/bin/env node
import path from 'node:path';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';

async function loadPlaywright() {
  try {
    const mod = await import('playwright');
    return { chromium: mod.chromium, firefox: mod.firefox };
  } catch (err) {
    const nodePath = process.env.NODE_PATH ? process.env.NODE_PATH.split(path.delimiter) : [];
    for (const p of nodePath) {
      try {
        const mod = createRequire(import.meta.url)(path.join(p, 'playwright'));
        return { chromium: mod.chromium, firefox: mod.firefox };
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
const BASE_URL = PROD_URL.endsWith('/') ? PROD_URL.slice(0, -1) : PROD_URL;

const TAB_TARGETS = {
  overview: '#overviewKPIs',
  sleep: '#sleepMetrics',
  recovery: '#recoveryMetrics',
  activity: '#activityMetrics',
  backfill: '#backfillCard',
  exports: '#tab-exports'
};

const parseStepsTotal = (text) => {
  if (!text) return NaN;
  const clean = text.trim().toLowerCase();
  const num = parseFloat(clean.replace(/[^0-9.]/g, ''));
  if (Number.isNaN(num)) return NaN;
  return clean.includes('k') ? Math.round(num * 1000) : Math.round(num);
};

async function runTabSmoke(page, label) {
  await page.waitForSelector('#overviewKPIs', { timeout: 15000 }).catch(() => {});
  const tabOrder = ['overview', 'sleep', 'recovery', 'activity', 'backfill', 'exports'];
  for (const tab of tabOrder) {
    const clicked = await page.evaluate((t) => {
      const el = Array.from(document.querySelectorAll(`[data-tab="${t}"]`)).find((n) => n instanceof HTMLElement);
      if (el) {
        el.click();
        return true;
      }
      return false;
    }, tab);
    if (!clicked) {
      throw new Error(`[${label}] Could not find tab trigger for ${tab}`);
    }
    await page.waitForTimeout(200);
    const selector = TAB_TARGETS[tab];
    if (!selector) continue;
    const exists = await page.locator(selector).first().isVisible().catch(() => false);
    if (!exists) {
      throw new Error(`[${label}] Missing expected element for ${tab}: ${selector}`);
    }
  }
}

async function main() {
  const { chromium, firefox } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });

  // Autorun Repair completion signals
  const repairPage = await browser.newPage();
  let repairDoneLine = null;
  repairPage.on('console', (msg) => {
    const text = msg.text();
    if (text.startsWith('[repair] done ')) repairDoneLine = text;
  });
  const repairUrl = new URL(BASE_URL);
  repairUrl.searchParams.set('autorunRepair', '1');
  repairUrl.searchParams.set('limit', '10');
  await repairPage.goto(repairUrl.toString(), { waitUntil: 'domcontentloaded' });
  await repairPage.waitForFunction(() => {
    const bodyFlag = document.body ? document.body.getAttribute('data-repair-done') : null;
    return window.REPAIR_DONE === true && bodyFlag === '1';
  }, { timeout: 90000 }).catch(() => {});
  const repairFlags = await repairPage.evaluate(() => ({
    win: window.REPAIR_DONE === true,
    body: document.body ? document.body.getAttribute('data-repair-done') : null
  }));
  if (!repairFlags.win || repairFlags.body !== '1' || !repairDoneLine) {
    console.error('Repair autorun completion signals missing', { repairFlags, repairDoneLine });
    await browser.close();
    process.exit(1);
  }
  await repairPage.close();

  const warmPage = await browser.newPage();
  await warmPage.goto(BASE_URL, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await warmPage.close();

  const page = await browser.newPage();
  const consoleErrors = [];
  let sanityLine = null;

  page.on('pageerror', (err) => consoleErrors.push(`pageerror:${err.message}`));
  page.on('console', (msg) => {
    const text = msg.text();
    if (msg.type() === 'error') {
      const loc = msg.location();
      const locStr = loc?.url ? `${loc.url}:${loc.lineNumber || 0}:${loc.columnNumber || 0}` : '';
      consoleErrors.push(`console:${text}${locStr ? ` @ ${locStr}` : ''}`);
    }
    if (text.startsWith('[sanity] done ')) sanityLine = text;
  });

  const favResp = await page.request.get(`${BASE_URL}/favicon.ico`);
  const favBody = await favResp.body();
  if (favResp.status() !== 200 || !favBody || favBody.length === 0) {
    console.error('Favicon missing or empty', { status: favResp.status(), length: favBody ? favBody.length : 0 });
    await browser.close();
    process.exit(1);
  }

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

  // Group by label
  const groupText = await page.locator('#periodToggle').innerText();
  if (!groupText.toLowerCase().includes('charts only')) {
    console.error('Group by label missing charts-only hint');
    await browser.close();
    process.exit(1);
  }

  // Period buttons test ids exist
  const periodIds = ['period-7', 'period-30', 'period-90', 'period-ytd', 'period-alltime'];
  for (const pid of periodIds) {
    if (await page.locator(`[data-testid=\"${pid}\"]`).count() === 0) {
      console.error('Missing period test id', pid);
      await browser.close();
      process.exit(1);
    }
  }

  // Compare mode basic
  const compareToggle = page.locator('[data-testid="compare-toggle"]');
  if (await compareToggle.count() === 0) {
    console.error('Compare toggle not found');
    await browser.close();
    process.exit(1);
  }
  await page.waitForFunction(
    () => window.dashboardData && Array.isArray(window.dashboardData.series) && window.dashboardData.series.length > 0,
    { timeout: 20000 }
  ).catch(() => {});
  await page.evaluate(() => {
    const el = document.querySelector('[data-testid="compare-toggle"]');
    if (el) el.click();
  });
  await page.waitForTimeout(600);
  const compareStateOn = await page.evaluate(() => ({
    attr: document.querySelector('#overviewKPIs')?.getAttribute('data-testid'),
    cards: document.querySelectorAll('#overviewKPIs .compare-mode').length,
    flag: window.localStorage.getItem('fitbit_compare')
  }));
  if (!(compareStateOn.attr === 'compare-panel' || compareStateOn.cards > 0)) {
    console.error('Compare panel not visible after enabling compare', compareStateOn);
    await browser.close();
    process.exit(1);
  }
  await page.evaluate(() => {
    const el = document.querySelector('[data-testid="compare-toggle"]');
    if (el) el.click();
  });
  await page.waitForTimeout(600);
  const compareStateOff = await page.evaluate(() => ({
    attr: document.querySelector('#overviewKPIs')?.getAttribute('data-testid'),
    cards: document.querySelectorAll('#overviewKPIs .compare-mode').length,
    flag: window.localStorage.getItem('fitbit_compare')
  }));
  if (compareStateOff.attr === 'compare-panel' || compareStateOff.cards > 0) {
    console.error('Compare panel still visible after disabling compare');
    await browser.close();
    process.exit(1);
  }

  // Group by affects charts only (Steps total stable)
  await page.locator('nav button[data-tab="activity"]').first().click({ timeout: 15000 });
  await page.waitForSelector('#activityMetrics', { timeout: 15000 });
  const stepsTotalLocator = page.locator('[data-testid="totals-steps"]');
  await stepsTotalLocator.first().waitFor({ timeout: 15000 });
  const readStepsTotal = async (period) => {
    const btn = page.locator(`[data-testid="groupby-select"] [data-period="${period}"]`).first();
    await btn.click({ timeout: 10000 });
    await page.waitForTimeout(600);
    const txt = await stepsTotalLocator.first().innerText();
    return parseStepsTotal(txt);
  };
  const stepsDaily = await readStepsTotal('daily');
  const stepsWeekly = await readStepsTotal('weekly');
  const stepsMonthly = await readStepsTotal('monthly');
  if (![stepsDaily, stepsWeekly, stepsMonthly].every((v) => Number.isFinite(v))) {
    console.error('Could not parse steps totals', { stepsDaily, stepsWeekly, stepsMonthly });
    await browser.close();
    process.exit(1);
  }
  if (stepsDaily !== stepsWeekly || stepsDaily !== stepsMonthly) {
    console.error('Steps totals changed when switching group by', { stepsDaily, stepsWeekly, stepsMonthly });
    await browser.close();
    process.exit(1);
  }
  await page.locator('[data-testid="groupby-select"] [data-period="daily"]').first().click({ timeout: 10000 }).catch(() => {});
  // Group by monthly disabled for short range
  await page.locator('[data-testid="period-7"]').click();
  await page.waitForTimeout(300);
  const monthlyBtn = page.locator('[data-period="monthly"]');
  const monthlyDisabled = await monthlyBtn.isDisabled().catch(() => false);
  if (!monthlyDisabled) {
    console.error('Monthly group by should be disabled for 7d range');
    await browser.close();
    process.exit(1);
  }
  await page.locator('[data-testid="period-alltime"]').click();

  // Sleep monthly range labels
  await page.locator('nav button[data-tab="sleep"]').first().click();
  await page.locator('.range-btn[data-range="all"]').first().click();
  await page.locator('[data-period="monthly"]').first().click();
  await page.waitForTimeout(600);
  const rangeDates = await page.evaluate(() => {
    const card = Array.from(document.querySelectorAll('#sleepMetrics .kpi-card')).find(el => el.querySelector('.kpi-title')?.textContent?.includes('Range'));
    if (!card) return [];
    return Array.from(card.querySelectorAll('.stat-block .text-sm')).map(el => {
      const match = el.textContent.match(/\(([^)]+)\)/);
      return match ? match[1].trim() : null;
    }).filter(Boolean);
  });
  const monthlyLabelsOk = rangeDates.length >= 1 && rangeDates.every(d => /^\d{4}-\d{2}$/.test(d));
  if (!monthlyLabelsOk) {
    console.error('Monthly range labels not in YYYY-MM format', rangeDates);
    await browser.close();
    process.exit(1);
  }
  await page.locator('[data-period="daily"]').first().click({ force: true }).catch(() => {});
  await page.locator('[data-testid="period-90"]').click();
  const coverageText = await page.locator('[data-testid="coverage-label"]').first().innerText().catch(() => '');
  if (!/Loaded:\s*\d+\s+of\s+90\s+days/i.test(coverageText)) {
    console.error('90d coverage label missing or incorrect', coverageText);
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

  // Raw export download + parse (loaded view)
  await page.locator('nav button[data-tab="exports"]').click();
  try {
    await page.waitForSelector('#btn-export-raw', { timeout: 15000, state: 'attached' });
  } catch {
    await page.evaluate(() => { if (window.renderAll) window.renderAll(); });
    await page.waitForSelector('#btn-export-raw', { timeout: 15000, state: 'attached' });
  }
  const rawBtn = page.locator('#btn-export-raw');
  const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
  await rawBtn.click();
  const download = await downloadPromise;
  let fname = download.suggestedFilename();
  if (!fname || !fname.endsWith('.json')) {
    console.error('Download filename not json', fname);
    await browser.close();
    process.exit(1);
  }
  let dlPath = await download.path();
  let jsonStr = await fs.readFile(dlPath, 'utf-8');
  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    console.error('Downloaded JSON parse error', e);
    await browser.close();
    process.exit(1);
  }
  if (!parsed.exportMeta || parsed.exportMeta.estimatedExcludedFromExport !== true || !parsed.features || parsed.body === undefined || parsed.health === undefined) {
    console.error('exportMeta missing or new sections absent', parsed.exportMeta);
    await browser.close();
    process.exit(1);
  }
  const hasEstimatedField = Array.isArray(parsed.data) && parsed.data.some(row => Object.prototype.hasOwnProperty.call(row, 'estimated'));
  if (hasEstimatedField) {
    console.error('Export includes estimated flag which should be excluded');
    await browser.close();
    process.exit(1);
  }

  // Full range export selected period
  const fromRange = '2024-01-01';
  const toRange = '2026-01-29';
  await page.locator('#customFromDate').fill(fromRange);
  await page.locator('#customToDate').fill(toRange);
  await page.locator('#customRangeApply').click();
  await page.waitForTimeout(500);
  const selectedBtn = page.locator('[data-testid="export-selected-period"]');
  await selectedBtn.click();
  const fullDownload = await page.waitForEvent('download', { timeout: 45000 });
  fname = fullDownload.suggestedFilename();
  if (!fname.endsWith('.json')) {
    console.error('Selected period download not json', fname);
    await browser.close();
    process.exit(1);
  }
  dlPath = await fullDownload.path();
  jsonStr = await fs.readFile(dlPath, 'utf-8');
  let selectedParsed;
  try { selectedParsed = JSON.parse(jsonStr); } catch (e) { console.error('Selected JSON parse error', e); await browser.close(); process.exit(1); }
  const meta = selectedParsed.exportMeta || {};
  if (meta.requestedFrom !== fromRange || meta.requestedTo !== toRange) {
    console.error('Selected export meta range mismatch', meta);
    await browser.close();
    process.exit(1);
  }
  if (!(meta.rows > 100)) {
    console.error('Selected export too few rows', meta.rows);
    await browser.close();
    process.exit(1);
  }
  const dates = (selectedParsed.rows || []).map(r => r.date).filter(Boolean);
  if (!(dates.some(d => d.startsWith('2025')) && dates.some(d => d.startsWith('2026')))) {
    console.error('Selected export missing span across years');
    await browser.close();
    process.exit(1);
  }

  // Direct range fetch check
  const rangeCheck = await page.evaluate(async () => {
    const res = await fetch('/api/range?from=2025-12-01&to=2025-12-31&limit=10');
    const json = await res.json();
    return { nextCursor: json.nextCursor, rows: json.rows?.length || 0 };
  });
  if (!rangeCheck.nextCursor) {
    console.error('Range paging nextCursor missing', rangeCheck);
    await browser.close();
    process.exit(1);
  }

  let sanityFlags = { win: false, body: null, root: null };
  const start = Date.now();
  while (Date.now() - start < 30000) {
    sanityFlags = await page.evaluate(() => ({
      win: window.SANITY_DONE === true,
      body: document.body ? document.body.getAttribute('data-sanity-done') : null,
      root: document.documentElement.dataset.sanityDone
    }));
    if (sanityFlags.win && sanityFlags.body === '1' && sanityLine) break;
    await page.waitForTimeout(300);
  }

  if (!sanityLine || !sanityFlags.win || sanityFlags.body !== '1') {
    console.error('Missing sanity completion signals', { sanityLine, sanityFlags });
    await browser.close();
    process.exit(1);
  }

  const filteredConsoleErrors = consoleErrors.filter((msg) => !(msg.includes('/api/today') && msg.includes('502')));
  if (filteredConsoleErrors.length) {
    console.error('Console errors:', filteredConsoleErrors);
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

  // Period label alignment on cards
  const periodRangeText = await page.locator('#rangeDisplay').innerText().catch(() => '');
  const periodCardText = await page.locator('.kpi-card .text-sm', { hasText: 'Period Total' }).first().innerText().catch(() => '');
  if (!periodRangeText || !periodCardText || !periodCardText.toLowerCase().includes('period total')) {
    console.error('Period label not reflected on cards', { periodRangeText, periodCardText });
    await browser.close();
    process.exit(1);
  }

  // Active mins deterministic
  const activeCard = page.locator('.kpi-card', { hasText: 'Active Mins' });
  if (await activeCard.count() > 0) {
    console.error('Active mins card should not be present');
    await browser.close();
    process.exit(1);
  }

  // Repair explanation present
  const repairText = await page.locator('.text-secondary', { hasText: 'Repair calls /api/day' }).count();
  if (repairText > 0) {
    console.error('Repair explanation should not appear outside repair tab');
    await browser.close();
    process.exit(1);
  }

  // Body / Health tabs basic smoke
  await page.locator('[data-testid="tab-body"]').first().click({ timeout: 15000 });
  await page.waitForTimeout(300);
  const bodyErrors = consoleErrors.filter(e => e.toLowerCase().includes('body'));
  const bodyEmpty = await page.locator('#bodyContent .empty-state').count();
  const bodyCard = await page.locator('[data-testid="body-weight-card"]').count();
  if (bodyErrors.length) {
    console.error('Body tab console errors', bodyErrors);
    await browser.close();
    process.exit(1);
  }
  if (bodyEmpty === 0 && bodyCard === 0) {
    console.error('Body tab missing both empty state and card');
    await browser.close();
    process.exit(1);
  }

  await page.locator('[data-testid="tab-health"]').first().click({ timeout: 15000 });
  await page.waitForTimeout(300);
  const healthErrors = consoleErrors.filter(e => e.toLowerCase().includes('health'));
  const healthEmpty = await page.locator('#healthContent .empty-state').count();
  const healthCard = await page.locator('[data-testid^="health-metric-card"]').count();
  if (healthErrors.length) {
    console.error('Health tab console errors', healthErrors);
    await browser.close();
    process.exit(1);
  }
  if (healthEmpty === 0 && healthCard === 0) {
    console.error('Health tab missing both empty state and cards');
    await browser.close();
    process.exit(1);
  }

  // Responsive smoke (Chromium viewports)
  await runTabSmoke(page, 'desktop');
  const mobileViewports = [
    { name: 'iphone', viewport: { width: 375, height: 812 } },
    { name: 'android', viewport: { width: 412, height: 915 } }
  ];
  for (const vp of mobileViewports) {
    const ctx = await browser.newContext({ viewport: vp.viewport });
    const mobilePage = await ctx.newPage();
    const mobErrors = [];
    mobilePage.on('console', (msg) => {
      if (msg.type() === 'error') {
        const loc = msg.location();
        const locStr = loc?.url ? `${loc.url}:${loc.lineNumber || 0}:${loc.columnNumber || 0}` : '';
        mobErrors.push(`${msg.text()}${locStr ? ` @ ${locStr}` : ''}`);
      }
    });
    await mobilePage.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await runTabSmoke(mobilePage, vp.name);
    const filteredMobileErrors = mobErrors.filter((msg) => !(msg.includes('/api/today') && msg.includes('502')));
    if (filteredMobileErrors.length) {
      console.error(`[${vp.name}] console errors`, filteredMobileErrors);
      await browser.close();
      process.exit(1);
    }
    await ctx.close();
  }

  // Optional Firefox smoke
  if (process.env.RUN_FIREFOX === '1' && firefox) {
    const ff = await firefox.launch({ headless: true });
    const ctx = await ff.newContext({ viewport: { width: 1280, height: 720 } });
    const ffPage = await ctx.newPage();
    const ffErrors = [];
    ffPage.on('console', (msg) => { if (msg.type() === 'error') ffErrors.push(msg.text()); });
    await ffPage.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await runTabSmoke(ffPage, 'firefox');
    if (ffErrors.length) {
      console.error('[firefox] console errors', ffErrors);
      await ff.close();
      process.exit(1);
    }
    await ff.close();
  } else {
    console.log('Firefox smoke skipped; set RUN_FIREFOX=1 to enable.');
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
