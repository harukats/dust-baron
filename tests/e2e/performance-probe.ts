import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { cpus, release } from 'node:os';
import { dirname } from 'node:path';
import { chromium } from '@playwright/test';
import { fixture, start, type TestScene } from './helpers.ts';

// この計測はheaded Chromiumで実施する。通常のE2Eとは別コマンド。
const browser = await chromium.launch({ headless: false });
const reports = [];
for (const effect of [false, true]) {
  for (let trial = 1; trial <= 3; trial++) {
    const context = await browser.newContext({
      baseURL: 'http://localhost:8080',
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await fixture(page, { owned: [25, 25, 25, 25, 25, 25], pick: 3 });
    await start(page);
    if (effect) await page.evaluate(() => (window.game.scene.getScene('Game') as TestScene).startStorm());
    await page.waitForTimeout(10_000);
    const metrics = await page.evaluate(async () => {
      const frames: number[] = [],
        inputs: number[] = [];
      let last = performance.now(),
        pending = 0;
      const rendered = () => {
        const now = performance.now();
        frames.push(now - last);
        last = now;
        if (pending) {
          inputs.push(now - pending);
          pending = 0;
        }
      };
      window.game.events.on('postrender', rendered);
      const clicks = setInterval(() => {
        pending = performance.now();
        window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', keyCode: 32 }));
        window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space', keyCode: 32 }));
      }, 500);
      const quantity = setInterval(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'q', code: 'KeyQ', keyCode: 81 }));
        window.dispatchEvent(new KeyboardEvent('keyup', { key: 'q', code: 'KeyQ', keyCode: 81 }));
      }, 10_000);
      await new Promise((resolve) => setTimeout(resolve, 60_000));
      clearInterval(clicks);
      clearInterval(quantity);
      window.game.events.off('postrender', rendered);
      inputs.sort((a, b) => a - b);
      const canvas = document.querySelector('canvas');
      const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
      const ext = gl?.getExtension('WEBGL_debug_renderer_info');
      return {
        fps: (1000 * frames.length) / frames.reduce((a, b) => a + b, 0),
        responseP95: inputs[Math.ceil(inputs.length * 0.95) - 1],
        samples: inputs.length,
        renderer: ext ? gl?.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unavailable',
      };
    });
    reports.push({ effect, trial, ...metrics });
    console.log(JSON.stringify(reports.at(-1)));
    await context.close();
  }
}
const report = {
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceDiffSha256: createHash('sha256')
    .update(execFileSync('git', ['diff', '--', 'src'], { encoding: 'utf8' }))
    .digest('hex'),
  os: release(),
  cpu: cpus()[0].model,
  browser: browser.version(),
  dpr: 1,
  viewport: '1280x720',
  reports,
};
const output = process.env.PERFORMANCE_OUTPUT ?? 'test-results/performance.json';
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2));
await browser.close();
