import { test, expect } from '@playwright/test';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { buildStatic } from '../../scripts/build-static.mjs';

test('packaged three-origin relay and risk swap retain valid tool integrity', async ({ page, context }) => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'relay-browser-'));
  try {
    const config = JSON.parse(await readFile('sites.config.json', 'utf8'));
    config.sites.forEach((s) => { s.publicOrigin = `https://${s.id}.example.test`; });
    const file = path.join(tmp, 'config.json');
    await writeFile(file, JSON.stringify(config));
    const out = await buildStatic(file, path.join(tmp, 'out'));

    await context.route('https://*.example.test/**', async (route) => {
      const url = new URL(route.request().url());
      const site = config.sites.find((s) => s.publicOrigin === url.origin);
      const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
      const headers = { 'access-control-allow-origin': '*' };
      if (pathname === '/runtime/sandbox-worker.js') headers['content-security-policy'] = "default-src 'none'; script-src blob:; connect-src 'none'; worker-src 'none'";
      const ext = path.extname(pathname);
      headers['content-type'] = ({ '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css' })[ext] || 'text/plain';
      try { await route.fulfill({ status: 200, headers, body: await readFile(path.join(out, site.id, pathname)) }); }
      catch { await route.fulfill({ status: 404, body: 'Not found' }); }
    });
    await page.goto('https://spec-desk.example.test/');
    await page.waitForSelector('body[data-ready="1"]');
    await page.click('#run');
    await page.waitForSelector('#review-criteria');
    await page.click('#approve-plan');
    await expect(page.locator('#consent-title')).toContainText('test-planner.example.test');
    await page.click('#consent [data-d=allow]');
    await page.waitForSelector('[aria-label="Test plan"]');
    expect(await page.evaluate(() => window.__relay.last.plan.origin)).toBe('test-planner.example.test');
    await page.click('#swap-btn');
    await page.fill('#swap-url', 'https://risk-radar.example.test/risk_test_planner');
    await page.click('#check-btn');
    await page.click('#consent [data-d=allow]');
    await expect(page.locator('.verdict')).toContainText('Compatible');
    await page.click('#use-btn');
    await page.click('#run');
    await page.waitForSelector('#review-criteria');
    await page.click('#approve-plan');
    await page.click('#consent [data-d=allow]');
    await expect.poll(() => page.evaluate(() => window.__relay.last?.plan?.origin)).toBe('risk-radar.example.test');
  } finally { await rm(tmp, { recursive: true, force: true }); }
});
