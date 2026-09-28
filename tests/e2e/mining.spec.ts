import { expect, test } from '@playwright/test';
import { clickGame, start, state, texts } from './helpers.ts';

for (const width of [1280, 960]) {
  test(`クリック・Space・装飾・英語HUD ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: (width * 720) / 1280 });
    await start(page);
    expect((await state(page)).scrap).toBe(0);
    for (let i = 0; i < 100; i++) await clickGame(page, 370, 390);
    expect((await state(page)).scrap).toBe(100);
    await page.keyboard.press('Space');
    expect((await state(page)).scrap).toBe(101);
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 32, repeat: true })));
    expect((await state(page)).scrap).toBe(101);
    await clickGame(page, 30, 680);
    expect((await state(page)).scrap).toBe(101);
    await page.keyboard.press('m');
    await expect.poll(() => page.evaluate(() => window.game.sound.mute)).toBe(true);
    expect((await texts(page)).join(' ')).toContain('Credits');
    await page.screenshot({ path: `test-results/mining-${width}.png` });
  });
}
