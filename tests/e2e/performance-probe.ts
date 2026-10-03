import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { cpus, release } from 'node:os';
import { dirname } from 'node:path';
import { chromium } from '@playwright/test';
import { fixture, start, type TestScene } from './helpers.ts';

type ProbeScene = TestScene & { spawnCache(): void; collectCache(): void };
// 同じスケジュールを変更前後で実行する。gold対応の有無だけ自動判別する。
const browser = await chromium.launch({ headless: false });
const reports = [];
try {
  const probeContext = await browser.newContext();
  const probePage = await probeContext.newPage();
  await start(probePage, 'http://localhost:8080');
  const goldSupported = await probePage.evaluate(() => window.game.textures.exists('gold-cache'));
  await probeContext.close();
  const conditions = ['normal', 'chrome', 'chrome-pickup', ...(goldSupported ? ['gold', 'gold-pickup'] : [])];
  for (const condition of conditions) {
    for (let trial = 1; trial <= 3; trial++) {
      const context = await browser.newContext({
        baseURL: 'http://localhost:8080',
        viewport: { width: 1280, height: 720 },
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();
      await fixture(page, { owned: [25, 25, 25, 25, 25, 25], pick: 3 });
      await start(page);
      const metrics = await page.evaluate(async (condition) => {
        const scene = window.game.scene.getScene('Game') as ProbeScene;
        const run = window.game.registry.get('run');
        const effect = condition !== 'normal';
        const gold = condition.startsWith('gold');
        const pickup = condition.endsWith('pickup');
        const applyFrenzy = () => {
          run.frenzyMult = gold ? 777 : 7;
          run.frenzyEndsAtMs = run.now() + 20_000;
        };
        let stormCalls = 0;
        let frenzyCalls = 0;
        let spawnCalls = 0;
        let collectCalls = 0;
        const storm = () => {
          scene.startStorm();
          scene.stormIn = 1e9;
          stormCalls++;
        };
        const frenzy = () => {
          applyFrenzy();
          frenzyCalls++;
        };
        const frames: number[] = [],
          inputs: number[] = [];
        let last = 0,
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
        const press = (key: string, code: string, keyCode: number) => {
          window.dispatchEvent(new KeyboardEvent('keydown', { key, code, keyCode }));
          window.dispatchEvent(new KeyboardEvent('keyup', { key, code, keyCode }));
        };
        if (effect) {
          storm();
          frenzy();
        }
        const warmStorm = effect ? setInterval(storm, 15_000) : undefined;
        const warmFrenzy = effect ? setInterval(frenzy, 20_000) : undefined;
        await new Promise((resolve) => setTimeout(resolve, 10_000));
        clearInterval(warmStorm);
        clearInterval(warmFrenzy);
        stormCalls = 0;
        frenzyCalls = 0;
        if (effect) {
          storm();
          frenzy();
        }
        last = performance.now();
        window.game.events.on('postrender', rendered);
        const timers: ReturnType<typeof setInterval>[] = [];
        const collects: ReturnType<typeof setTimeout>[] = [];
        if (effect) {
          timers.push(setInterval(storm, 15_000), setInterval(frenzy, 20_000));
        }
        const spawn = () => {
          const original = Math.random;
          try {
            Math.random = () => (gold ? 0.05 : 0.75);
            scene.spawnCache();
            spawnCalls++;
          } finally {
            Math.random = original;
          }
          collects.push(
            setTimeout(() => {
              const original = Math.random;
              try {
                Math.random = () => 0.75;
                scene.collectCache();
                collectCalls++;
              } finally {
                Math.random = original;
              }
              scene.cacheIn = 1e9;
            }, 5000),
          );
        };
        if (pickup) {
          spawn();
          timers.push(setInterval(spawn, 10_000));
        }
        timers.push(
          setInterval(() => {
            pending = performance.now();
            press(' ', 'Space', 32);
          }, 500),
        );
        timers.push(setInterval(() => press('q', 'KeyQ', 81), 10_000));
        try {
          await new Promise((resolve) => setTimeout(resolve, 60_000));
        } finally {
          for (const timer of timers) clearInterval(timer);
          for (const timer of collects) clearTimeout(timer);
          window.game.events.off('postrender', rendered);
        }
        inputs.sort((a, b) => a - b);
        const canvas = document.querySelector('canvas');
        const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
        const ext = gl?.getExtension('WEBGL_debug_renderer_info');
        return {
          fps: (1000 * frames.length) / frames.reduce((a, b) => a + b, 0),
          responseP95: inputs[Math.ceil(inputs.length * 0.95) - 1],
          samples: inputs.length,
          renderer: ext ? gl?.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unavailable',
          stormCalls,
          frenzyCalls,
          spawnCalls,
          collectCalls,
        };
      }, condition);
      reports.push({ condition, trial, ...metrics });
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
    warmupMs: 10_000,
    measurementMs: 60_000,
    goldSupported,
    reports,
  };
  const output = process.env.PERFORMANCE_OUTPUT ?? 'test-results/performance.json';
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
} finally {
  await browser.close();
}
