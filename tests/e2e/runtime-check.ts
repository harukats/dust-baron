import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { fixture, start, state, type TestScene } from './helpers.ts';

type RuntimeScene = TestScene & { spawnCache(): void; chromeCache: unknown; frenzyLeft: number; stormLeft: number };

// headedの実タブ切替・実ウィンドウ最小化を検証する。合成visibilityイベントを使わない。
await mkdir('test-results', { recursive: true });
const launched = await chromium.launch({ headless: false, args: ['--remote-debugging-port=9222'] });
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222', { noDefaults: true });
const failures: { mode: string; message: string }[] = [];
const samples: { mode: string; trial: number; gain: number; seconds: number; pass: boolean }[] = [];
try {
  const context = browser.contexts()[0];
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 720 });
  await fixture(page, { owned: [4, 0, 0, 0, 0, 0] });
  await start(page, 'http://localhost:8080');
  const blank = await context.newPage();
  await blank.goto('about:blank');
  const cdp = await context.newCDPSession(page);
  // noDefaults接続の既定Contextでフォーカス模擬を適用せず、実状態を観測する。
  const browserWindow = await cdp.send('Browser.getWindowForTarget');
  for (const mode of ['tab', 'minimized']) {
    try {
      for (let trial = 1; trial <= 5; trial++) {
        await page.bringToFront();
        await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe('visible');
        await page.evaluate(() => {
          const scene = window.game.scene.getScene('Game') as TestScene;
          scene.stormIn = 1e9;
          scene.cacheIn = 1e9;
        });
        const before = (await state(page)).scrap;
        const at = performance.now();
        if (mode === 'tab') await blank.bringToFront();
        else
          await cdp.send('Browser.setWindowBounds', {
            windowId: browserWindow.windowId,
            bounds: { windowState: 'minimized' },
          });
        await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe('hidden');
        await page.waitForTimeout(60_000);
        if (mode === 'minimized')
          await cdp.send('Browser.setWindowBounds', {
            windowId: browserWindow.windowId,
            bounds: { windowState: 'normal' },
          });
        await page.bringToFront();
        await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe('visible');
        const gain = (await state(page)).scrap - before;
        const seconds = (performance.now() - at) / 1000;
        const sample = { mode, trial, gain, seconds, pass: Math.abs(gain - 120) <= 2 };
        samples.push(sample);
        console.log(JSON.stringify(sample));
        expect(sample.pass).toBe(true);
      }
    } catch (error) {
      failures.push({ mode, message: String(error) });
      console.error(`${mode}: ${String(error)}`);
      process.exitCode = 1;
      await cdp.send('Browser.setWindowBounds', {
        windowId: browserWindow.windowId,
        bounds: { windowState: 'normal' },
      });
    }
  }
  await page.evaluate(() => {
    const scene = window.game.scene.getScene('Game') as RuntimeScene;
    scene.startStorm();
    scene.spawnCache();
    const run = window.game.registry.get('run');
    run.frenzyEndsAtMs = run.now() + 20_000;
  });
  const effectsBefore = (await state(page)).scrap;
  await blank.bringToFront();
  await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe('hidden');
  await page.waitForTimeout(25_000);
  const effectsGain = (await state(page)).scrap - effectsBefore;
  expect(Math.abs(effectsGain - 80)).toBeLessThanOrEqual(2);
  expect(
    await page.evaluate(() => {
      const scene = window.game.scene.getScene('Game') as RuntimeScene;
      return scene.stormLeft === 0 && scene.frenzyLeft === 0 && scene.chromeCache === null;
    }),
  ).toBe(true);
  samples.push({ mode: 'hidden-effects', trial: 1, gain: effectsGain, seconds: 25, pass: true });
  const closingBefore = (await state(page)).scrap;
  await blank.bringToFront();
  await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe('hidden');
  await page.waitForTimeout(5000);
  await page.close();
  await start(blank, 'http://localhost:8080');
  const closingGain = (await state(blank)).scrap - closingBefore;
  expect(Math.abs(closingGain - 10)).toBeLessThanOrEqual(2);
  samples.push({ mode: 'hidden-close', trial: 1, gain: closingGain, seconds: 5, pass: true });
} finally {
  await writeFile(
    'test-results/runtime.json',
    JSON.stringify({ browser: browser.version(), samples, failures }, null, 2),
  );
  await browser.close();
  await launched.close();
}
