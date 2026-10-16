import { expect, type Page } from '@playwright/test';
import type Phaser from 'phaser';
import { clickGame, nextFrame } from './helpers.ts';

export async function clickLabel(page: Page, value: string): Promise<void> {
  const point = await page.evaluate((value) => {
    for (const scene of window.game.scene.getScenes(true).reverse()) {
      const text = scene.children.list.find((child) => (child as Phaser.GameObjects.Text).text === value) as
        | Phaser.GameObjects.Text
        | undefined;
      if (text) {
        const bounds = text.getBounds();
        return { x: bounds.centerX, y: bounds.centerY };
      }
    }
    throw new Error(`表示がありません: ${value}`);
  }, value);
  await clickGame(page, point.x, point.y);
  await nextFrame(page);
}

export async function openSettings(page: Page): Promise<void> {
  await clickLabel(page, 'SETTINGS');
  await expect.poll(() => page.evaluate(() => window.game.scene.isActive('Settings'))).toBe(true);
}

export async function closeSettings(page: Page): Promise<void> {
  await clickLabel(page, 'CLOSE');
  await expect.poll(() => page.evaluate(() => window.game.scene.isActive('Settings'))).toBe(false);
  await nextFrame(page);
}

export async function goTo(page: Page, key: string): Promise<void> {
  await page.evaluate((key) => {
    const owner = window.game.scene.getScenes(true).find((scene) => scene.scene.key !== 'Settings');
    owner?.scene.start(key, key === 'Victory' ? { time: 1, total: 123, clicks: 1 } : undefined);
  }, key);
  await expect.poll(() => page.evaluate((key) => window.game.scene.isActive(key), key)).toBe(true);
  await nextFrame(page);
}

export async function audioState(page: Page) {
  return page.evaluate(() => {
    const manager = window.game.sound as Phaser.Sound.WebAudioSoundManager;
    return {
      ...(window.game.registry.get('run').settings as { bgmEnabled: boolean; sfxEnabled: boolean }),
      musicCount: manager.getAll('music').length,
      musicMuted: (manager.get('music') as Phaser.Sound.WebAudioSound | null)?.mute ?? true,
      playing: manager.get('music')?.isPlaying ?? false,
      locked: manager.locked,
      context: manager.context.state,
    };
  });
}

export async function measureOutput(page: Page, action: () => Promise<void>) {
  await page.evaluate(() => {
    const manager = window.game.sound as Phaser.Sound.WebAudioSoundManager;
    const analyser = manager.context.createAnalyser();
    analyser.fftSize = 256;
    manager.masterVolumeNode.connect(analyser);
    const values = new Float32Array(256);
    let peak = 0;
    const timer = setInterval(() => {
      analyser.getFloatTimeDomainData(values);
      for (const value of values) peak = Math.max(peak, Math.abs(value));
    }, 5);
    Object.assign(window, {
      finishOutput: () => {
        clearInterval(timer);
        manager.masterVolumeNode.disconnect(analyser);
        analyser.disconnect();
        return peak;
      },
    });
  });
  await action();
  await page.waitForTimeout(300);
  return page.evaluate(() => (window as unknown as { finishOutput(): number }).finishOutput());
}
