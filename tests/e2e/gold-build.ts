import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

// pnpm exec vite preview --host 127.0.0.1 --port 8081 --base /dust-baron/
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const assetErrors: string[] = [];
  const jsErrors: string[] = [];
  page.on('pageerror', (error) => jsErrors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400) assetErrors.push(response.url());
  });
  const gold = page.waitForResponse((response) => response.url().endsWith('/dust-baron/assets/gold-cache.png'));
  await page.goto('http://127.0.0.1:8081/dust-baron/');
  const response = await gold;
  assert.equal(response.status(), 200);
  const image = await response.body();
  assert.equal(image.readUInt32BE(16), 128);
  assert.equal(image.readUInt32BE(20), 128);
  await page.waitForTimeout(1500);
  assert.equal(await page.locator('canvas').count(), 1);
  assert.deepEqual(assetErrors, []);
  assert.deepEqual(jsErrors, []);
  await page.screenshot({ path: 'test-results/gold-build-subpath.png' });
  console.log('built /dust-baron/ assets including gold-cache: 200, 128x128, no load/runtime errors');
} finally {
  await browser.close();
}
