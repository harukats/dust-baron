import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { cpus, release } from 'node:os';
import { dirname } from 'node:path';
import { chromium } from '@playwright/test';
import type Phaser from 'phaser';
import { fixture, start, type TestScene } from './helpers.ts';
import { closeSettings, openSettings } from './settings-helpers.ts';

type ProbeScene = TestScene & { spawnCache(): void; collectCache(): void };
// 同じスケジュールを変更前後で実行する。gold対応の有無だけ自動判別する。
const browser = await chromium.launch({ headless: false });
const reports = [];
try {
  const probeContext = await browser.newContext();
  const probePage = await probeContext.newPage();
  await start(probePage, 'http://localhost:8080');
  const goldSupported = await probePage.evaluate(() => window.game.textures.exists('gold-cache'));
  const settingsSupported = await probePage.evaluate(() =>
    window.game.scene.getScenes(false).some((scene) => scene.scene.key === 'Settings'),
  );
  await probeContext.close();
  const conditions = [
    'normal',
    'chrome',
    'chrome-pickup',
    ...(goldSupported ? ['gold', 'gold-pickup'] : []),
    ...(settingsSupported ? ['normal:settings', 'chrome:settings', 'normal:after10', 'chrome:after10'] : []),
  ];
  const selectedConditions = process.env.PERFORMANCE_CONDITIONS?.split(',') ?? conditions;
  for (const condition of selectedConditions) {
    for (let trial = 1; trial <= 3; trial++) {
      const context = await browser.newContext({
        baseURL: 'http://localhost:8080',
        viewport: { width: 1280, height: 720 },
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();
      await fixture(page, { owned: [25, 25, 25, 25, 25, 25], pick: 3 });
      await start(page);
      if (condition.endsWith(':after10')) {
        for (let cycle = 0; cycle < 10; cycle++) {
          await openSettings(page);
          await closeSettings(page);
        }
      }
      if (condition.endsWith(':settings')) await openSettings(page);
      const metrics = await page.evaluate(async (scenario) => {
        const [condition, modal] = scenario.split(':');
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
        let settingsChanges = 0;
        let previousBgm = run.settings.bgmEnabled;
        let last = 0,
          pending = 0;
        const rendered = () => {
          const now = performance.now();
          if (modal === 'settings' && previousBgm !== run.settings.bgmEnabled) {
            settingsChanges++;
            previousBgm = run.settings.bgmEnabled;
          }
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
            if (modal === 'settings') {
              const settings = window.game.scene.getScene('Settings');
              const text = settings.children.list.find((child) =>
                (child as Phaser.GameObjects.Text).text?.startsWith('BGM:'),
              ) as Phaser.GameObjects.Text;
              const bounds = text.getBounds();
              const canvas = window.game.canvas;
              const box = canvas.getBoundingClientRect();
              const clientX = box.x + (bounds.centerX * box.width) / 1280;
              const clientY = box.y + (bounds.centerY * box.height) / 720;
              canvas.dispatchEvent(
                new MouseEvent('mousedown', { bubbles: true, clientX, clientY, button: 0, buttons: 1 }),
              );
              canvas.dispatchEvent(
                new MouseEvent('mouseup', { bubbles: true, clientX, clientY, button: 0, buttons: 0 }),
              );
            } else press(' ', 'Space', 32);
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
        const sortedFrames = [...frames].sort((a, b) => a - b);
        const canvas = document.querySelector('canvas');
        const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
        const ext = gl?.getExtension('WEBGL_debug_renderer_info');
        return {
          fps: (1000 * frames.length) / frames.reduce((a, b) => a + b, 0),
          frameP95: sortedFrames[Math.ceil(sortedFrames.length * 0.95) - 1],
          responseP95: inputs[Math.ceil(inputs.length * 0.95) - 1],
          samples: inputs.length,
          settingsChanges,
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
    settingsSupported,
    reports,
  };
  const output = process.env.PERFORMANCE_OUTPUT ?? 'test-results/performance.json';
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
} finally {
  await browser.close();
}
