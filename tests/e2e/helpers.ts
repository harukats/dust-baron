import { expect, type Page } from '@playwright/test';
import type Phaser from 'phaser';
import { SAVE_KEY } from '../../src/config.ts';
import { newState, type State } from '../../src/economy.ts';

declare global {
  interface Window {
    game: Phaser.Game;
    storageCalls: string[];
  }
}
export type TestScene = Phaser.Scene & {
  s: State;
  scrapText: Phaser.GameObjects.Text;
  dig(x: number, y: number): void;
  startStorm(): void;
  stormIn: number;
  cacheIn: number;
};
export async function fixture(page: Page, fields: Partial<State> = {}): Promise<void> {
  await page.addInitScript(
    ({ key, state }) => {
      if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
      if (!sessionStorage.getItem('fixture-installed')) {
        localStorage.setItem(key, JSON.stringify(state));
        sessionStorage.setItem('fixture-installed', '1');
      }
    },
    { key: SAVE_KEY, state: { ...newState(), ...fields } },
  );
}
export async function trackStorage(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.storageCalls = [];
    for (const name of ['getItem', 'setItem', 'removeItem'] as const) {
      const original = Storage.prototype[name];
      Object.defineProperty(Storage.prototype, name, {
        value: function (...args: string[]) {
          window.storageCalls.push(name);
          return Reflect.apply(original, this, args);
        },
      });
    }
  });
}
export async function title(page: Page, url = '/'): Promise<void> {
  await page.goto(url);
  await expect.poll(() => page.evaluate(() => window.game?.scene.isActive('Title')), { timeout: 30_000 }).toBe(true);
}
export async function start(page: Page, url = '/'): Promise<void> {
  await title(page, url);
  await clickGame(page, 640, 510);
  await expect.poll(() => page.evaluate(() => window.game?.scene.isActive('Game'))).toBe(true);
  await page.evaluate(() => {
    const scene = window.game.scene.getScene('Game') as TestScene;
    scene.stormIn = 1e9;
    scene.cacheIn = 1e9;
  });
  await nextFrame(page);
}
export async function state(page: Page): Promise<State> {
  await page.bringToFront();
  await nextFrame(page);
  return page.evaluate(() => (window.game.scene.getScene('Game') as TestScene).s);
}
export async function nextFrame(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => window.game.events.once('postrender', () => resolve())));
}
export async function clickGame(page: Page, x: number, y: number): Promise<void> {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('ゲームキャンバスがありません');
  await page.mouse.click(box.x + (x * box.width) / 1280, box.y + (y * box.height) / 720);
  await nextFrame(page);
}
export async function texts(page: Page): Promise<string[]> {
  await nextFrame(page);
  return page.evaluate(() => {
    const collect = (children: Phaser.GameObjects.GameObject[]): string[] =>
      children.flatMap((child) =>
        child.type === 'Text'
          ? [(child as Phaser.GameObjects.Text).text]
          : child.type === 'Container'
            ? collect((child as Phaser.GameObjects.Container).list)
            : [],
      );
    return window.game.scene.getScenes(true).flatMap((scene) => collect(scene.children.list));
  });
}
