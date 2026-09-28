import { expect, test } from '@playwright/test';
import { fixture, start, state, title } from './helpers.ts';

test('同時起動でも所有者1画面', async ({ page, context }) => {
  const other = await context.newPage();
  await Promise.all([page.goto('/'), other.goto('/')]);
  await expect
    .poll(async () => (await page.locator('canvas').count()) + (await other.locator('canvas').count()))
    .toBe(1);
  const blocked = (await page.locator('canvas').count()) ? other : page;
  await expect(blocked.getByRole('heading', { name: 'GAME ALREADY OPEN' })).toBeVisible();
});
test('背景経過を100%補償し同じ区間を再計上しない', async ({ page }) => {
  await fixture(page, { owned: [4, 0, 0, 0, 0, 0] });
  await start(page);
  const before = (await state(page)).scrap;
  await page.evaluate(() => {
    window.game.registry.get('run').accountedAtMs -= 60_000;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const after = (await state(page)).scrap;
  expect(after - before).toBeGreaterThanOrEqual(120);
  expect(after - before).toBeLessThan(122);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  expect((await state(page)).scrap).toBeLessThan(after + 1);
});
test('再入場10回でも1入力1採掘、canvas・BGM・購読が増えない', async ({ page }) => {
  await start(page);
  for (let i = 0; i < 10; i++) {
    await page.evaluate(() => window.game.scene.getScene('Game').scene.start('Title'));
    await expect.poll(() => page.evaluate(() => window.game.scene.isActive('Title'))).toBe(true);
    await page.mouse.click(640, 510);
    await expect.poll(() => page.evaluate(() => window.game.scene.isActive('Game'))).toBe(true);
    const before = (await state(page)).clicks;
    await page.keyboard.press('Space');
    expect((await state(page)).clicks).toBe(before + 1);
  }
  expect(await page.locator('canvas').count()).toBe(1);
  expect(await page.evaluate(() => window.game.sound.getAll('music').length)).toBe(1);
});
test('一時プレイはシーンで保持し再読み込みで破棄する', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'locks', { value: undefined }));
  await start(page);
  await page.keyboard.press('Space');
  await page.evaluate(() => window.game.scene.getScene('Game').scene.start('Title'));
  await expect.poll(() => page.evaluate(() => window.game.scene.isActive('Title'))).toBe(true);
  await page.mouse.click(640, 510);
  await expect.poll(() => page.evaluate(() => window.game.scene.isActive('Game'))).toBe(true);
  expect((await state(page)).scrap).toBe(1);
  await start(page);
  expect((await state(page)).scrap).toBe(0);
});
test('pagehide停止・pageshowで再取得してから再開する', async ({ page }) => {
  await title(page);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
  await expect(page.locator('canvas')).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await expect.poll(() => page.evaluate(() => window.game?.scene.isActive('Title'))).toBe(true);
});
