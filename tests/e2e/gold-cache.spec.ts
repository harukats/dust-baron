import { expect, test } from '@playwright/test';
import type Phaser from 'phaser';
import {
  clickGame,
  collectCache,
  fixture,
  freezeClock,
  nextFrame,
  setClock,
  spawnCache,
  start,
  state,
  type TestScene,
  texts,
} from './helpers.ts';

for (const width of [1280, 960]) {
  test(`ゴールド専用画像・クリック/SPACE777倍・HUD・終了 ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: (width * 720) / 1280 });
    await start(page);
    const now = await freezeClock(page);
    await spawnCache(page, 'gold');
    const pickup = await page.evaluate(() => {
      const scene = window.game.scene.getScene('Game') as TestScene;
      const c = scene.cachePickup;
      return {
        key: c?.texture.key,
        x: c?.x ?? 0,
        y: c?.y ?? 0,
        width: c?.displayWidth ?? 0,
        height: c?.displayHeight ?? 0,
        label: scene.cacheLabel?.text,
        kind: scene.cacheKind,
        filter: c?.texture.source[0].scaleMode,
      };
    });
    expect(pickup.key).toBe('gold-cache');
    expect(pickup.kind).toBe('gold');
    expect(pickup.label).toBe('GOLD CACHE');
    expect(Math.max(pickup.width, pickup.height)).toBeCloseTo(96);
    expect(pickup.filter).toBe(1); // Phaser FilterMode.NEAREST
    await page.screenshot({ path: `test-results/gold-cache-${width}.png` });
    await clickGame(page, pickup.x + 45, pickup.y - 45);
    expect(await page.evaluate(() => (window.game.scene.getScene('Game') as TestScene).cacheKind)).toBe('gold');
    await clickGame(page, pickup.x, pickup.y);
    expect((await texts(page)).join(' ')).toContain('GOLD FRENZY!');
    expect((await texts(page)).join(' ')).toContain('FRENZY x777 20s');
    await page.screenshot({ path: `test-results/gold-frenzy-${width}.png` });
    await clickGame(page, 370, 390);
    expect((await state(page)).scrap).toBe(777);
    await page.keyboard.press('Space');
    expect((await state(page)).scrap).toBe(1554);
    await collectCache(page); // 回収済み対象に再操作
    expect((await state(page)).scrap).toBe(1554);
    await setClock(page, now + 19_999);
    await page.keyboard.press('Space');
    expect((await state(page)).scrap).toBe(2331);
    await setClock(page, now + 20_000);
    await page.keyboard.press('Space');
    expect((await state(page)).scrap).toBe(2332);
    expect((await texts(page)).join(' ')).not.toContain('FRENZY x777');
    expect(await page.evaluate(() => (window.game.scene.getScene('Game') as TestScene).cacheLabel)).toBeNull();
  });
}

test('未回収10秒・期限ちょうどの操作・最大1個・出現待ち範囲', async ({ page }) => {
  await start(page);
  await page.evaluate(() => {
    const scene = window.game.scene.getScene('Game') as TestScene;
    scene.scene.restart();
  });
  await nextFrame(page);
  const firstWait = await page.evaluate(() => (window.game.scene.getScene('Game') as TestScene).cacheIn);
  expect(firstWait).toBeGreaterThanOrEqual(17.4);
  expect(firstWait).toBeLessThanOrEqual(35);
  const now = await freezeClock(page);
  await spawnCache(page, 'gold');
  await spawnCache(page, 'chrome');
  expect(await page.evaluate(() => (window.game.scene.getScene('Game') as TestScene).cacheKind)).toBe('gold');
  await setClock(page, now + 10_000);
  await collectCache(page);
  expect((await state(page)).scrap).toBe(0);
  const after = await page.evaluate(() => {
    const scene = window.game.scene.getScene('Game') as TestScene;
    return {
      pickup: scene.cachePickup,
      label: scene.cacheLabel,
      kind: scene.cacheKind,
      wait: scene.cacheIn,
      mult: window.game.registry.get('run').frenzyMult,
    };
  });
  expect(after.pickup).toBeNull();
  expect(after.label).toBeNull();
  expect(after.kind).toBeNull();
  expect(after.wait).toBeGreaterThanOrEqual(34.7);
  expect(after.wait).toBeLessThanOrEqual(70);
  expect(after.mult).toBe(1);
});

test('7→777・777→7無視・同倍率再取得・クローム即時報酬', async ({ page }) => {
  await start(page);
  const now = await freezeClock(page);
  await spawnCache(page, 'chrome');
  await collectCache(page);
  const effect = () =>
    page.evaluate(() => {
      const run = window.game.registry.get('run');
      return { mult: run.frenzyMult, end: run.frenzyEndsAtMs };
    });
  expect(await effect()).toEqual({ mult: 7, end: now + 20000 });
  await setClock(page, now + 1000);
  await spawnCache(page, 'gold');
  await collectCache(page);
  expect(await effect()).toEqual({ mult: 777, end: now + 21000 });
  await setClock(page, now + 2000);
  await spawnCache(page, 'chrome');
  await collectCache(page);
  expect(await effect()).toEqual({ mult: 777, end: now + 21000 });
  expect((await texts(page)).join(' ')).toContain('GOLD FRENZY CONTINUES!');
  await spawnCache(page, 'chrome');
  await collectCache(page, 0.25);
  expect((await state(page)).scrap).toBe(30);
  expect(await effect()).toEqual({ mult: 777, end: now + 21000 });
  await spawnCache(page, 'gold');
  await collectCache(page);
  expect(await effect()).toEqual({ mult: 777, end: now + 22000 });
  await setClock(page, now + 22000);
  await spawnCache(page, 'chrome');
  await collectCache(page);
  expect(await effect()).toEqual({ mult: 7, end: now + 42000 });
  await setClock(page, now + 23000);
  await spawnCache(page, 'chrome');
  await collectCache(page);
  expect(await effect()).toEqual({ mult: 7, end: now + 43000 });
});

test('装備・設備変更と砂嵐は通常採掘ルールを維持', async ({ page }) => {
  await fixture(page, { scrap: 10000, total: 10000 });
  await start(page);
  await freezeClock(page);
  await spawnCache(page, 'gold');
  await collectCache(page);
  await clickGame(page, 1000, 107); // pick
  await clickGame(page, 1000, 183); // scavenger
  const digPower = () => page.evaluate(() => (window.game.scene.getScene('Game') as TestScene).digPower);
  expect(await digPower()).toBeCloseTo((2 + 0.5 * 0.01) * 777);
  await page.evaluate(() => (window.game.scene.getScene('Game') as TestScene).startStorm());
  expect(await digPower()).toBeCloseTo((2 + 0.5 * 0.01) * 777);
});

test('ミュート抑止・マスター音量経路・視覚通知', async ({ page }) => {
  await start(page);
  await expect
    .poll(() => page.evaluate(() => (window.game.sound as Phaser.Sound.WebAudioSoundManager).context.state))
    .toBe('running');
  await page.evaluate(() => {
    const ctx = (window.game.sound as Phaser.Sound.WebAudioSoundManager).context;
    const original = ctx.createOscillator.bind(ctx);
    let count = 0;
    ctx.createOscillator = () => {
      count++;
      return original();
    };
    Object.assign(window, { goldVoices: () => count });
    window.game.sound.volume = 0.25;
  });
  const voices = () => page.evaluate(() => (window as unknown as { goldVoices(): number }).goldVoices());
  await page.keyboard.press('m');
  await nextFrame(page);
  const muted = await voices();
  await spawnCache(page, 'gold');
  await collectCache(page);
  expect(await voices()).toBe(muted);
  expect((await texts(page)).join(' ')).toContain('GOLD FRENZY!');
  await page.keyboard.press('m');
  await nextFrame(page);
  await spawnCache(page, 'gold');
  await collectCache(page);
  expect(await voices()).toBeGreaterThan(muted);
  const audio = await page.evaluate(() => {
    const sound = window.game.sound as Phaser.Sound.WebAudioSoundManager;
    return { volume: sound.masterVolumeNode.gain.value, music: sound.getAll('music').length };
  });
  expect(audio.volume).toBe(0.25);
  expect(audio.music).toBe(1);
});

test('保存後の再読み込み・新規ラン・所有権なしでは加算しない', async ({ page }) => {
  await fixture(page, { pick: 3, owned: [1, 0, 0, 0, 0, 0] });
  await start(page);
  await freezeClock(page);
  await spawnCache(page, 'gold');
  await collectCache(page);
  await page.keyboard.press('Space');
  const before = await state(page);
  await page.evaluate(() => (window.game.scene.getScene('Game') as TestScene & { save(): void }).save());
  await start(page);
  const after = await state(page);
  expect(after.scrap).toBeGreaterThanOrEqual(before.scrap);
  expect(after.pick).toBe(3);
  expect(after.owned).toEqual(before.owned);
  expect(await page.evaluate(() => window.game.registry.get('run').frenzyMult)).toBe(1);
  await freezeClock(page);
  await spawnCache(page, 'gold');
  const owned = await state(page);
  await page.evaluate(() => {
    window.game.registry.get('run').mode = 'blocked';
  });
  await page.keyboard.press('Space');
  await collectCache(page);
  expect((await state(page)).scrap).toBe(owned.scrap);
  expect(await page.evaluate(() => (window.game.scene.getScene('Game') as TestScene).cacheKind)).toBe('gold');
  await page.evaluate(() => {
    window.game.registry.get('run').mode = 'owned';
    window.game.scene.getScene('Game').scene.restart({ fresh: true });
  });
  await nextFrame(page);
  expect((await state(page)).pick).toBe(0);
  expect(await page.evaluate(() => window.game.registry.get('run').frenzyMult)).toBe(1);
});

test('20回のタイトル・勝利から再入場で一時状態と購読が増えない', async ({ page }) => {
  await start(page);
  await freezeClock(page);
  const baseline = await page.evaluate(() => {
    const scene = window.game.scene.getScene('Game');
    return { children: scene.children.length, keys: scene.input.keyboard?.listenerCount('keydown-SPACE') };
  });
  for (let i = 0; i < 20; i++) {
    await spawnCache(page, 'gold');
    await collectCache(page);
    await page.keyboard.press('Space');
    await spawnCache(page, 'gold');
    const before = await state(page);
    await page.evaluate(
      (i) =>
        window.game.scene
          .getScene('Game')
          .scene.start(i % 2 === 0 ? 'Title' : 'Victory', { time: 1, total: 100, clicks: 1 }),
      i,
    );
    await nextFrame(page);
    const target = i % 2 === 0 ? 'Title' : 'Victory';
    await page.evaluate((target) => window.game.scene.getScene(target).scene.start('Game'), target);
    await nextFrame(page);
    const sceneState = await page.evaluate(() => {
      const scene = window.game.scene.getScene('Game') as TestScene;
      return {
        mult: window.game.registry.get('run').frenzyMult,
        end: window.game.registry.get('run').frenzyEndsAtMs,
        pickup: scene.cachePickup,
        label: scene.cacheLabel,
        children: scene.children.length,
        keys: scene.input.keyboard?.listenerCount('keydown-SPACE'),
        tweenCount: scene.tweens.getTweens().length,
      };
    });
    expect(sceneState.mult).toBe(1);
    expect(sceneState.end).toBe(0);
    expect(sceneState.pickup).toBeNull();
    expect(sceneState.label).toBeNull();
    expect(sceneState.children).toBe(baseline.children);
    expect(sceneState.keys).toBe(baseline.keys);
    expect(sceneState.tweenCount).toBeLessThanOrEqual(2);
    expect((await state(page)).scrap).toBe(before.scrap);
    await page.evaluate(() => {
      const scene = window.game.scene.getScene('Game') as TestScene;
      scene.cacheIn = 1e9;
      scene.stormIn = 1e9;
    });
  }
});
