import { expect, test } from '@playwright/test';
import { clickGame, fixture, start, state, type TestScene } from './helpers.ts';

test('1秒1クリックで30秒以内に雇用し60秒で30Creditsを得る', async ({ page }) => {
  await start(page);
  const began = performance.now();
  for (let i = 0; i < 15; i++) {
    await clickGame(page, 370, 390);
    await page.waitForTimeout(1000);
  }
  await clickGame(page, 1000, 183);
  expect((await state(page)).owned[0]).toBe(1);
  expect(performance.now() - began).toBeLessThan(30_000);
  const before = (await state(page)).scrap;
  await page.waitForTimeout(60_000);
  const gain = (await state(page)).scrap - before;
  expect(gain).toBeGreaterThanOrEqual(29.5);
  expect(gain).toBeLessThanOrEqual(30.5);
});

test('初回雇用・小数生産・装置・手動採掘の併用', async ({ page }) => {
  await fixture(page, { scrap: 15, total: 15 });
  await start(page);
  await page.mouse.click(1000, 183);
  expect((await state(page)).owned[0]).toBe(1);
  expect((await state(page)).scrap).toBeLessThan(0.5);
  await page.waitForTimeout(20_000);
  expect((await state(page)).scrap).toBeGreaterThanOrEqual(9.5);
  expect((await state(page)).scrap).toBeLessThanOrEqual(10.5);
  await page.evaluate(() => {
    const s = (window.game.scene.getScene('Game') as TestScene).s;
    s.scrap = 1300;
    s.total = 1300;
  });
  await page.mouse.click(1000, 335);
  expect((await state(page)).owned[2]).toBe(1);
  const before = (await state(page)).scrap;
  await page.keyboard.press('Space');
  expect((await state(page)).scrap).toBeGreaterThanOrEqual(before + 1);
});
