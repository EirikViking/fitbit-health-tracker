#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const PROD_URL = process.env.PROD_URL || 'https://fitbit-health-tracker.cromkake.workers.dev';
const chromium = (await import('playwright')).chromium;

const endpoints = [
  '/api/today',
  '/api/history?days=7',
  '/api/history?days=30',
  '/api/history?days=90',
  '/api/features',
  `/api/body?from=${new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10)}&to=${new Date().toISOString().slice(0, 10)}`,
  `/api/health?from=${new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10)}&to=${new Date().toISOString().slice(0, 10)}`
];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const consoleLogs = [];
  const errors = [];
  page.on('console', (msg) => consoleLogs.push({ type: msg.type(), text: msg.text() }));
  page.on('pageerror', (err) => errors.push({ type: 'pageerror', text: err.message }));
  page.on('requestfailed', (req) => errors.push({ type: 'requestfailed', url: req.url(), error: req.failure()?.errorText }));

  await page.goto(PROD_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  const shotPath = path.join(process.cwd(), 'prod-debug.png');
  await page.screenshot({ path: shotPath, fullPage: true }).catch(() => {});

  const results = [];
  for (const ep of endpoints) {
    const url = ep.startsWith('http') ? ep : `${PROD_URL}${ep}`;
    try {
      const resp = await page.request.get(url);
      const status = resp.status();
      const text = await resp.text();
      results.push({ url, status, ok: status >= 200 && status < 300, body: text.slice(0, 200) });
    } catch (e) {
      results.push({ url, status: 'error', ok: false, error: e.message });
    }
  }

  const summary = {
    url: PROD_URL,
    consoleErrors: consoleLogs.filter(l => l.type === 'error'),
    pageErrors: errors,
    endpoints: results
  };
  console.log(JSON.stringify(summary, null, 2));

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
