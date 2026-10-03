import { expect, test } from '@playwright/test';
import { CROWNS } from '../../src/config.ts';
import { clickGame, fixture, start, state, texts } from './helpers.ts';

const CROWN_ROW = { x: 1000, y: 639 };

test('王冠2段目はバナーで知らせてGameに留まり、新Tierが現れて最古のTierが窓から外れる', async ({ page }) => {
  await fixture(page, { crowns: 1, scrap: 1e10, total: 1e10 });
  await start(page);
  const before = (await texts(page)).join(' ');
  expect(before).toContain('DUNE MINER');
  expect(before).not.toContain('SCAVENGER');
  expect(before).toContain(CROWNS[1].name.toUpperCase());
  await clickGame(page, CROWN_ROW.x, CROWN_ROW.y);
  expect(await page.evaluate(() => window.game.scene.isActive('Game'))).toBe(true);
  expect(await page.evaluate(() => window.game.scene.isActive('Victory'))).toBe(false);
  expect((await state(page)).crowns).toBe(2);
  const after = (await texts(page)).join(' ');
  expect(after).toContain(CROWNS[1].name.toUpperCase());
  expect(after).toContain('DUNE LEVIATHAN');
  expect(after).not.toContain('DUNE MINER');
  expect(after).toContain(CROWNS[2].name.toUpperCase());
});

test('王冠が足りなければ買えず、最終王冠だけエンディングを出す', async ({ page }) => {
  await fixture(page, { crowns: CROWNS.length - 1, scrap: CROWNS[CROWNS.length - 1].cost / 2, total: 1e15 });
  await start(page);
  await clickGame(page, CROWN_ROW.x, CROWN_ROW.y);
  expect((await state(page)).crowns).toBe(CROWNS.length - 1);
  await page.evaluate(
    (cost) => {
      const s = (window.game.scene.getScene('Game') as unknown as { s: { scrap: number } }).s;
      s.scrap = cost;
    },
    CROWNS[CROWNS.length - 1].cost,
  );
  await clickGame(page, CROWN_ROW.x, CROWN_ROW.y);
  await expect.poll(() => page.evaluate(() => window.game.scene.isActive('Victory'))).toBe(true);
  expect((await texts(page)).join(' ')).toContain('THE WASTES ARE ETERNAL');
  await page.waitForTimeout(1000);
  await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => window.game.scene.isActive('Game'))).toBe(true);
  expect((await state(page)).crowns).toBe(CROWNS.length);
  expect((await texts(page)).join(' ')).toContain(`${CROWNS[CROWNS.length - 1].name.toUpperCase()} - CLAIMED`);
  await clickGame(page, CROWN_ROW.x, CROWN_ROW.y);
  expect(await page.evaluate(() => window.game.scene.isActive('Game'))).toBe(true);
  expect((await state(page)).crowns).toBe(CROWNS.length);
});
