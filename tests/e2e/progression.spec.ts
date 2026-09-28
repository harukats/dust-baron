import { expect, test } from '@playwright/test';
import { clickGame, fixture, start, state, type TestScene, texts } from './helpers.ts';

test('10個・MAXの合計丸めと不足時の無変更', async ({ page }) => {
  await fixture(page, { scrap: 304, total: 304 });
  await start(page);
  await page.keyboard.press('q');
  await page.mouse.click(1000, 183);
  expect((await state(page)).owned[0]).toBe(0);
  await page.evaluate(() => {
    const s = (window.game.scene.getScene('Game') as TestScene).s;
    s.scrap = 305;
    s.total = 305;
  });
  await page.mouse.click(1000, 183);
  expect((await state(page)).owned[0]).toBe(10);
  const purchased = await state(page);
  expect(purchased.total - purchased.scrap).toBeCloseTo(305, 9);
  await page.keyboard.press('q');
  expect((await texts(page)).join(' ')).toContain('BUY MAX');
});
test('強化・Dust Crownは一度だけ、達成後も同じ進行', async ({ page }) => {
  await fixture(page, { scrap: 250_000_100, total: 250_000_100, owned: [1, 0, 0, 0, 0, 0] });
  await start(page);
  await page.mouse.click(1000, 107);
  expect((await state(page)).pick).toBe(1);
  await page.mouse.click(1000, 639);
  await expect.poll(() => page.evaluate(() => window.game.scene.isActive('Victory'))).toBe(true);
  await page.waitForTimeout(1000);
  await clickGame(page, 1190, 33);
  expect(await page.evaluate(() => window.game.scene.isActive('Victory'))).toBe(true);
  expect(await page.evaluate(() => window.game.sound.mute)).toBe(true);
  await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => window.game.scene.isActive('Game'))).toBe(true);
  const s = await state(page);
  expect(s.won).toBe(true);
  expect(s.pick).toBe(1);
  expect(s.owned[0]).toBe(1);
});
