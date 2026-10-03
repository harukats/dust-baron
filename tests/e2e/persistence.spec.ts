import { expect, test } from '@playwright/test';
import { SAVE_KEY } from '../../src/config.ts';
import { fixture, start, state, type TestScene } from './helpers.ts';

test('保存復元10回とシーン移動でも進行維持', async ({ page }) => {
  await fixture(page, { scrap: 123, total: 456, owned: [0, 0, 0, 0, 0, 0], pick: 3, crowns: 1 });
  for (let i = 0; i < 10; i++) {
    await start(page);
    const s = await state(page);
    expect(s.scrap).toBe(123);
    expect(s.pick).toBe(3);
    expect(s.crowns).toBe(1);
  }
});
test('離席加算直後の再読み込みは二重受領しない', async ({ page }) => {
  await fixture(page, { owned: [4, 0, 0, 0, 0, 0], lastSave: Date.now() - 60_000 });
  await start(page);
  const first = (await state(page)).scrap;
  expect(first).toBeGreaterThanOrEqual(60);
  expect(first).toBeLessThan(66);
  await start(page);
  expect((await state(page)).scrap).toBeLessThan(first + 6);
});
test('残高だけ破損しても所有数・強化・達成を保持', async ({ page }) => {
  await fixture(page, { scrap: -1, total: 100, pick: 3, crowns: 1, owned: [1, 0, 0, 0, 0, 0] });
  await start(page);
  const s = await state(page);
  expect(s.scrap).toBeLessThan(1);
  expect(s.pick).toBe(3);
  expect(s.crowns).toBe(1);
  expect(s.owned[0]).toBe(1);
});
test('保存領域が失敗しても採掘・購入できる', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new Error('denied');
      },
    });
  });
  await start(page);
  await page.evaluate(() => {
    const s = (window.game.scene.getScene('Game') as TestScene).s;
    s.scrap = 15;
  });
  await page.mouse.click(1000, 183);
  expect((await state(page)).owned[0]).toBe(1);
  await page.keyboard.press('Space');
  expect((await state(page)).scrap).toBeGreaterThanOrEqual(1);
});
test('5秒の定期保存は成功日時と現在進行を更新する', async ({ page }) => {
  await start(page);
  await page.keyboard.press('Space');
  await page.waitForTimeout(5500);
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), SAVE_KEY);
  expect(saved.scrap).toBe(1);
  expect(saved.lastSave).toBeGreaterThan(Date.now() - 6000);
});
