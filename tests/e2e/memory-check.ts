import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { clickGame, fixture, nextFrame, start } from './helpers.ts';

// GC後の使用量を記録する。短時間の測定だけで長期のリーク不存在を保証しない。
await mkdir('test-results', { recursive: true });
const cycles = Number(process.env.MEMORY_CYCLES ?? 20);
if (!Number.isSafeInteger(cycles) || cycles < 1) throw new Error('MEMORY_CYCLESは正の整数を指定してください');
const browser = await chromium.launch();
const samples = [];
try {
  const context = await browser.newContext({ baseURL: 'http://localhost:8080' });
  const page = await context.newPage();
  await fixture(page, { scrap: 1e9, total: 1e9, owned: [25, 25, 25, 25, 25, 25] });
  await start(page);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  for (let cycle = 0; cycle <= cycles; cycle++) {
    if (cycle) {
      await page.evaluate(() => window.game.scene.getScene('Game').scene.start('Title'));
      await expect.poll(() => page.evaluate(() => window.game.scene.isActive('Title'))).toBe(true);
      await clickGame(page, 640, 510);
      await expect.poll(() => page.evaluate(() => window.game.scene.isActive('Game'))).toBe(true);
      await nextFrame(page);
    }
    if (cycle % 5 === 0 || cycle === cycles) {
      await cdp.send('HeapProfiler.collectGarbage');
      const { metrics } = await cdp.send('Performance.getMetrics');
      const counts = await page.evaluate(() => ({
        canvas: document.querySelectorAll('canvas').length,
        music: window.game.sound.getAll('music').length,
        space: window.game.scene.getScene('Game').input.keyboard?.listenerCount('keydown-SPACE'),
        quantity: window.game.scene.getScene('Game').input.keyboard?.listenerCount('keydown-Q'),
        mute: window.game.scene.getScene('Game').input.keyboard?.listenerCount('keydown-M'),
        children: window.game.scene.getScene('Game').children.length,
      }));
      expect(counts.canvas).toBe(1);
      expect(counts.music).toBe(1);
      expect(counts.space).toBe(1);
      expect(counts.quantity).toBe(1);
      expect(counts.mute).toBe(1);
      samples.push({ cycle, heapBytes: metrics.find((m) => m.name === 'JSHeapUsedSize')?.value, ...counts });
      console.log(JSON.stringify(samples.at(-1)));
    }
  }
} finally {
  await writeFile('test-results/memory.json', JSON.stringify(samples, null, 2));
  await browser.close();
}
