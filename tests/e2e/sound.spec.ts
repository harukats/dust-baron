import { expect, test } from '@playwright/test';
import { clickGame, fixture, nextFrame, texts, title } from './helpers.ts';
import { audioState, clickLabel, closeSettings, goTo, measureOutput, openSettings } from './settings-helpers.ts';

test.use({ launchOptions: { args: ['--autoplay-policy=document-user-activation-required'] } });
const settingsKey = 'dust-baron-settings-v1';

test('BGMとSFXをそれぞれ10往復し5画面を巡回しても独立設定と一重再生を維持', async ({ page }) => {
  await fixture(page, { scrap: 10000, total: 10000, crowns: 1 });
  await title(page);
  await clickLabel(page, 'CONTINUE');
  const scenes = ['Game', 'Reign', 'Achievements', 'Victory', 'Title'];
  for (let round = 0; round < 10; round++) {
    await goTo(page, scenes[round % scenes.length]);
    await openSettings(page);
    for (const [bgm, sfx] of [
      [false, true],
      [false, false],
      [true, false],
      [true, true],
    ]) {
      const before = await audioState(page);
      if (before.bgmEnabled !== bgm) await clickLabel(page, `BGM: ${before.bgmEnabled ? 'ON' : 'OFF'}`);
      if (before.sfxEnabled !== sfx) await clickLabel(page, `SFX: ${before.sfxEnabled ? 'ON' : 'OFF'}`);
      const state = await audioState(page);
      expect(state.bgmEnabled).toBe(bgm);
      expect(state.sfxEnabled).toBe(sfx);
      expect(state.musicMuted).toBe(!bgm);
      expect(state.musicCount).toBe(1);
      const labels = await texts(page);
      expect(labels).toContain(`BGM: ${bgm ? 'ON' : 'OFF'}`);
      expect(labels).toContain(`SFX: ${sfx ? 'ON' : 'OFF'}`);
    }
    await closeSettings(page);
  }
});

for (const bgm of [true, false]) {
  for (const sfx of [true, false]) {
    test(`実音声信号と再読込: BGM=${bgm}, SFX=${sfx}`, async ({ page }) => {
      await fixture(page, { scrap: 10000, total: 10000 });
      await title(page);
      await clickLabel(page, 'CONTINUE');
      await openSettings(page);
      // 既定ONも一度変更して保存対象にする（未変更の既定値は書き込まない）。
      await clickLabel(page, 'BGM: ON');
      if (bgm) await clickLabel(page, 'BGM: OFF');
      if (!sfx) await clickLabel(page, 'SFX: ON');
      await page.waitForTimeout(150);
      const musicSignal = await measureOutput(page, async () => {});
      if (bgm) expect(musicSignal).toBeGreaterThan(0.0001);
      else expect(musicSignal).toBe(0);
      // 効果音は音楽を一時的に止めて独立に観測する。保存された設定には触れない。
      await page.evaluate(() => window.game.sound.get('music')?.stop());
      await closeSettings(page);
      const signal = await measureOutput(page, () => clickGame(page, 370, 390));
      if (sfx) expect(signal).toBeGreaterThan(0.0001);
      else expect(signal).toBe(0);
      expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), settingsKey)).toEqual({
        bgmEnabled: bgm,
        sfxEnabled: sfx,
      });
      await page.reload();
      await expect.poll(() => page.evaluate(() => window.game?.scene.isActive('Title'))).toBe(true);
      expect(await audioState(page)).toMatchObject({ bgmEnabled: bgm, sfxEnabled: sfx });
      await openSettings(page);
      expect(await texts(page)).toContain(`BGM: ${bgm ? 'ON' : 'OFF'}`);
      expect((await audioState(page)).musicCount).toBeLessThanOrEqual(1);
    });
  }
}

test('再生中のstormとfanfareをOFFで消音しONにしても再実行しない', async ({ page }) => {
  await title(page);
  await clickLabel(page, 'START DIGGING');
  await openSettings(page);
  await clickLabel(page, 'BGM: ON');
  for (const name of ['storm', 'fanfare']) {
    await page.evaluate((name) => {
      const scene = window.game.scene.getScene('Game') as unknown as { sfx: { play(name: string): void } };
      scene.sfx.play(name);
    }, name);
    expect(await measureOutput(page, async () => {})).toBeGreaterThan(0.0001);
    await clickLabel(page, 'SFX: ON');
    await page.waitForTimeout(100);
    expect(await measureOutput(page, async () => {})).toBe(0);
    await clickLabel(page, 'SFX: OFF');
    expect(await measureOutput(page, async () => {})).toBe(0);
  }
});

test('旧OFFを両設定へ引き継ぎNEW RUNでも保持しMキーは両方を切り替える', async ({ page }) => {
  await fixture(page, { scrap: 123, total: 456, pick: 3 });
  await page.addInitScript((key) => localStorage.setItem(key, JSON.stringify({ soundEnabled: false })), settingsKey);
  await title(page);
  expect(await audioState(page)).toMatchObject({ bgmEnabled: false, sfxEnabled: false, playing: false });
  await page.keyboard.press('m');
  await nextFrame(page);
  expect(await audioState(page)).toMatchObject({ bgmEnabled: true, sfxEnabled: true });
  await openSettings(page);
  await clickLabel(page, 'BGM: ON');
  await closeSettings(page);
  await page.keyboard.press('m');
  expect(await audioState(page)).toMatchObject({ bgmEnabled: true, sfxEnabled: true });
  await page.keyboard.press('m');
  await clickLabel(page, 'NEW RUN');
  await clickLabel(page, 'TAP AGAIN TO WIPE SAVE');
  expect(await audioState(page)).toMatchObject({ bgmEnabled: false, sfxEnabled: false });
  expect(await page.evaluate(() => window.game.registry.get('run').state.pick)).toBe(0);
});

test('解除待ちにBGMをOFFにし画面終了後に解除しても再生されない', async ({ page }) => {
  await page.addInitScript(() => {
    const original = AudioContext.prototype.resume;
    const pending: (() => void)[] = [];
    AudioContext.prototype.resume = function () {
      return original.call(this).then(() => new Promise<void>((resolve) => pending.push(resolve)));
    };
    Object.assign(window, {
      releaseUnlocks: () => {
        for (const resolve of pending.splice(0)) resolve();
      },
    });
  });
  await title(page);
  await openSettings(page);
  await clickLabel(page, 'BGM: ON');
  await closeSettings(page);
  await clickLabel(page, 'START DIGGING');
  await page.evaluate(() => (window as unknown as { releaseUnlocks(): void }).releaseUnlocks());
  await expect.poll(async () => (await audioState(page)).locked).toBe(false);
  expect((await audioState(page)).playing).toBe(false);
  await openSettings(page);
  await clickLabel(page, 'BGM: OFF');
  await expect.poll(async () => (await audioState(page)).playing).toBe(true);
  expect((await audioState(page)).musicCount).toBe(1);
});

test('blur/focus後も独立設定と一重再生を維持', async ({ page }) => {
  await title(page);
  await openSettings(page);
  await clickLabel(page, 'SFX: ON');
  await page.evaluate(() => window.game.events.emit('blur'));
  await expect.poll(async () => (await audioState(page)).context).toBe('suspended');
  await page.evaluate(() => window.game.events.emit('focus'));
  await expect.poll(async () => (await audioState(page)).context).toBe('running');
  expect(await audioState(page)).toMatchObject({ bgmEnabled: true, sfxEnabled: false, musicCount: 1 });
});

for (const temporary of [false, true]) {
  test(`pagehide/pageshowは${temporary ? '一時ライブ値' : '保存値'}の独立設定を保持`, async ({ page }) => {
    if (temporary)
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'locks', { value: undefined });
        Object.defineProperty(window, 'localStorage', {
          get() {
            throw new Error('denied');
          },
        });
      });
    await title(page);
    await openSettings(page);
    await clickLabel(page, 'BGM: ON');
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
    await expect(page.locator('canvas')).toHaveCount(0);
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
    await expect.poll(() => page.evaluate(() => window.game?.scene.isActive('Title'))).toBe(true);
    expect(await audioState(page)).toMatchObject({ bgmEnabled: false, sfxEnabled: true });
  });
}

test('自動再生許可環境でタイトルのBGMが一重に再生される', async ({ playwright }) => {
  const browser = await playwright.chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    const page = await browser.newPage({ baseURL: 'http://localhost:8080' });
    await title(page);
    await expect.poll(async () => (await audioState(page)).playing).toBe(true);
    expect((await audioState(page)).musicCount).toBe(1);
  } finally {
    await browser.close();
  }
});
