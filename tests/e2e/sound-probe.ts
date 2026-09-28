import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { cpus, release } from 'node:os';
import { dirname } from 'node:path';
import { chromium } from '@playwright/test';
import type Phaser from 'phaser';
import { clickGame, fixture, start, title } from './helpers.ts';

const settingsKey = 'dust-baron-settings-v1';
const browser = await chromium.launch({ headless: false });
const reports = [];
try {
  const scenes = process.env.SOUND_SCENE ? [process.env.SOUND_SCENE] : ['Title', 'Game'];
  for (const sceneName of scenes) {
    for (let trial = 1; trial <= 3; trial++) {
      const context = await browser.newContext({
        baseURL: process.env.SOUND_URL ?? 'http://localhost:8080',
        viewport: { width: 1280, height: 720 },
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();
      await fixture(page, { owned: [0, 0, 0, 0, 0, 0], pick: 3 });
      await page.addInitScript((key) => {
        const calls: { name: string; key: string; at: number }[] = [];
        Object.assign(window, { soundStorageCalls: calls });
        for (const name of ['getItem', 'setItem', 'removeItem'] as const) {
          const original = Storage.prototype[name];
          Object.defineProperty(Storage.prototype, name, {
            value: function (...args: string[]) {
              if (args[0] === key) calls.push({ name, key, at: performance.now() });
              return Reflect.apply(original, this, args);
            },
          });
        }
      }, settingsKey);
      if (sceneName === 'Game') await start(page);
      else {
        await title(page);
        await clickGame(page, 100, 100);
      }
      await page.waitForTimeout(10_000);
      const metrics = await page.evaluate(async (name) => {
        const frames: number[] = [];
        const responses: number[] = [];
        let last = performance.now();
        let pending = 0;
        const rendered = () => {
          const now = performance.now();
          frames.push(now - last);
          last = now;
          if (pending) {
            responses.push(now - pending);
            pending = 0;
          }
        };
        window.game.events.on('postrender', rendered);
        let toggles = 0;
        const input = setInterval(() => {
          if (toggles >= 10) return;
          toggles++;
          pending = performance.now();
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', code: 'KeyM', keyCode: 77 }));
          window.dispatchEvent(new KeyboardEvent('keyup', { key: 'm', code: 'KeyM', keyCode: 77 }));
        }, 5000);
        await new Promise((resolve) => setTimeout(resolve, 60_000));
        clearInterval(input);
        window.game.events.off('postrender', rendered);
        frames.sort((a, b) => a - b);
        responses.sort((a, b) => a - b);
        const calls = (
          window as unknown as {
            soundStorageCalls: { name: string; key: string; at: number }[];
          }
        ).soundStorageCalls;
        const scene = window.game.scene.getScene(name);
        return {
          frameP95: frames[Math.ceil(frames.length * 0.95) - 1],
          fps: (1000 * frames.length) / frames.reduce((a, b) => a + b, 0),
          responseP95: responses[Math.ceil(responses.length * 0.95) - 1],
          responseMax: responses.at(-1),
          samples: responses.length,
          settingsReads: calls.filter((c) => c.name === 'getItem').length,
          settingsWrites: calls.filter((c) => c.name === 'setItem').length,
          musicCount: window.game.sound.getAll('music').length,
          mute: window.game.sound.mute,
          activeScenes: window.game.scene.getScenes(true).map((active) => active.sys.settings.key),
          muteLabel: scene.children.list
            .filter((child) => child.type === 'Text')
            .map((child) => (child as Phaser.GameObjects.Text).text)
            .filter((text) => text.startsWith('SOUND:')),
        };
      }, sceneName);
      reports.push({ sceneName, trial, ...metrics });
      console.log(JSON.stringify(reports.at(-1)));
      await context.close();
    }
  }
  const output = process.env.SOUND_OUTPUT ?? 'test-results/sound-performance.json';
  const report = {
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    os: release(),
    cpu: cpus()[0].model,
    browser: browser.version(),
    viewport: '1280x720',
    dpr: 1,
    reports,
  };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
