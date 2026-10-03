import { chromium, expect } from '@playwright/test';
import { collectCache, fixture, spawnCache, start, state, type TestScene } from './helpers.ts';

// 実タブ切替で期限が進むことを確認。合成visibilityイベントは使わない。
const launched = await chromium.launch({ headless: false, args: ['--remote-debugging-port=9223'] });
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223', { noDefaults: true });
try {
  const context = browser.contexts()[0];
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 720 });
  await fixture(page, { owned: [4, 0, 0, 0, 0, 0] });
  await start(page, 'http://localhost:8080');
  await spawnCache(page, 'gold');
  await collectCache(page);
  await spawnCache(page, 'gold');
  await page.evaluate(() => (window.game.scene.getScene('Game') as TestScene).startStorm());
  const before = (await state(page)).scrap;
  const blank = await context.newPage();
  await blank.goto('about:blank');
  await blank.bringToFront();
  await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe('hidden');
  await page.waitForTimeout(25_000);
  await page.bringToFront();
  await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe('visible');
  const gain = (await state(page)).scrap - before;
  expect(Math.abs(gain - 80)).toBeLessThanOrEqual(2);
  expect(
    await page.evaluate(() => {
      const scene = window.game.scene.getScene('Game') as TestScene;
      return scene.frenzyLeft === 0 && scene.cachePickup === null && scene.cacheLabel === null && scene.digPower === 1;
    }),
  ).toBe(true);
  await page.keyboard.press('Space');
  expect((await state(page)).scrap - before - gain).toBeLessThan(2);
  console.log(JSON.stringify({ mode: 'gold-hidden-25s', gain, pass: true }));
} finally {
  await browser.close();
  await launched.close();
}
