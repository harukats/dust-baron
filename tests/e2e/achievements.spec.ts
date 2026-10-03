import { expect, type Page, test } from '@playwright/test';
import { ACHIEVEMENTS, ACHIEVEMENTS_KEY } from '../../src/config.ts';
import type { State } from '../../src/economy.ts';
import { clickGame, collectCache, fixture, spawnCache, start, state, type TestScene, texts, title } from './helpers.ts';

const DEPOSIT = { x: 370, y: 390 };
const active = (page: Page, key: string): Promise<boolean> => page.evaluate((k) => window.game.scene.isActive(k), key);
const stored = (page: Page): Promise<Record<string, number>> =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), ACHIEVEMENTS_KEY);
const shown = async (page: Page, text: string): Promise<boolean> => (await texts(page)).join(' ').includes(text);

test('100回掘るとトーストが出て、別キーに保存される', async ({ page }) => {
  await fixture(page, { clicks: 99 });
  await start(page);
  await clickGame(page, DEPOSIT.x, DEPOSIT.y);
  await expect.poll(() => shown(page, 'HAND DIGGER')).toBe(true);
  const saved = await stored(page);
  expect(Object.keys(saved)).toEqual(['dig_100']);
  expect(saved.dig_100).toBeGreaterThan(0);
});

test('NEW RUNでセーブを消しても実績は残る', async ({ page }) => {
  await fixture(page, { clicks: 150, scrap: 5 });
  await start(page);
  await expect.poll(() => stored(page)).toHaveProperty('dig_100');
  await title(page);
  await clickGame(page, 640, 625);
  await clickGame(page, 640, 625);
  await expect.poll(() => active(page, 'Game')).toBe(true);
  expect((await state(page)).clicks).toBe(0);
  expect(await stored(page)).toHaveProperty('dig_100');
});

test('実績一覧: 解除数と隠し実績の伏せ字、BACKでタイトルに戻り再開できる', async ({ page }) => {
  await fixture(page, { clicks: 100 });
  await start(page);
  await expect.poll(() => stored(page)).toHaveProperty('dig_100');
  await title(page);
  expect(await shown(page, `ACHIEVEMENTS 1/${ACHIEVEMENTS.length}`)).toBe(true);
  await clickGame(page, 144, 33);
  await expect.poll(() => active(page, 'Achievements')).toBe(true);
  const list = await texts(page);
  expect(list).toContain(`1 / ${ACHIEVEMENTS.length} UNLOCKED`);
  expect(list.filter((t) => t === '??????')).toHaveLength(2);
  expect(list).toContain('HAND DIGGER');
  expect(list).not.toContain('JACKPOT FEVER');
  await clickGame(page, 1040, 693);
  await expect.poll(() => active(page, 'Title')).toBe(true);
  await page.keyboard.press('Space');
  await expect.poll(() => active(page, 'Game')).toBe(true);
});

test('嵐・ゴールドキャッシュ・ゴールド豊作中の採掘で、それぞれ解除される', async ({ page }) => {
  await fixture(page, { scrap: 100, total: 100 });
  await start(page);
  await page.evaluate(() => (window.game.scene.getScene('Game') as TestScene).startStorm());
  await spawnCache(page, 'gold');
  await collectCache(page);
  await expect.poll(() => shown(page, 'DUST IN THE EYES')).toBe(true);
  await expect.poll(() => shown(page, 'ALL THAT GLITTERS')).toBe(true);
  await page.evaluate(() => {
    const scene = window.game.scene.getScene('Game') as TestScene;
    for (let i = 0; i < 77; i++) scene.dig(370, 390);
  });
  await expect.poll(() => stored(page)).toHaveProperty('frenzy_777');
  await expect.poll(() => shown(page, 'JACKPOT FEVER')).toBe(true);
  const s = (await state(page)) as State;
  expect([s.stats.storms, s.stats.golds, s.stats.goldDigs]).toEqual([1, 1, 77]);
});

test('古いセーブで一度に多数解除されたら、1つのトーストにまとめる', async ({ page }) => {
  await fixture(page, { crowns: 2, clicks: 20_000, reigns: 5 });
  await start(page);
  await expect.poll(() => shown(page, '7 ACHIEVEMENTS')).toBe(true);
  expect(Object.keys(await stored(page))).toHaveLength(7);
});

test('最初の王冠ではVictory画面で解除を知らせる', async ({ page }) => {
  await fixture(page, { scrap: 250_000_100, total: 250_000_100, reignTotal: 250_000_100, reignTime: 1500 });
  await start(page);
  await clickGame(page, 1000, 639);
  await expect.poll(() => active(page, 'Victory')).toBe(true);
  await expect.poll(() => shown(page, 'DUST CROWNED')).toBe(true);
  expect(await stored(page)).toHaveProperty('crown_1');
  expect(await stored(page)).toHaveProperty('fast_crown_30');
});
