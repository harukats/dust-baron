import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { clickGame, collectCache, fixture, spawnCache, start, state, type TestScene, texts, title } from './helpers.ts';

await mkdir('test-results', { recursive: true });

const browser = await chromium.launch();
try {
  for (const width of [1280, 960]) {
    const context = await browser.newContext({
      baseURL: 'http://localhost:8080',
      viewport: { width, height: (width * 720) / 1280 },
    });
    const page = await context.newPage();
    await fixture(page, { total: 1e9, scrap: 1e9, owned: [25, 25, 25, 25, 25, 25], pick: 3, won: true });
    await title(page);
    await page.screenshot({ path: `test-results/title-${width}.png` });
    await start(page);
    const normal = await texts(page);
    assert.ok(normal.every((text) => !/[\u3040-\u30ff\u3400-\u9fff]/.test(text)));
    await page.screenshot({ path: `test-results/shop-${width}.png` });
    await clickGame(page, 1000, 183);
    assert.equal((await state(page)).owned[0], 26);
    await page.keyboard.press('m');
    await expect.poll(() => page.evaluate(() => window.game.sound.mute)).toBe(true);
    for (const [name, random] of [
      ['jackpot', 0.25],
      ['cache-frenzy', 0.75],
    ] as const) {
      await spawnCache(page, 'chrome');
      assert.equal(await page.evaluate(() => (window.game.scene.getScene('Game') as TestScene).cacheKind), 'chrome');
      assert.ok((await texts(page)).includes('CHROME CACHE'));
      await page.screenshot({ path: `test-results/chrome-cache-${width}.png` });
      await collectCache(page, random);
      const rewardTexts = await texts(page);
      assert.ok(rewardTexts.includes(name === 'jackpot' ? 'CHROME JACKPOT!' : 'DIG FRENZY!'));
      assert.ok(rewardTexts.every((text) => !/[\u3040-\u30ff\u3400-\u9fff]/.test(text)));
      await page.screenshot({ path: `test-results/${name}-${width}.png` });
    }
    await page.evaluate(() => (window.game.scene.getScene('Game') as TestScene).startStorm());
    await page.screenshot({ path: `test-results/storm-${width}.png` });
    await page.evaluate(() => {
      const run = window.game.registry.get('run');
      run.frenzyMult = 7;
      run.frenzyEndsAtMs = run.now() + 20_000;
    });
    assert.ok((await texts(page)).some((text) => text.includes('FRENZY')));
    await page.screenshot({ path: `test-results/frenzy-${width}.png` });
    await page.evaluate(() =>
      window.game.scene.getScene('Game').scene.start('Victory', { time: 10, total: 1000, clicks: 100 }),
    );
    await expect.poll(() => page.evaluate(() => window.game.scene.isActive('Victory'))).toBe(true);
    await page.screenshot({ path: `test-results/victory-${width}.png` });
    await context.close();
    const offline = await browser.newContext({
      baseURL: 'http://localhost:8080',
      viewport: { width, height: (width * 720) / 1280 },
    });
    const offlinePage = await offline.newPage();
    await fixture(offlinePage, { owned: [4, 0, 0, 0, 0, 0], lastSave: Date.now() - 60_000 });
    await start(offlinePage);
    assert.ok((await texts(offlinePage)).some((text) => text.includes('WHILE YOU WERE GONE')));
    await offlinePage.screenshot({ path: `test-results/offline-${width}.png` });
    await offline.close();
    const temporary = await browser.newContext({
      baseURL: 'http://localhost:8080',
      viewport: { width, height: (width * 720) / 1280 },
    });
    const tempPage = await temporary.newPage();
    await tempPage.addInitScript(() => Object.defineProperty(navigator, 'locks', { value: undefined }));
    await start(tempPage);
    await tempPage.screenshot({ path: `test-results/temporary-${width}.png` });
    await temporary.close();
    console.log(`${width}: 開始・所有状態・砂嵐・フレンジー・達成・一時プレイの画面を記録`);
  }
} finally {
  await browser.close();
}
