import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect, type Page } from '@playwright/test';
import { fixture, start, state, trackStorage } from './helpers.ts';

await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ headless: false });
const results: { mode: string; trial: number; separateWindow: boolean; accessCount: number; restored: number }[] = [];
try {
  for (const mode of ['tab', 'window']) {
    for (let trial = 1; trial <= 5; trial++) {
      const context = await browser.newContext({
        baseURL: 'http://localhost:8080',
        viewport: { width: 1280, height: 720 },
      });
      const first = await context.newPage();
      await fixture(first, { owned: [4, 0, 0, 0, 0, 0], pick: 3 });
      await start(first);
      let later: Page;
      if (mode === 'tab') later = await context.newPage();
      else {
        [later] = await Promise.all([
          context.waitForEvent('page'),
          first.evaluate(() => {
            window.open('about:blank', '', 'popup,width=960,height=540');
          }),
        ]);
      }
      const firstCdp = await context.newCDPSession(first);
      const laterCdp = await context.newCDPSession(later);
      const a = await firstCdp.send('Browser.getWindowForTarget');
      const b = await laterCdp.send('Browser.getWindowForTarget');
      const separateWindow = a.windowId !== b.windowId;
      expect(separateWindow).toBe(mode === 'window');
      await trackStorage(later);
      await later.goto('/');
      await expect(later.getByRole('heading', { name: 'GAME ALREADY OPEN' })).toBeVisible();
      expect(await later.locator('canvas').count()).toBe(0);
      const accessCount = await later.evaluate(() => window.storageCalls.length);
      expect(accessCount).toBe(0);
      await first.close();
      await start(later);
      const restored = (await state(later)).owned[0];
      expect(restored).toBe(4);
      expect((await state(later)).pick).toBe(3);
      results.push({ mode, trial, separateWindow, accessCount, restored });
      console.log(JSON.stringify(results.at(-1)));
      await context.close();
    }
  }
} finally {
  await writeFile('test-results/windows.json', JSON.stringify(results, null, 2));
  await browser.close();
}
