import { expect, test } from '@playwright/test';
import { start, state, type TestScene, texts, title, trackStorage } from './helpers.ts';

test('同じ保存先の後続画面を起動前にブロックする', async ({ page, context, browser }) => {
  await start(page);
  const later = await context.newPage();
  await trackStorage(later);
  await later.goto('/');
  await expect(later.getByRole('heading', { name: 'GAME ALREADY OPEN' })).toBeVisible();
  expect(await later.locator('canvas').count()).toBe(0);
  expect(await later.evaluate(() => window.storageCalls)).toEqual([]);
  await page.close();
  await start(later);
  const other = await browser.newContext({ baseURL: 'http://localhost:8080' });
  await title(await other.newPage());
  await other.close();
});

for (const reason of ['missing', 'exception']) {
  test(`ロック${reason}では保存なしで遊べる`, async ({ page }) => {
    await page.addInitScript((reason) => {
      Object.defineProperty(navigator, 'locks', {
        value:
          reason === 'missing'
            ? undefined
            : {
                request: () => Promise.reject(new Error('unavailable')),
              },
      });
    }, reason);
    await trackStorage(page);
    await start(page);
    expect(await texts(page)).toContain('TEMPORARY PLAY — NOT SAVED');
    await page.mouse.click(370, 390);
    expect((await state(page)).scrap).toBe(1);
    await page.evaluate(() => {
      const scene = window.game.scene.getScene('Game') as TestScene;
      scene.s.scrap = 200;
      scene.s.total = 200;
    });
    await page.mouse.click(1000, 183);
    await page.mouse.click(1000, 107);
    expect((await state(page)).owned[0]).toBe(1);
    expect((await state(page)).pick).toBe(1);
    await page.waitForTimeout(1100);
    expect((await state(page)).scrap).toBeGreaterThan(135);
    expect(await page.evaluate(() => window.storageCalls)).toEqual([]);
  });
}
