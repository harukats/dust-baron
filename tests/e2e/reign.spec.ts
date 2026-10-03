import { expect, type Page, test } from '@playwright/test';
import { RELICS } from '../../src/config.ts';
import type { State } from '../../src/economy.ts';
import { clickGame, fixture, start, texts } from './helpers.ts';

const REIGN_BUTTON = { x: 626, y: 42 };
const ASCEND_BUTTON = { x: 300, y: 560 };
const BACK_BUTTON = { x: 300, y: 620 };
const relicRow = (i: number) => ({ x: 900, y: 208 + i * 78 });

const live = (page: Page): Promise<State> =>
  page.evaluate(() => (window.game.registry.get('run') as { state: State }).state);
const active = (page: Page, key: string): Promise<boolean> => page.evaluate((k) => window.game.scene.isActive(k), key);

test('ASCENDは王冠1つ以降に現れ、確認の2回目で転生する', async ({ page }) => {
  await fixture(page, {
    crowns: 1,
    scrap: 1e9,
    total: 1e12,
    reignTotal: 1e12,
    pick: 3,
    owned: [5, 4, 3, 2, 1, 0],
  });
  await start(page);
  expect((await texts(page)).join(' ')).toContain('REIGN  +46');
  await clickGame(page, REIGN_BUTTON.x, REIGN_BUTTON.y);
  await expect.poll(() => active(page, 'Reign')).toBe(true);
  expect((await texts(page)).join(' ')).toContain('ASCEND FOR  +46 SHARDS');

  await clickGame(page, ASCEND_BUTTON.x, ASCEND_BUTTON.y);
  expect(await active(page, 'Reign'), 'the first tap only arms it').toBe(true);
  expect((await live(page)).reigns).toBe(0);
  await clickGame(page, ASCEND_BUTTON.x, ASCEND_BUTTON.y);
  await expect.poll(() => active(page, 'Game')).toBe(true);

  const s = await live(page);
  expect([s.reigns, s.shards, s.shardsEarned, s.crowns, s.pick]).toEqual([1, 46, 46, 0, 0]);
  expect(s.scrap).toBe(0);
  expect(s.owned.every((n) => n === 0)).toBe(true);
  expect(s.total).toBeGreaterThanOrEqual(1e12);
  const shown = (await texts(page)).join(' ');
  expect(shown).toContain('REIGN 2 BEGINS');
  expect(shown).toContain('46 shards  +92% output');
});

test('王冠がなければ転生できず、遺物はShardで買えて保存される', async ({ page }) => {
  await fixture(page, { reigns: 1, shards: 20, shardsEarned: 20, total: 1e9, reignTotal: 1e6 });
  await start(page);
  const hud = (await texts(page)).join(' ');
  expect(hud).toContain('RELICS');
  expect(hud).not.toContain('REIGN  +');
  await clickGame(page, REIGN_BUTTON.x, REIGN_BUTTON.y);
  await expect.poll(() => active(page, 'Reign')).toBe(true);
  expect((await texts(page)).join(' ')).toContain('NO SHARDS TO CLAIM YET');

  await clickGame(page, ASCEND_BUTTON.x, ASCEND_BUTTON.y);
  await clickGame(page, ASCEND_BUTTON.x, ASCEND_BUTTON.y);
  expect(await active(page, 'Reign'), 'a refused ascend stays put').toBe(true);
  expect((await live(page)).reigns).toBe(1);

  const storm = RELICS.findIndex((r) => r.id === 'storm_caller');
  await clickGame(page, relicRow(storm).x, relicRow(storm).y);
  let s = await live(page);
  expect([s.relics[storm], s.shards]).toEqual([1, 10]);
  await clickGame(page, relicRow(storm).x, relicRow(storm).y);
  s = await live(page);
  expect([s.relics[storm], s.shards], '40 shards for level 2, only 10 left').toEqual([1, 10]);
  expect((await texts(page)).join(' ')).toContain('10 SHARDS');

  await page.reload();
  await page.waitForFunction(() => window.game?.scene.isActive('Title'));
  await clickGame(page, 640, 510);
  await expect.poll(() => active(page, 'Game')).toBe(true);
  s = await live(page);
  expect([s.relics[storm], s.shards, s.reigns]).toEqual([1, 10, 1]);
});

test('BACKでGameに戻り、転生前の進行は変わらない', async ({ page }) => {
  await fixture(page, { crowns: 1, scrap: 777, total: 1e12, reignTotal: 1e12, owned: [3, 0, 0, 0, 0, 0] });
  await start(page);
  await clickGame(page, REIGN_BUTTON.x, REIGN_BUTTON.y);
  await expect.poll(() => active(page, 'Reign')).toBe(true);
  await clickGame(page, BACK_BUTTON.x, BACK_BUTTON.y);
  await expect.poll(() => active(page, 'Game')).toBe(true);
  const s = await live(page);
  expect([s.crowns, s.reigns, s.owned[0]]).toEqual([1, 0, 3]);
  expect(s.scrap).toBeGreaterThanOrEqual(777);
});
