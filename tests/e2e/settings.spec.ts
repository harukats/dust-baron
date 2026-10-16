import { expect, test } from '@playwright/test';
import { clickGame, fixture, nextFrame, start, type TestScene, texts, title } from './helpers.ts';
import { audioState, clickLabel, closeSettings, goTo, openSettings } from './settings-helpers.ts';

const owners = ['Title', 'Game', 'Reign', 'Achievements', 'Victory'];
for (const owner of owners) {
  test(`${owner}: 10回開閉、背景入力遮断、親の状態と購読を維持`, async ({ page }) => {
    await fixture(page, { scrap: 10000, total: 10000, crowns: 1 });
    await start(page);
    await goTo(page, owner);
    await page.waitForTimeout(850);
    const counts = () =>
      page.evaluate((owner) => {
        const scene = window.game.scene.getScene(owner);
        return {
          shutdown: scene.events.listenerCount('shutdown'),
          space: scene.input.keyboard?.listenerCount('keydown-SPACE'),
          mute: scene.input.keyboard?.listenerCount('keydown-M'),
          music: window.game.sound.getAll('music').length,
          fullscreen: window.game.scale.listenerCount('enterfullscreen'),
        };
      }, owner);
    // 音声解除待ちを完了させてから購読数を比較する。
    await clickGame(page, 20, 700);
    if (owner === 'Victory') await goTo(page, owner);
    await page.waitForTimeout(850);
    if (owner === 'Victory') {
      await expect.poll(async () => (await counts()).space).toBe(1);
    }
    const before = await counts();
    for (let round = 0; round < 10; round++) {
      const runBefore = await page.evaluate(() => {
        const run = window.game.registry.get('run');
        return { clicks: run.state.clicks, crowns: run.state.crowns, settings: { ...run.settings } };
      });
      await openSettings(page);
      await clickGame(page, 370, 390);
      await page.keyboard.press('Space');
      await page.keyboard.press('Enter');
      await page.keyboard.press('q');
      await page.keyboard.press('m');
      expect(await page.evaluate(() => window.game.registry.get('run').state.clicks)).toBe(runBefore.clicks);
      expect(await page.evaluate(() => window.game.registry.get('run').state.crowns)).toBe(runBefore.crowns);
      expect(await audioState(page)).toMatchObject(runBefore.settings);
      if (round % 2) {
        await page.keyboard.press('Escape');
        await expect.poll(() => page.evaluate(() => window.game.scene.isActive('Settings'))).toBe(false);
        await nextFrame(page);
      } else await closeSettings(page);
      expect(await page.evaluate((owner) => window.game.scene.isActive(owner), owner)).toBe(true);
    }
    expect(await counts()).toEqual(before);
    expect(await page.evaluate(() => window.game.scene.getScene('Settings').children.length)).toBe(0);
  });
}

test('Settings中も生産・効果時間が進み、通常開閉で親を再作成しない', async ({ page }) => {
  await fixture(page, { owned: [4, 0, 0, 0, 0, 0] });
  await start(page);
  await page.evaluate(() => {
    const run = window.game.registry.get('run');
    const game = window.game.scene.getScene('Game') as TestScene;
    game.startStorm();
    run.frenzyMult = 777;
    run.frenzyEndsAtMs = run.now() + 20000;
    Object.assign(window, { originalState: run.state });
  });
  const before = await page.evaluate(() => window.game.registry.get('run').state.scrap);
  await openSettings(page);
  await page.waitForTimeout(1000);
  await closeSettings(page);
  expect(await page.evaluate(() => window.game.registry.get('run').state.scrap)).toBeGreaterThan(before);
  expect(
    await page.evaluate(() => {
      const run = window.game.registry.get('run');
      return run.state === (window as unknown as { originalState: unknown }).originalState && run.frenzyMult === 777;
    }),
  ).toBe(true);
});

test('設定中から押し続けたSpace/Enterのリピートで開始しない', async ({ page }) => {
  await title(page);
  await openSettings(page);
  await page.keyboard.down('Space');
  await page.keyboard.down('Enter');
  await closeSettings(page);
  await page.keyboard.down('Space');
  await page.keyboard.down('Enter');
  await nextFrame(page);
  expect(await page.evaluate(() => window.game.scene.isActive('Title'))).toBe(true);
  await page.keyboard.up('Space');
  await page.keyboard.up('Enter');
  await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => window.game.scene.isActive('Game'))).toBe(true);
});

for (const owner of owners) {
  test(`${owner}: タイトル復帰とCONTINUEで同じランを保持`, async ({ page }) => {
    await fixture(page, { scrap: 12345, total: 20000, owned: [4, 0, 0, 0, 0, 0], crowns: 1, clicks: 123 });
    await start(page);
    await goTo(page, owner);
    await openSettings(page);
    const before = await page.evaluate(() => {
      const run = window.game.registry.get('run');
      const now = run.now();
      run.now = () => now;
      Object.assign(window, { originalState: run.state });
      return {
        owned: [...run.state.owned],
        crowns: run.state.crowns,
        clicks: run.state.clicks,
        reigns: run.state.reigns,
      };
    });
    await clickLabel(page, 'RETURN TO TITLE');
    await expect.poll(() => page.evaluate(() => window.game.scene.isActive('Title'))).toBe(true);
    await expect.poll(() => page.evaluate(() => window.game.scene.isActive('Settings'))).toBe(false);
    await clickLabel(page, 'CONTINUE');
    await expect.poll(() => page.evaluate(() => window.game.scene.isActive('Game'))).toBe(true);
    expect(
      await page.evaluate(() => {
        const run = window.game.registry.get('run');
        return {
          owned: [...run.state.owned],
          crowns: run.state.crowns,
          clicks: run.state.clicks,
          reigns: run.state.reigns,
        };
      }),
    ).toEqual(before);
    expect(
      await page.evaluate(
        () => window.game.registry.get('run').state === (window as unknown as { originalState: unknown }).originalState,
      ),
    ).toBe(true);
  });
}

for (const failure of ['read', 'write']) {
  test(`${failure}失敗でも独立音声・タイトル復帰・CONTINUEが可能`, async ({ page }) => {
    await page.addInitScript((failure) => {
      if (failure === 'read') {
        Object.defineProperty(navigator, 'locks', { value: undefined });
        Object.defineProperty(window, 'localStorage', {
          get() {
            throw new Error('denied');
          },
        });
      } else
        Storage.prototype.setItem = () => {
          throw new Error('quota');
        };
    }, failure);
    await start(page);
    await page.keyboard.press('Space');
    await openSettings(page);
    await clickLabel(page, 'BGM: ON');
    await clickLabel(page, 'SFX: ON');
    await clickLabel(page, 'RETURN TO TITLE');
    await clickLabel(page, 'CONTINUE');
    expect(await audioState(page)).toMatchObject({ bgmEnabled: false, sfxEnabled: false });
    expect(await page.evaluate(() => window.game.registry.get('run').state.clicks)).toBe(1);
  });
}

test('標準全画面の10往復、環境側解除、縮小表示と入力位置', async ({ page }) => {
  await title(page);
  await openSettings(page);
  const available = await page.evaluate(() => document.fullscreenEnabled);
  if (!available) {
    expect(await texts(page)).toContain('FULLSCREEN: UNAVAILABLE');
    await closeSettings(page);
    return;
  }
  for (let round = 0; round < 10; round++) {
    await clickLabel(page, 'FULLSCREEN: OFF');
    await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id)).toBe('game-container');
    await expect.poll(async () => (await texts(page)).includes('FULLSCREEN: ON')).toBe(true);
    if (round % 2) await page.evaluate(() => document.exitFullscreen());
    else await clickLabel(page, 'FULLSCREEN: ON');
    await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
    await expect.poll(async () => (await texts(page)).includes('FULLSCREEN: OFF')).toBe(true);
  }
  for (const size of [
    { width: 960, height: 540 },
    { width: 540, height: 960 },
    { width: 1280, height: 720 },
  ]) {
    await page.setViewportSize(size);
    await page.waitForTimeout(100);
    const box = await page.locator('canvas').boundingBox();
    expect(box).toBeTruthy();
    expect((box?.width ?? 0) / (box?.height ?? 1)).toBeCloseTo(1280 / 720, 1);
    await clickLabel(page, 'BGM: ON');
    await clickLabel(page, 'BGM: OFF');
  }
  await page.screenshot({ path: 'test-results/settings.png' });
});

for (const mode of ['unsupported', 'throw', 'reject']) {
  test(`全画面${mode}でも状態を偽らず他の設定と復帰が可能`, async ({ page }) => {
    await title(page);
    await page.evaluate((mode) => {
      if (mode === 'unsupported')
        Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: false });
      else {
        const target = document.getElementById('game-container');
        if (!target) throw new Error('Game container missing');
        target.requestFullscreen = () => {
          if (mode === 'throw') throw new Error('denied');
          return Promise.reject(new Error('denied'));
        };
      }
    }, mode);
    await openSettings(page);
    if (mode === 'unsupported') expect(await texts(page)).toContain('FULLSCREEN: UNAVAILABLE');
    else {
      await clickLabel(page, 'FULLSCREEN: OFF');
      await expect.poll(async () => (await texts(page)).includes('FULLSCREEN CHANGE FAILED')).toBe(true);
      expect(await texts(page)).toContain('FULLSCREEN: OFF');
    }
    await clickLabel(page, 'SFX: ON');
    await clickLabel(page, 'RETURN TO TITLE');
    expect(await page.evaluate(() => window.game.scene.isActive('Title'))).toBe(true);
  });
}

test('要求中に閉じて再表示し古いPromiseが現在の画面を変更しない', async ({ page }) => {
  await title(page);
  await page.evaluate(() => {
    const target = document.getElementById('game-container');
    if (!target) throw new Error('Game container missing');
    target.requestFullscreen = () =>
      new Promise((_resolve, reject) => {
        Object.assign(window, { rejectFullscreen: () => reject(new Error('late')) });
      });
  });
  await openSettings(page);
  await clickLabel(page, 'FULLSCREEN: OFF');
  await closeSettings(page);
  await openSettings(page);
  await page.evaluate(() => (window as unknown as { rejectFullscreen(): void }).rejectFullscreen());
  await nextFrame(page);
  expect(await texts(page)).not.toContain('FULLSCREEN CHANGE FAILED');
  await closeSettings(page);
});

test('設定はboot時の読取と変更時の保存のみ、アイドル・開閉でアクセスしない', async ({ page }) => {
  await page.addInitScript(() => {
    const calls: string[] = [];
    Object.assign(window, { settingsCalls: calls });
    for (const name of ['getItem', 'setItem'] as const) {
      const original = Storage.prototype[name];
      Object.defineProperty(Storage.prototype, name, {
        value: function (...args: string[]) {
          if (args[0] === 'dust-baron-settings-v1') calls.push(name);
          return Reflect.apply(original, this, args);
        },
      });
    }
  });
  await title(page);
  for (let i = 0; i < 10; i++) {
    await openSettings(page);
    await closeSettings(page);
  }
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => (window as unknown as { settingsCalls: string[] }).settingsCalls)).toEqual([
    'getItem',
  ]);
  await openSettings(page);
  await clickLabel(page, 'BGM: ON');
  expect(await page.evaluate(() => (window as unknown as { settingsCalls: string[] }).settingsCalls)).toEqual([
    'getItem',
    'setItem',
  ]);
});

test('要求中のタイトル復帰で古い結果を次のSettingsへ渡さない', async ({ page }) => {
  await start(page);
  await page.evaluate(() => {
    const target = document.getElementById('game-container');
    if (!target) throw new Error('Game container missing');
    target.requestFullscreen = () =>
      new Promise((_resolve, reject) => {
        Object.assign(window, { rejectFullscreen: () => reject(new Error('late')) });
      });
  });
  await openSettings(page);
  await clickLabel(page, 'FULLSCREEN: OFF');
  await clickLabel(page, 'RETURN TO TITLE');
  await expect.poll(() => page.evaluate(() => window.game.scene.isActive('Title'))).toBe(true);
  await openSettings(page);
  await page.evaluate(() => (window as unknown as { rejectFullscreen(): void }).rejectFullscreen());
  await nextFrame(page);
  expect(await texts(page)).not.toContain('FULLSCREEN CHANGE FAILED');
  await closeSettings(page);
});

test('親のshutdownとゲーム破棄でSettingsも終了する', async ({ page }) => {
  await start(page);
  await openSettings(page);
  await page.evaluate(() => window.game.scene.getScene('Game').scene.start('Title'));
  await expect.poll(() => page.evaluate(() => window.game.scene.isActive('Settings'))).toBe(false);
  await openSettings(page);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
  await expect(page.locator('canvas')).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await expect.poll(() => page.evaluate(() => window.game?.scene.isActive('Title'))).toBe(true);
  await openSettings(page);
  await closeSettings(page);
});

test('全画面中もEscapeでSettingsを閉じ、環境側解除後の表示を同期できる', async ({ page }) => {
  await title(page);
  await openSettings(page);
  if (!(await page.evaluate(() => document.fullscreenEnabled))) {
    expect(await texts(page)).toContain('FULLSCREEN: UNAVAILABLE');
    return;
  }
  await clickLabel(page, 'FULLSCREEN: OFF');
  await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
  await page.keyboard.press('Escape');
  // PlaywrightのEscapeはOSの予約キー操作を再現しない。アプリに届く場合の閉じる動作を確認する。
  if (await page.evaluate(() => window.game.scene.isActive('Settings'))) await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => window.game.scene.isActive('Settings'))).toBe(false);
  expect(await page.evaluate(() => window.game.scene.isActive('Title'))).toBe(true);
  if (await page.evaluate(() => document.fullscreenElement !== null))
    await page.evaluate(() => document.exitFullscreen());
  await openSettings(page);
  expect(await texts(page)).toContain('FULLSCREEN: OFF');
  await closeSettings(page);
});
