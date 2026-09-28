import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { clickGame, fixture, start, state, texts, title } from './helpers.ts';

test('実際の履歴移動後に保存を復元し所有者1画面で再開', async ({ page }) => {
  await fixture(page, { scrap: 123, total: 123, pick: 3 });
  await start(page);
  await page.goto('about:blank');
  await page.goBack();
  await expect.poll(() => page.evaluate(() => window.game?.scene.isActive('Title')), { timeout: 30_000 }).toBe(true);
  await clickGame(page, 640, 510);
  await expect.poll(() => page.evaluate(() => window.game.scene.isActive('Game'))).toBe(true);
  expect((await state(page)).pick).toBe(3);
  expect(await page.locator('canvas').count()).toBe(1);
});

test('NEW RUNは明示的な再確認後だけ初期化', async ({ page }) => {
  await fixture(page, { scrap: 0, total: 0, pick: 3, won: true });
  await title(page);
  expect((await texts(page)).join(' ')).toContain('CONTINUE');
  await clickGame(page, 640, 625);
  expect((await texts(page)).join(' ')).toContain('TAP AGAIN TO WIPE SAVE');
  await clickGame(page, 640, 625);
  await expect.poll(() => page.evaluate(() => window.game.scene.isActive('Game'))).toBe(true);
  const s = await state(page);
  expect(s.pick).toBe(0);
  expect(s.won).toBe(false);
  expect(s.scrap).toBe(0);
});

test('HMRで旧ゲーム停止とロック解放後に一つだけ再起動', async ({ page }) => {
  await start(page);
  await page.keyboard.press('Space');
  const source = fileURLToPath(new URL('../../src/main.ts', import.meta.url));
  const original = await readFile(source, 'utf8');
  try {
    await Promise.all([
      page.waitForEvent('framenavigated'),
      writeFile(source, `${original}\n// HMR検証用の一時変更\n`),
    ]);
    await expect.poll(() => page.evaluate(() => window.game?.scene.isActive('Title')), { timeout: 30_000 }).toBe(true);
    expect(await page.locator('canvas').count()).toBe(1);
    const held = await page.evaluate(async () => (await navigator.locks.query()).held);
    expect(held?.filter((lock) => lock.name === 'dust-baron-save-v1:play').length).toBe(1);
  } finally {
    await Promise.all([page.waitForEvent('framenavigated'), writeFile(source, original)]);
  }
});
