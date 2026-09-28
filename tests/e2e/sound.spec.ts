import { expect, type Page, test } from '@playwright/test';
import type Phaser from 'phaser';
import { clickGame, fixture, nextFrame, texts, title } from './helpers.ts';

test.use({ launchOptions: { args: ['--autoplay-policy=document-user-activation-required'] } });

async function pressM(page: Page) {
  await page.keyboard.press('m');
  await nextFrame(page);
}

async function audioState(page: Page) {
  return page.evaluate(() => {
    const sound = window.game.sound as Phaser.Sound.WebAudioSoundManager;
    return {
      mute: sound.mute,
      locked: sound.locked,
      context: sound.context.state,
      musicCount: sound.getAll('music').length,
      playing: sound.get('music')?.isPlaying ?? false,
      gain: sound.masterMuteNode.gain.value,
      enabled: window.game.registry.get('run').settings.soundEnabled,
    };
  });
}

test('タイトルの空白クリックで解除後にBGMが始まる', async ({ page }) => {
  await title(page);
  expect((await audioState(page)).context).toBe('suspended');
  await clickGame(page, 100, 100);
  await expect.poll(async () => (await audioState(page)).playing, { timeout: 1000 }).toBe(true);
  expect(await page.evaluate(() => window.game.scene.isActive('Title'))).toBe(true);
  expect((await audioState(page)).musicCount).toBe(1);
});

for (const input of ['pointer', 'keyboard']) {
  test(`最初の${input}によるOFFを音声解除後も維持しON復帰できる`, async ({ page }) => {
    await title(page);
    if (input === 'pointer') await clickGame(page, 1190, 33);
    else await pressM(page);
    await expect.poll(async () => (await audioState(page)).locked).toBe(false);
    expect((await audioState(page)).mute).toBe(true);
    expect((await audioState(page)).gain).toBe(0);
    expect(await texts(page)).toContain('SOUND:OFF');
    await pressM(page);
    await expect.poll(async () => (await audioState(page)).playing, { timeout: 1000 }).toBe(true);
    expect((await audioState(page)).gain).toBe(1);
    expect((await audioState(page)).musicCount).toBe(1);
  });
}

test('タイトルでボタンとMを10回切り替えても一重再生とSE抑止', async ({ page }) => {
  await fixture(page, { pick: 3 });
  await title(page);
  await clickGame(page, 100, 100);
  await expect.poll(async () => (await audioState(page)).context).toBe('running');
  await page.evaluate(() => {
    const ctx = (window.game.sound as Phaser.Sound.WebAudioSoundManager).context;
    const original = ctx.createOscillator.bind(ctx);
    let count = 0;
    ctx.createOscillator = () => {
      count++;
      return original();
    };
    Object.assign(window, { oscillatorCount: () => count });
  });
  const voices = () => page.evaluate(() => (window as unknown as { oscillatorCount(): number }).oscillatorCount());
  for (let i = 0; i < 10; i++) {
    if (i % 2 === 0) await clickGame(page, 1190, 33);
    else await pressM(page);
    const off = i % 2 === 0;
    expect((await audioState(page)).mute).toBe(off);
    expect(await texts(page)).toContain(off ? 'SOUND:OFF' : 'SOUND:ON');
    expect((await audioState(page)).musicCount).toBe(1);
  }
  await pressM(page);
  const before = await voices();
  await clickGame(page, 640, 625);
  expect(await voices()).toBe(before);
  await pressM(page);
  // 確認ボタンの2回目は開始するため、Titleを再起動して1回目のSEを検証する。
  await page.evaluate(() => window.game.scene.getScene('Title').scene.restart());
  await expect.poll(() => page.evaluate(() => window.game.scene.isActive('Title'))).toBe(true);
  await clickGame(page, 640, 625);
  expect(await voices()).toBeGreaterThan(before);
});

async function enterGame(page: Page) {
  await clickGame(page, 640, 510);
  await expect.poll(() => page.evaluate(() => window.game.scene.isActive('Game'))).toBe(true);
}

async function goTo(page: Page, target: string) {
  await page.evaluate((target) => {
    const active = window.game.scene.getScenes(true)[0];
    active.scene.start(target, target === 'Victory' ? { time: 1, total: 123, clicks: 1 } : undefined);
  }, target);
  await expect.poll(() => page.evaluate((target) => window.game.scene.isActive(target), target)).toBe(true);
}

for (const enabled of [true, false]) {
  test(`開始・Game・Victory・Titleで設定${enabled}を引き継ぐ`, async ({ page }) => {
    await fixture(page, { pick: 3 });
    await title(page);
    if (!enabled) await pressM(page);
    await enterGame(page);
    await expect.poll(async () => (await audioState(page)).locked).toBe(false);
    expect((await audioState(page)).mute).toBe(!enabled);
    for (let i = 0; i < 10; i++) {
      if (i % 2 === 0) await clickGame(page, 398, 110);
      else await pressM(page);
      expect((await audioState(page)).mute).toBe(i % 2 === 0 ? enabled : !enabled);
    }
    await goTo(page, 'Victory');
    expect((await audioState(page)).mute).toBe(!enabled);
    await page.waitForTimeout(850);
    await clickGame(page, 1190, 33);
    expect(await page.evaluate(() => window.game.scene.isActive('Victory'))).toBe(true);
    expect((await audioState(page)).mute).toBe(enabled);
    await goTo(page, 'Game');
    await goTo(page, 'Title');
    expect((await audioState(page)).mute).toBe(enabled);
    expect(await texts(page)).toContain(enabled ? 'SOUND:OFF' : 'SOUND:ON');
    expect((await audioState(page)).musicCount).toBeLessThanOrEqual(1);
  });
}

test('最初のSPACEで遷移してもGameで解除後にBGM開始', async ({ page }) => {
  await title(page);
  await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => window.game.scene.isActive('Game'))).toBe(true);
  await expect.poll(async () => (await audioState(page)).playing, { timeout: 1000 }).toBe(true);
  expect((await audioState(page)).musicCount).toBe(1);
});

test('シーン20周でもBGMと解除・Mキー購読が増えない', async ({ page }) => {
  await title(page);
  await enterGame(page);
  for (let i = 0; i < 20; i++) {
    for (const target of ['Victory', 'Game', 'Title']) {
      await goTo(page, target);
      const before = (await audioState(page)).mute;
      await pressM(page);
      expect((await audioState(page)).mute).toBe(!before);
      expect((await audioState(page)).musicCount).toBe(1);
      expect(await page.evaluate(() => window.game.sound.listenerCount('unlocked'))).toBe(0);
    }
    await enterGame(page);
  }
});

const settingsKey = 'dust-baron-settings-v1';
async function settingsFixture(page: Page, enabled: boolean) {
  await page.addInitScript(
    ({ key, enabled }) => {
      if (location.protocol !== 'http:') return;
      if (!sessionStorage.getItem('sound-fixture')) {
        localStorage.setItem(key, JSON.stringify({ soundEnabled: enabled }));
        sessionStorage.setItem('sound-fixture', '1');
      }
    },
    { key: settingsKey, enabled },
  );
}

for (const scene of ['Title', 'Game']) {
  for (const enabled of [true, false]) {
    test(`${scene}で${enabled}へ変更直後の再読込で復元`, async ({ page }) => {
      await fixture(page, { scrap: 123, total: 456, pick: 3 });
      await settingsFixture(page, !enabled);
      await title(page);
      if (scene === 'Game') await enterGame(page);
      await pressM(page);
      expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), settingsKey)).toEqual({
        soundEnabled: enabled,
      });
      await page.reload();
      await expect.poll(() => page.evaluate(() => window.game?.scene.isActive('Title'))).toBe(true);
      expect((await audioState(page)).enabled).toBe(enabled);
      expect(await texts(page)).toContain(enabled ? 'SOUND:ON' : 'SOUND:OFF');
      if (!enabled) {
        // suspended中のAudioParam.valueは変更前の値を返すことがある。
        // 発音前はライブ設定と音源未開始、解除後は実際のgainを確認する。
        expect((await audioState(page)).playing).toBe(false);
        expect((await audioState(page)).musicCount).toBe(0);
        await clickGame(page, 100, 100);
        await expect.poll(async () => (await audioState(page)).locked).toBe(false);
        expect((await audioState(page)).gain).toBe(0);
      }
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('dust-baron-save-v1') ?? '{}'));
      expect(saved.scrap).toBe(123);
      expect(saved.total).toBe(456);
      expect(saved.pick).toBe(3);
    });
  }
}

test('NEW RUNは進行のみリセットし保存済みOFF維持', async ({ page }) => {
  await fixture(page, { scrap: 123, total: 456, pick: 3 });
  await settingsFixture(page, false);
  await title(page);
  await clickGame(page, 640, 625);
  await clickGame(page, 640, 625);
  await expect.poll(() => page.evaluate(() => window.game.scene.isActive('Game'))).toBe(true);
  expect((await audioState(page)).mute).toBe(true);
  expect(await page.evaluate(() => window.game.registry.get('run').state.pick)).toBe(0);
  await page.reload();
  await expect.poll(() => page.evaluate(() => window.game?.scene.isActive('Title'))).toBe(true);
  expect((await audioState(page)).enabled).toBe(false);
  expect((await audioState(page)).playing).toBe(false);
  await clickGame(page, 100, 100);
  await expect.poll(async () => (await audioState(page)).locked).toBe(false);
  expect((await audioState(page)).gain).toBe(0);
});

for (const temporary of [false, true]) {
  test(`pagehide/pageshowで${temporary ? '一時ライブ値' : '所有者の保存値'}を復元`, async ({ page }) => {
    if (temporary) {
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'locks', { value: undefined });
        Object.defineProperty(window, 'localStorage', {
          get() {
            throw new Error('共有保存禁止');
          },
        });
      });
    }
    await title(page);
    await pressM(page);
    expect((await audioState(page)).mute).toBe(true);
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
    await expect(page.locator('canvas')).toHaveCount(0);
    if (!temporary) {
      // 保存値を読み直すことを確認するため、停止中に値を変更する。
      await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({ soundEnabled: true })), settingsKey);
    }
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
    await expect.poll(() => page.evaluate(() => window.game?.scene.isActive('Title'))).toBe(true);
    expect((await audioState(page)).mute).toBe(temporary);
    if (temporary) {
      await page.reload();
      await expect.poll(() => page.evaluate(() => window.game?.scene.isActive('Title'))).toBe(true);
      expect((await audioState(page)).mute).toBe(false);
    }
  });
}

for (const failure of ['get', 'set']) {
  test(`保存${failure}失敗でもライブ設定と進行を維持`, async ({ page }) => {
    await page.addInitScript((failure) => {
      if (failure === 'get') {
        Object.defineProperty(window, 'localStorage', {
          get() {
            throw new Error('denied');
          },
        });
      } else {
        Storage.prototype.setItem = () => {
          throw new Error('quota');
        };
      }
    }, failure);
    await title(page);
    await pressM(page);
    await enterGame(page);
    expect((await audioState(page)).mute).toBe(true);
    await page.keyboard.press('Space');
    expect(await page.evaluate(() => window.game.registry.get('run').state.clicks)).toBe(1);
    await goTo(page, 'Title');
    expect((await audioState(page)).mute).toBe(true);
  });
}

test('設定はbootで1回読込・切替ごと1回保存・遷移では保存しない', async ({ page }) => {
  await page.addInitScript((key) => {
    const calls: string[] = [];
    Object.assign(window, { settingsCalls: calls });
    for (const name of ['getItem', 'setItem'] as const) {
      const original = Storage.prototype[name];
      Object.defineProperty(Storage.prototype, name, {
        value: function (...args: string[]) {
          if (args[0] === key) calls.push(name);
          return Reflect.apply(original, this, args);
        },
      });
    }
  }, settingsKey);
  const calls = () => page.evaluate(() => (window as unknown as { settingsCalls: string[] }).settingsCalls);
  await title(page);
  expect(await calls()).toEqual(['getItem']);
  for (let i = 0; i < 10; i++) await pressM(page);
  expect((await calls()).filter((name) => name === 'setItem')).toHaveLength(10);
  await enterGame(page);
  await goTo(page, 'Victory');
  await goTo(page, 'Game');
  await goTo(page, 'Title');
  await page.waitForTimeout(1000);
  expect(await calls()).toHaveLength(11);
});

async function measureOutput(page: Page, action: () => Promise<void>) {
  await page.evaluate(() => {
    const manager = window.game.sound as Phaser.Sound.WebAudioSoundManager;
    const analyser = manager.context.createAnalyser();
    analyser.fftSize = 256;
    manager.masterVolumeNode.connect(analyser);
    const values = new Float32Array(256);
    let peak = 0;
    const sample = setInterval(() => {
      analyser.getFloatTimeDomainData(values);
      for (const value of values) peak = Math.max(peak, Math.abs(value));
    }, 5);
    Object.assign(window, {
      finishOutput: () => {
        clearInterval(sample);
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

test('BGMと確認SEの実音声信号がONで出力されOFFで無音になる', async ({ page }) => {
  await fixture(page, { pick: 3 });
  await title(page);
  await clickGame(page, 100, 100);
  await expect.poll(async () => (await audioState(page)).playing).toBe(true);
  expect(await measureOutput(page, async () => {})).toBeGreaterThan(0.0001);
  await pressM(page);
  await page.waitForTimeout(100);
  expect(await measureOutput(page, async () => {})).toBe(0);
  await page.evaluate(() => window.game.sound.get('music')?.stop());
  await pressM(page);
  await page.evaluate(() => window.game.sound.get('music')?.stop());
  expect(await measureOutput(page, () => clickGame(page, 640, 625))).toBeGreaterThan(0.0001);
  await pressM(page);
  // タイトル再起動で確認ボタンを再び1回目に戻す。
  await page.evaluate(() => window.game.scene.getScene('Title').scene.restart());
  await page.waitForTimeout(100);
  expect(await measureOutput(page, () => clickGame(page, 640, 625))).toBe(0);
});

test('解除完了を遅らせてTitle終了後のGameへ待ちを引き継ぐ', async ({ page }) => {
  await page.addInitScript(() => {
    const original = AudioContext.prototype.resume;
    const pending: (() => void)[] = [];
    AudioContext.prototype.resume = function () {
      return original.call(this).then(() => new Promise<void>((resolve) => pending.push(resolve)));
    };
    Object.assign(window, {
      pendingUnlocks: () => pending.length,
      releaseUnlocks: () => {
        for (const resolve of pending.splice(0)) resolve();
      },
    });
  });
  await title(page);
  expect((await audioState(page)).locked).toBe(true);
  await enterGame(page);
  expect((await audioState(page)).playing).toBe(false);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { pendingUnlocks(): number }).pendingUnlocks()))
    .toBeGreaterThan(0);
  expect(await page.evaluate(() => window.game.sound.listenerCount('unlocked'))).toBe(1);
  await page.evaluate(() => (window as unknown as { releaseUnlocks(): void }).releaseUnlocks());
  await expect.poll(async () => (await audioState(page)).playing, { timeout: 1000 }).toBe(true);
  expect(await page.evaluate(() => window.game.sound.listenerCount('unlocked'))).toBe(0);
});

test('自動再生を許可した環境ではタイトル表示だけでBGMが流れる', async ({ playwright }) => {
  const browser = await playwright.chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    const page = await browser.newPage({ baseURL: 'http://localhost:8080', viewport: { width: 1280, height: 720 } });
    await title(page);
    expect((await audioState(page)).context).toBe('running');
    expect((await audioState(page)).playing).toBe(true);
    expect((await audioState(page)).musicCount).toBe(1);
  } finally {
    await browser.close();
  }
});

test('Gameの採掘・購入失敗・Victoryで音声信号と設定が一致', async ({ page }) => {
  await title(page);
  await clickGame(page, 100, 100);
  await enterGame(page);
  await page.evaluate(() => window.game.sound.get('music')?.stop());
  expect(await measureOutput(page, () => clickGame(page, 370, 390))).toBeGreaterThan(0.0001);
  expect(await measureOutput(page, () => clickGame(page, 1000, 183))).toBeGreaterThan(0.0001);
  await pressM(page);
  await page.waitForTimeout(100);
  expect(await measureOutput(page, () => clickGame(page, 370, 390))).toBe(0);
  expect(await measureOutput(page, () => clickGame(page, 1000, 183))).toBe(0);
  expect(await measureOutput(page, () => goTo(page, 'Victory'))).toBe(0);
  await pressM(page);
  expect(await measureOutput(page, async () => {})).toBeGreaterThan(0.0001);
});

test('Phaserのblur/focus後もBGMと音声設定を維持', async ({ page }) => {
  await title(page);
  await clickGame(page, 100, 100);
  await enterGame(page);
  await expect.poll(async () => (await audioState(page)).playing).toBe(true);
  // headlessのタブ操作はblurを発火しないため、同じPhaserイベント経路を検証する。
  await page.evaluate(() => window.game.events.emit('blur'));
  await expect.poll(async () => (await audioState(page)).context).toBe('suspended');
  await page.evaluate(() => window.game.events.emit('focus'));
  await expect.poll(async () => (await audioState(page)).context).toBe('running');
  expect((await audioState(page)).musicCount).toBe(1);
  expect((await audioState(page)).playing).toBe(true);
  expect((await audioState(page)).enabled).toBe(true);
  expect(await measureOutput(page, async () => {})).toBeGreaterThan(0.0001);
});
