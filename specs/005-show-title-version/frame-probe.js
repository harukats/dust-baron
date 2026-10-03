import { writeFile } from 'node:fs/promises';
import os from 'node:os';
import { chromium } from '@playwright/test';

const output = process.argv[2];
if (!output) throw new Error('出力先を指定してください');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto('http://127.0.0.1:8080');
  await page.waitForFunction(() => window.game?.scene.isActive('Title'));
  await page.evaluate(() => {
    window.game.sound.mute = true;
  });
  await page.bringToFront();
  const samples = [];
  for (let trial = 0; trial < 3; trial++) {
    await page.waitForTimeout(5000);
    const intervals = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const values = [];
          let first;
          let previous;
          function frame(time) {
            if (first === undefined) {
              first = time;
              previous = time;
            } else {
              values.push(time - previous);
              previous = time;
            }
            if (time - first >= 30000) resolve(values);
            else requestAnimationFrame(frame);
          }
          requestAnimationFrame(frame);
        }),
    );
    const sorted = [...intervals].sort((a, b) => a - b);
    const p95 = sorted[Math.ceil(0.95 * sorted.length) - 1];
    samples.push({ intervals, p95 });
    console.log(`測定 ${trial + 1}: p95=${p95}`);
  }
  const median = samples.map((sample) => sample.p95).sort((a, b) => a - b)[1];
  await writeFile(
    output,
    `${JSON.stringify({ browser: browser.version(), machine: { platform: os.platform(), release: os.release(), cpu: os.cpus()[0].model }, samples, median }, null, 2)}\n`,
  );
} finally {
  await browser.close();
}
